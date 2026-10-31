import type { Card, NormalizedCards, SrsState } from '../core/types.ts';
import { normalizeCollectionScope, type CollectionScope } from '../app/collection.ts';
import { normalizeScreen, type Screen } from '../app/screen.ts';
import { normalizeSession, SESSION_TTL_MS, type PersistedSession } from './session.ts';
import { normalizeSettings, type AppSettings, type ContentSyncState } from './settings.ts';

export const BACKUP_FORMAT = 'midori-personal-backup';
export const BACKUP_VERSION = 1;

export interface BackupOptions {
  includeProgress: boolean;
  cards: Card[];
  settings: AppSettings;
  contentSync: ContentSyncState;
  screen: Screen;
  session: PersistedSession | null;
  /** Phạm vi Collection đang mở; chỉ đi kèm khi bản sao lưu có tiến độ. */
  collectionScope?: CollectionScope;
}

export interface ParsedBackup {
  /** Thời điểm tạo bản sao lưu trong file (ms kể từ epoch). */
  createdAt: number;
  includeProgress: boolean;
  cards: Array<Omit<Card, 'srs'> & { srs?: SrsState }>;
  settings: AppSettings;
  contentSync: ContentSyncState;
  screen: Screen;
  session: PersistedSession | null;
  sessionExpired: boolean;
  /** `null` khi bản sao lưu không mang phạm vi (bản cũ) — nơi gọi dùng mặc định. */
  collectionScope: CollectionScope | null;
}

export function createBackup(options: BackupOptions): string {
  const cards = options.cards.map((card) => {
    const { srs, ...content } = card;
    return options.includeProgress ? { ...content, srs } : content;
  });
  return `${JSON.stringify(
    {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: Date.now(),
      includeProgress: options.includeProgress,
      cards,
      settings: options.settings,
      contentSync: options.contentSync,
      screen: options.includeProgress && options.session !== null ? options.screen : 'home',
      session: options.includeProgress ? options.session : null,
      collectionScope: options.includeProgress ? (options.collectionScope ?? null) : null,
    },
    null,
    2,
  )}\n`;
}

export function parseBackup(text: string, now: number = Date.now()): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    throw new Error('File backup không phải JSON hợp lệ.', { cause });
  }
  if (!isObject(raw)) throw new Error('File backup phải là một đối tượng JSON.');
  if (raw['format'] !== BACKUP_FORMAT) throw new Error('Đây không phải file backup cá nhân của Midori.');
  if (raw['version'] !== BACKUP_VERSION) throw new Error('Phiên bản file backup không được hỗ trợ.');
  if (!isFiniteNumber(raw['createdAt'])) throw new Error('File backup thiếu thời điểm tạo hợp lệ.');

  const includeProgress = raw['includeProgress'];
  if (typeof includeProgress !== 'boolean') throw new Error('File backup thiếu lựa chọn tiến độ hợp lệ.');

  const inputCards = raw['cards'];
  if (!Array.isArray(inputCards)) throw new Error('File backup thiếu danh sách thẻ.');
  const cards = inputCards.map((entry, index) => validateCard(entry, index, includeProgress));
  const ids = new Set<string>();
  for (const card of cards) {
    if (ids.has(card.id)) throw new Error(`File backup có id thẻ trùng: ${card.id}`);
    ids.add(card.id);
  }

  if (!isValidSettings(raw['settings'])) throw new Error('Cài đặt trong file backup không hợp lệ.');
  if (!isValidContentSync(raw['contentSync'])) {
    throw new Error('Thông tin đồng bộ nội dung trong file backup không hợp lệ.');
  }
  const screen = normalizeScreen(raw['screen']);
  if (screen === null) throw new Error('Màn hình trong file backup không hợp lệ.');

  // Phạm vi Collection là dữ liệu PHỤ: bản sao lưu cũ không có trường này, và một
  // giá trị hỏng chỉ làm nơi khôi phục rơi về phạm vi toàn thư viện — không đáng
  // để từ chối cả file. (Khác `screen`: một màn hình không đọc được nghĩa là file
  // không thuộc về phiên bản này, còn phạm vi chỉ là ngữ cảnh điều hướng.)
  const collectionScope = normalizeCollectionScope(raw['collectionScope']);

  let session: PersistedSession | null = null;
  let sessionExpired = false;
  if (includeProgress && raw['session'] !== null && raw['session'] !== undefined) {
    if (!isValidSessionRecord(raw['session'])) {
      throw new Error('Phiên học trong file backup không hợp lệ.');
    }
    const savedAt = raw['session']['savedAt'];
    if (!isSafeInteger(savedAt) || savedAt < 0 || savedAt > now) {
      throw new Error('Phiên học trong file backup không hợp lệ.');
    }
    if (now - savedAt > SESSION_TTL_MS) {
      sessionExpired = true;
    } else {
      session = normalizeSession(raw['session'], now);
      if (session === null) throw new Error('Phiên học trong file backup không hợp lệ.');
    }
  } else if (!includeProgress && raw['session'] != null) {
    throw new Error('Backup không bao gồm tiến độ nhưng lại chứa phiên học.');
  }

  return {
    createdAt: Number(raw['createdAt']),
    includeProgress,
    cards,
    settings: normalizeSettings(raw['settings']),
    contentSync: raw['contentSync'],
    screen,
    session,
    sessionExpired,
    collectionScope,
  };
}

