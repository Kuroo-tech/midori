/**
 * Cài đặt người dùng và các mốc đồng bộ, lưu trong store `meta`.
 *
 * Giá trị đọc lên luôn được kiểm tra kiểu: một cài đặt hỏng trong IndexedDB
 * không được phép làm ứng dụng không khởi động được.
 */

import { META_KEYS, userDb } from './db.ts';

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface AppSettings {
  theme: ThemeMode;
  /** Số thẻ MỚI tối đa mỗi ngày. Thẻ đã học tới hạn không bị giới hạn. */
  dailyNewLimit: number;
  /** Trộn thứ tự hàng đợi khi bắt đầu phiên học. */
  shuffleByDefault: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'auto',
  dailyNewLimit: 20,
  shuffleByDefault: false,
};

/** Số thẻ mới tối đa cho phép — chặn giá trị vô lý từ dữ liệu cũ. */
export const MAX_DAILY_NEW_LIMIT = 500;

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await userDb();
  return (await db.get('meta', key)) as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await userDb();
  await db.put('meta', value, key);
}

export async function loadSettings(): Promise<AppSettings> {
  return normalizeSettings(await getMeta<unknown>(META_KEYS.settings));
}

/**
 * Trạng thái đồng bộ giữa nội dung xuất bản và thư viện người học.
 *
 * `cardIdsByDeck` là danh sách id thẻ của phiên bản nội dung ĐÃ đồng bộ, theo
 * từng bộ. Cần lưu lại vì lần đồng bộ sau phải phân biệt được "thẻ do nội dung
 * quản lý nay đã bị bỏ" với "thẻ do người dùng tự tạo trong cùng bộ".
 */
export interface ContentSyncState {
  contentVersion: string | null;
  cardIdsByDeck: Record<string, string[]>;
}

export async function loadContentSync(): Promise<ContentSyncState> {
  const version = await getMeta<unknown>(META_KEYS.contentVersion);
  const ids = await getMeta<unknown>(META_KEYS.contentCardIds);
  return {
    contentVersion: typeof version === 'string' ? version : null,
    cardIdsByDeck: isStringArrayMap(ids) ? ids : {},
  };
}

export async function saveContentSync(state: ContentSyncState): Promise<void> {
  // Dựng lại thành mảng phẳng trước khi ghi: IndexedDB chỉ nhận dữ liệu
  // structured-clone được, và một mảng bị bọc Proxy của framework sẽ làm hỏng
  // giao dịch. Rẻ hơn nhiều so với việc gỡ lỗi `DataCloneError` về sau.
  const cardIdsByDeck: Record<string, string[]> = {};
  for (const [deckId, ids] of Object.entries(state.cardIdsByDeck)) {
    cardIdsByDeck[deckId] = [...ids];
  }
  await setMeta(META_KEYS.contentVersion, state.contentVersion);
  await setMeta(META_KEYS.contentCardIds, cardIdsByDeck);
}

function isStringArrayMap(value: unknown): value is Record<string, string[]> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every(
    (entry) => Array.isArray(entry) && entry.every((id) => typeof id === 'string'),
  );
}

/** Ghi đè một phần cài đặt, trả về giá trị đã chuẩn hoá sau khi ghi. */
export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = normalizeSettings({ ...(await loadSettings()), ...patch });
  await setMeta(META_KEYS.settings, next);
  return next;
}

/** Chuẩn hoá cài đặt đọc từ đĩa — hàm thuần, có kiểm thử. */
export function normalizeSettings(raw: unknown): AppSettings {
  const value = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  const theme = value['theme'];
  const limit = value['dailyNewLimit'];
  const shuffle = value['shuffleByDefault'];

  return {
    theme:
      theme === 'light' || theme === 'dark' || theme === 'auto' ? theme : DEFAULT_SETTINGS.theme,
    dailyNewLimit:
      typeof limit === 'number' && Number.isFinite(limit) && limit >= 0
        ? Math.min(Math.round(limit), MAX_DAILY_NEW_LIMIT)
        : DEFAULT_SETTINGS.dailyNewLimit,
    shuffleByDefault: typeof shuffle === 'boolean' ? shuffle : DEFAULT_SETTINGS.shuffleByDefault,
  };
}
