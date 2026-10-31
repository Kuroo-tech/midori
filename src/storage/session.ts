/**
 * Phiên học đang dở, màn hình đang mở, và phạm vi Collection đang mở — lưu trong
 * store `meta` của IndexedDB **dữ liệu người dùng**.
 *
 * # Vì sao thuộc database người dùng
 *
 * Đây là trạng thái học của người dùng, không phải nội dung xuất bản. Nằm trong
 * database người dùng nghĩa là pipeline cập nhật nội dung **không thể** chạm tới
 * nó, kể cả khi có lỗi. Xem `docs/offline-and-updates.md`.
 *
 * # Vì sao chỉ lưu id thẻ, không lưu nội dung thẻ
 *
 * Một bản lưu chứa bản sao nội dung thẻ sẽ cũ đi sau mỗi lần cập nhật nội dung —
 * và tệ hơn, khi chấm điểm bản sao cũ đó sẽ bị ghi đè lên nội dung mới. Lưu id
 * rồi tra lại vào thư viện HIỆN TẠI khi khôi phục loại bỏ hẳn nhóm lỗi này.
 *
 * Việc **đối chiếu** id với thư viện (bỏ id đã biến mất, tính lại vị trí) do lõi
 * Rust làm (`session::restore`) — quy tắc nghiệp vụ chỉ tồn tại ở một chỗ.
 */

import type { SessionSnapshot } from '../core/index.ts';
import { normalizeCollectionScope, type CollectionScope } from '../app/collection.ts';
import { normalizeScreen, type Screen } from '../app/screen.ts';
import { META_KEYS, userDb } from './db.ts';

/** Chế độ học. Phải khớp `Mode` trong `Session.svelte`. */
export type StudyMode = 'flip' | 'type';
/**
 * Phạm vi thẻ của phiên.
 *
 * - `due` — thẻ tới hạn (giới hạn thẻ mới mỗi ngày);
 * - `weak` — thẻ chưa thuộc;
 * - `random` — bốc ngẫu nhiên từ cả ba chủ đề. Phiên này trộn nhiều bộ nên không
 *   có `deckId` thật; xem {@link MULTI_DECK_SESSION_ID}.
 */
export type StudyFocus = 'due' | 'weak' | 'random';

/**
 * Giá trị `deckId` của phiên trộn NHIỀU BỘ trong bản lưu.
 *
 * Hai loại phiên không có một `deckId` thật để ghi: "Học ngẫu nhiên" (bốc từ cả
 * ba chủ đề) và phiên toàn thư viện (phạm vi `all`). Dùng ký hiệu `*` — không thể
 * trùng tên bộ thật (id bộ do nội dung đặt), và `normalizeSession` chỉ chấp nhận
 * nó như một chuỗi không rỗng bình thường, nên bản lưu cũ/viết tay vẫn được xử lý
 * an toàn ở mọi trường hợp.
 */
export const MULTI_DECK_SESSION_ID = '*';

/**
 * Phiên học đang dở, đủ dữ liệu để dựng lại đúng trạng thái màn hình.
 *
 * Toàn bộ trường là dữ liệu phẳng, structured-clone được. Không bao giờ ghi
 * thẳng một đối tượng `$state` xuống đây — xem quy tắc bắt buộc trong `db.ts`.
 */
export interface PersistedSession extends SessionSnapshot {
  deckId: string;
  lesson?: number;
  mode: StudyMode;
  /** Lọc hàng đợi ban đầu; mặc định due để đọc được session cũ. */
  focus?: StudyFocus;
  /** Thẻ đang hỏi đã được lật chưa. */
  revealed: boolean;
  /** Số thẻ đã chấm trong phiên. */
  rated: number;
  /** Số lần trả lời chưa đúng trong phiên. */
  mistakes: number;
  /** Thời điểm lưu, ms kể từ epoch. */
  savedAt: number;
}

/**
 * Phiên học cũ hơn mức này sẽ không được khôi phục.
 *
 * Lý do: hàng đợi được dựng từ trạng thái "tới hạn NGAY BÂY GIỜ" lúc bắt đầu. Sau
 * một khoảng đủ dài, khôi phục nó sẽ khiến người học ôn những thẻ chưa tới hạn,
 * trong khi bỏ nó chỉ tốn một lần bấm "Bắt đầu". 12 giờ bao được đúng trường hợp
 * cần khôi phục — trang tự tải lại vì cập nhật ứng dụng, hoặc người dùng gấp máy
 * rồi mở lại — mà không giữ lại hàng đợi đã vô nghĩa.
 */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Đọc phiên đang dở. Trả `null` nếu không có, hỏng, hoặc đã quá cũ. */
export async function loadSession(now: number = Date.now()): Promise<PersistedSession | null> {
  const db = await userDb();
  return normalizeSession(await db.get('meta', META_KEYS.session), now);
}

/**
 * Ghi phiên đang dở.
 *
 * Bản ghi được dựng lại từng trường một thay vì sao chép đối tượng đầu vào. Đây
 * là quy tắc bắt buộc của `db.ts`: một mảng hoặc đối tượng đã bị `$state` bọc
 * thành Proxy sẽ làm hỏng giao dịch ghi IndexedDB.
 */