export async function validateAndCommitBackup(
  text: string,
  dependencies: {
    normalizeCards: (records: unknown[], now: number) => Promise<NormalizedCards>;
    commit: (cards: Card[], metadata: Record<string, unknown>) => Promise<void>;
    now?: number;
  },
): Promise<{ backup: ParsedBackup; cards: Card[] }> {
  const now = dependencies.now ?? Date.now();
  const backup = parseBackup(text, now);
  const normalized = await dependencies.normalizeCards(backup.cards, now);
  if (normalized.rejected.length > 0 || normalized.cards.length !== backup.cards.length) {
    throw new Error('Backup chứa thẻ không hợp lệ; thư viện hiện tại chưa bị thay đổi.');
  }
  await dependencies.commit(normalized.cards, backupMetadata(backup));
  return { backup, cards: normalized.cards };
}

export function backupMetadata(backup: ParsedBackup): Record<string, unknown> {
  return {
    settings: backup.settings,
    contentVersion: backup.contentSync.contentVersion,
    contentCardIds: backup.contentSync.cardIdsByDeck,
    screen: backup.screen,
    session: backup.session,
    ...(backup.includeProgress && backup.collectionScope !== null
      ? { collectionScope: backup.collectionScope }
      : {}),
  };
}

function validateCard(
  value: unknown,
  index: number,
  includeProgress: boolean,
): Omit<Card, 'srs'> & { srs?: SrsState } {
  if (!isObject(value)) throw new Error(`Thẻ ${index + 1} trong backup không phải đối tượng.`);
  const id = requiredString(value['id'], 'id', index);
  const deckId = requiredString(value['deckId'], 'deckId', index);
  const front = requiredString(value['front'], 'front', index);
  const back = requiredString(value['back'], 'back', index);
  // `furigana` và `romaji` là trường nội dung TUỲ CHỌN ở mọi đường khác (Editor,
  // CSV, nội dung xuất bản: `patterns` có thẻ romaji rỗng), và lõi khai báo chúng
  // `#[serde(default)]`. Đòi chúng khác rỗng ở đây làm cả file sao lưu bị từ chối vì
  // một thẻ không có cách đọc — tức người dùng không khôi phục được bản sao lưu của
  // chính mình. Cổng kiểm tra cấu trúc phải khớp với schema thẻ.
  const furigana = optionalText(value['furigana'], 'furigana', index);
  const romaji = optionalText(value['romaji'], 'romaji', index);
  const rawTags = value['tags'];
  if (!Array.isArray(rawTags) || !rawTags.every(isString)) {
    throw new Error(`Danh sách tags của thẻ ${index + 1} không hợp lệ.`);
  }
  const tags = rawTags;
  if (!isSafeInteger(value['createdAt'])) {
    throw new Error(`Thời điểm tạo thẻ ${index + 1} không hợp lệ.`);
  }
  const lesson = value['lesson'];
  if (lesson !== undefined && (!Number.isInteger(lesson) || Number(lesson) < 1 || Number(lesson) > 50)) {
    throw new Error(`Bài Minna của thẻ ${index + 1} không hợp lệ.`);
  }

  let srs: SrsState | undefined;
  if (includeProgress) {
    if (!isValidSrs(value['srs'])) throw new Error(`Tiến độ SRS của thẻ ${index + 1} không hợp lệ.`);
    srs = value['srs'];
  } else if (value['srs'] !== undefined) {
    throw new Error('Backup không bao gồm tiến độ nhưng chứa trạng thái SRS.');
  }

  return {
    id,
    deckId,
    front,
    back,
    furigana,
    romaji,
    tags,
    ...(lesson === undefined ? {} : { lesson: Number(lesson) }),
    createdAt: Number(value['createdAt']),
    ...(srs === undefined ? {} : { srs }),
  };
}

