/**
 * IndexedDB **dữ liệu người dùng** của Midori.
 *
 * Chỉ chứa những gì thuộc về người học: thẻ, lịch SRS, cài đặt, mốc đồng bộ.
 * Nội dung xuất bản nằm ở database RIÊNG (`src/content/store.ts`) — nhờ đó
 * pipeline cập nhật nội dung không thể chạm vào dữ liệu người học dù có lỗi.
 *
 * Schema được đánh phiên bản và nâng cấp tăng dần. Bản ghi cũ luôn đọc được:
 * việc chuẩn hoá bản ghi do lõi Rust làm (`cardsNormalize`), ở đây chỉ lo phần
 * lưu trữ.
 *
 * # Quy tắc bắt buộc: chỉ ghi dữ liệu PHẲNG
 *
 * IndexedDB truyền dữ liệu qua `structured clone`, và **Proxy không clone được**.
 * `$state` của Svelte 5 bọc sâu mọi đối tượng được gán vào thành Proxy, nên bất kỳ
 * giá trị nào đi từ trạng thái giao diện xuống đây đều phải dùng `$state.raw`
 * (hoặc `$state.snapshot()` trước khi ghi).
 *
 * Vi phạm quy tắc này gây `DataCloneError: [object Array] could not be cloned` —
 * lỗi đã gặp thật khi chấm điểm thẻ. Triệu chứng dễ đánh lừa: giao dịch hỏng nhưng
 * giao diện vẫn hiển thị đúng, vì trạng thái trong bộ nhớ đã cập nhật trước đó.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Card } from '../core/types.ts';

/** Tên database dữ liệu người dùng. */
export const USER_DB_NAME = 'midori';

/** Phiên bản schema hiện tại. Tăng khi thêm store/index. */
export const USER_DB_VERSION = 2;

/** Khoá meta dùng trong store `meta`. */
export const META_KEYS = {
  settings: 'settings',
  deckNames: 'deckNames',
  /** Id thẻ của phiên bản nội dung đang kích hoạt — cần cho việc đồng bộ. */
  contentCardIds: 'contentCardIds',
  /** Phiên bản nội dung đã đồng bộ vào thư viện. */
  contentVersion: 'contentVersion',
  /** Phiên học đang dở, để khôi phục sau khi tải lại trang. */
  session: 'session',
  /** Màn hình đang mở, để tải lại trang không mất ngữ cảnh. */
  screen: 'screen',
  /** Phạm vi nội dung của Collection, đi kèm `screen = 'collection'`. */
  collectionScope: 'collectionScope',
} as const;

export const RECOVERY_STORE = 'recovery';

export interface RecoveryRecord {
  originalKey: IDBValidKey;
  record: unknown;
  code: string;
  message: string;
  quarantinedAt: number;
}

interface MidoriUserDB extends DBSchema {
  cards: {
    key: string;
    value: Card;
    indexes: { 'by-deck': string };
  };
  meta: {
    key: string;
    value: unknown;
  };
  recovery: {
    key: number;
    value: RecoveryRecord;
  };
}

let connection: Promise<IDBPDatabase<MidoriUserDB>> | null = null;

/** Mở (và nâng cấp nếu cần) database dữ liệu người dùng. */
export function userDb(): Promise<IDBPDatabase<MidoriUserDB>> {
  connection ??= openDB<MidoriUserDB>(USER_DB_NAME, USER_DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        const cards = database.createObjectStore('cards', { keyPath: 'id' });
        cards.createIndex('by-deck', 'deckId');
        database.createObjectStore('meta');
      }
      if (oldVersion < 2) {
        database.createObjectStore(RECOVERY_STORE, { autoIncrement: true });
      }
    },
  });
  return connection;
}

/** Đóng kết nối. Dùng khi cần giải phóng hoặc trong kiểm thử. */
export async function closeUserDb(): Promise<void> {
  if (connection === null) return;
  const db = await connection;
  db.close();
  connection = null;
}