export async function saveSession(session: PersistedSession): Promise<void> {
  const record: PersistedSession = {
    deckId: session.deckId,
    lesson: session.lesson,
    mode: session.mode,
    focus: session.focus ?? 'due',
    queue: [...session.queue],
    index: session.index,
    revealed: session.revealed,
    rated: session.rated,
    mistakes: session.mistakes,
    savedAt: session.savedAt,
  };
  const db = await userDb();
  await db.put('meta', record, META_KEYS.session);
}

/** Return an explicit failure signal when persistence cannot be completed. */
export async function persistSessionSafely(
  session: PersistedSession,
  write: (value: PersistedSession) => Promise<void> = saveSession,
): Promise<boolean> {
  try {
    await write(session);
    return true;
  } catch {
    return false;
  }
}

/** Xoá phiên đang dở. Gọi khi phiên kết thúc hoặc khi bắt đầu phiên mới. */
export async function clearSession(): Promise<void> {
  const db = await userDb();
  await db.delete('meta', META_KEYS.session);
}

/** Đọc màn hình đang mở. Tên màn hình của phiên bản cũ được ánh xạ về màn hình hiện tại. */
export async function loadScreen(): Promise<Screen | null> {
  const db = await userDb();
  const raw: unknown = await db.get('meta', META_KEYS.screen);
  return normalizeScreen(raw);
}

/** Ghi màn hình đang mở. */
export async function saveScreen(screen: Screen): Promise<void> {
  const db = await userDb();
  await db.put('meta', screen, META_KEYS.screen);
}

/**
 * Đọc phạm vi Collection đang mở.
 *
 * Chỉ có ý nghĩa khi màn hình đang mở là `collection`, nhưng được lưu ở khoá
 * riêng để việc chọn phạm vi không phải viết lại cả bản ghi màn hình. Giá trị
 * hỏng trả `null` — nơi gọi rơi về phạm vi toàn thư viện.
 */
export async function loadCollectionScope(): Promise<CollectionScope | null> {
  const db = await userDb();
  const raw: unknown = await db.get('meta', META_KEYS.collectionScope);
  return normalizeCollectionScope(raw);
}

/**
 * Ghi phạm vi Collection đang mở.
 *
 * Bản ghi được dựng lại từng trường (không sao chép đối tượng đầu vào) theo đúng
 * quy tắc của `db.ts`: giá trị đi thẳng vào IndexedDB không được là Proxy của
 * `$state`.
 */
export async function saveCollectionScope(scope: CollectionScope): Promise<void> {
  const record: CollectionScope =
    scope.kind === 'all'
      ? { kind: 'all' }
      : scope.kind === 'deck'
        ? { kind: 'deck', deckId: scope.deckId }
        : { kind: 'lesson', deckId: scope.deckId, lesson: scope.lesson };
  const db = await userDb();
  await db.put('meta', record, META_KEYS.collectionScope);
}

/** Return an explicit failure signal when the last-screen preference cannot be saved. */
export type ScreenPersistenceResult =
  | { ok: true }
  | { ok: false; error: unknown };

export async function persistScreenSafely(
  screen: Screen,
  write: (value: Screen) => Promise<void> = saveScreen,
): Promise<ScreenPersistenceResult> {
  try {
    await write(screen);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Chuẩn hoá một bản lưu đọc từ đĩa — **hàm thuần, có kiểm thử**.
 *
 * Bản lưu là dữ liệu phụ: một bản ghi hỏng, do phiên bản cũ ghi, hoặc bị sửa tay
 * phải trở thành "không có phiên nào" — tuyệt đối không được làm ứng dụng không
 * dùng được. Vì vậy mọi trường đều được kiểm tra kiểu và bị bỏ qua nếu vô lý,
 * chứ không ném lỗi.
 *
 * @returns `null` nếu bản lưu không dùng được.
 */
export function normalizeSession(raw: unknown, now: number): PersistedSession | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;

  const deckId = value['deckId'];
  if (typeof deckId !== 'string' || deckId === '') return null;

  const lessonValue = value['lesson'];
  const lesson = typeof lessonValue === 'number' && Number.isFinite(lessonValue) ? Math.round(lessonValue) : undefined;

  const mode = value['mode'];
  if (mode !== 'flip' && mode !== 'type') return null;
  const focus = value['focus'];
  if (focus !== undefined && focus !== 'due' && focus !== 'weak' && focus !== 'random') return null;

  const queue = value['queue'];
  if (!Array.isArray(queue)) return null;
  const ids = queue.filter((id): id is string => typeof id === 'string' && id !== '');
  // Hàng đợi rỗng nghĩa là không có gì để khôi phục.
  if (ids.length === 0) return null;

  const savedAt = nonNegative(value['savedAt']);
  if (savedAt === null) return null;
  // Phiên quá cũ, hoặc mốc thời gian nằm ở tương lai (đồng hồ máy sai).
  if (now - savedAt > SESSION_TTL_MS || savedAt > now) return null;

  const index = nonNegative(value['index']) ?? 0;

  return {
    deckId,
    lesson,
    mode,
    focus: focus ?? 'due',
    queue: ids,
    index: Math.min(index, ids.length),
    revealed: value['revealed'] === true,
    rated: nonNegative(value['rated']) ?? 0,
    mistakes: nonNegative(value['mistakes']) ?? 0,
    savedAt,
  };
}

/** Số nguyên không âm hữu hạn, hoặc `null` nếu giá trị không dùng được. */
function nonNegative(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}