function isValidSrs(value: unknown): value is SrsState {
  if (!isObject(value)) return false;
  if (
    !isFiniteNumber(value['ease']) ||
    Number(value['ease']) <= 0 ||
    !isFiniteNumber(value['interval']) ||
    !Number.isInteger(value['interval']) ||
    Number(value['interval']) < 0 ||
    Number(value['interval']) > 0xffff_ffff ||
    !isFiniteNumber(value['repetitions']) ||
    !Number.isInteger(value['repetitions']) ||
    Number(value['repetitions']) < 0 ||
    Number(value['repetitions']) > 0xffff_ffff ||
    !isFiniteNumber(value['lapses']) ||
    !Number.isInteger(value['lapses']) ||
    Number(value['lapses']) < 0 ||
    Number(value['lapses']) > 0xffff_ffff ||
    !isSafeInteger(value['due'])
  ) {
    return false;
  }
  const rating = value['lastRating'];
  const wrongAt = value['lastWrongAt'];
  const score = value['lastScore'];
  return (
    (rating === undefined || ['again', 'hard', 'good', 'easy'].includes(String(rating))) &&
    (wrongAt === undefined || isSafeInteger(wrongAt)) &&
    // Điểm lần trả lời là trường MỚI; bản backup cũ thiếu nó là hợp lệ, nhưng giá
    // trị hỏng thì phải bị từ chối ở đây — đây là cổng kiểm tra trước khi ghi, và
    // nó không được mở đường cho dữ liệu mà lõi phải tự chống đỡ.
    (score === undefined || (isFiniteNumber(score) && Number(score) >= 0 && Number(score) <= 1))
  );
}

function isValidSettings(value: unknown): value is AppSettings {
  if (!isObject(value)) return false;
  return (
    (value['theme'] === 'light' || value['theme'] === 'dark' || value['theme'] === 'auto') &&
    isSafeInteger(value['dailyNewLimit']) &&
    Number(value['dailyNewLimit']) >= 0 &&
    Number(value['dailyNewLimit']) <= 500 &&
    typeof value['shuffleByDefault'] === 'boolean'
  );
}

function isValidContentSync(value: unknown): value is ContentSyncState {
  if (!isObject(value)) return false;
  const version = value['contentVersion'];
  const ids = value['cardIdsByDeck'];
  return (
    (version === null || typeof version === 'string') &&
    isObject(ids) &&
    Object.values(ids).every(
      (deckIds) => Array.isArray(deckIds) && deckIds.every((id) => typeof id === 'string'),
    )
  );
}

function isValidSessionRecord(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  const queue = value['queue'];
  const lesson = value['lesson'];
  return (
    typeof value['deckId'] === 'string' &&
    value['deckId'] !== '' &&
    (value['mode'] === 'flip' || value['mode'] === 'type') &&
    (value['focus'] === undefined ||
      value['focus'] === 'due' ||
      value['focus'] === 'weak' ||
      value['focus'] === 'random') &&
    Array.isArray(queue) &&
    queue.length > 0 &&
    queue.every((id) => typeof id === 'string' && id !== '') &&
    isSafeInteger(value['index']) &&
    value['index'] >= 0 &&
    typeof value['revealed'] === 'boolean' &&
    isSafeInteger(value['rated']) &&
    value['rated'] >= 0 &&
    isSafeInteger(value['mistakes']) &&
    value['mistakes'] >= 0 &&
    isSafeInteger(value['savedAt']) &&
    (lesson === undefined ||
      (isSafeInteger(lesson) && lesson >= 1 && lesson <= 50))
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function requiredString(value: unknown, field: string, index: number): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`Thẻ ${index + 1} thiếu trường "${field}" hợp lệ.`);
  }
  return value;
}

/**
 * Trường chuỗi TUỲ CHỌN: vắng mặt hoặc rỗng là hợp lệ, sai KIỂU thì bị từ chối.
 *
 * Sự khoan dung này không mở đường cho dữ liệu xấu: `validateAndCommitBackup` còn
 * cho toàn bộ thẻ đi qua `cardsNormalize` của lõi trước khi ghi, và từ chối cả file
 * nếu lõi loại bất kỳ thẻ nào. Ở đây chỉ cần đúng việc: kiểm KIỂU và cấu trúc.
 */
function optionalText(value: unknown, field: string, index: number): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') {
    throw new Error(`Thẻ ${index + 1} có trường "${field}" sai kiểu.`);
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
