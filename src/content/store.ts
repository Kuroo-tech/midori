/**
 * Lưu trữ **nội dung xuất bản** — IndexedDB riêng, tách khỏi dữ liệu người dùng.
 *
 * Ba ngăn (slot):
 * - `active`   — nội dung đang dùng để học
 * - `staging`  — nội dung đã tải và xác minh, chưa kích hoạt
 * - `previous` — nội dung đang dùng trước lần kích hoạt gần nhất (để phục hồi)
 *
 * {@link createContentStore} cung cấp `promote()` chạy trong MỘT giao dịch
 * IndexedDB. Giao dịch của IndexedDB là nguyên tử: hoặc cả ba thao tác cùng xảy
 * ra, hoặc không thao tác nào — nên không tồn tại trạng thái "nội dung cũ đã bị
 * xoá nhưng nội dung mới chưa sẵn sàng" (đặc tả §7.3).
 */

import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ActiveContent, ContentStore } from './types.ts';

export const CONTENT_DB_NAME = 'midori-content';
export const CONTENT_DB_VERSION = 1;

type Slot = 'active' | 'staging' | 'previous';

interface MidoriContentDB extends DBSchema {
  slots: {
    key: Slot;
    value: ActiveContent;
  };
}

let connection: Promise<IDBPDatabase<MidoriContentDB>> | null = null;

function contentDb(): Promise<IDBPDatabase<MidoriContentDB>> {
  connection ??= openDB<MidoriContentDB>(CONTENT_DB_NAME, CONTENT_DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore('slots');
      }
    },
  });
  return connection;
}

/** Đóng kết nối. Dùng khi cần giải phóng hoặc trong kiểm thử. */
export async function closeContentDb(): Promise<void> {
  if (connection === null) return;
  const db = await connection;
  db.close();
  connection = null;
}

/** Xoá hoàn toàn database nội dung. Chỉ dùng trong kiểm thử. */
export async function deleteContentDb(): Promise<void> {
  await closeContentDb();
  await deleteDB(CONTENT_DB_NAME);
}

/** Bản dùng thật, gắn với IndexedDB của trình duyệt. */
export function createContentStore(): ContentStore {
  return {
    async readActive() {
      const db = await contentDb();
      return (await db.get('slots', 'active')) ?? null;
    },

    async readPrevious() {
      const db = await contentDb();
      return (await db.get('slots', 'previous')) ?? null;
    },

    async readStaging() {
      const db = await contentDb();
      return (await db.get('slots', 'staging')) ?? null;
    },

    async writeStaging(content) {
      const db = await contentDb();
      await db.put('slots', content, 'staging');
    },

    async promote() {
      const db = await contentDb();
      const tx = db.transaction('slots', 'readwrite');
      const staging = await tx.store.get('staging');
      if (staging === undefined) {
        await tx.done;
        return false;
      }
      const active = await tx.store.get('active');
      if (active !== undefined) {
        await tx.store.put(active, 'previous');
      }
      await tx.store.put(staging, 'active');
      await tx.store.delete('staging');
      await tx.done;
      return true;
    },

    async clearStaging() {
      const db = await contentDb();
      await db.delete('slots', 'staging');
    },

    async rollback() {
      const db = await contentDb();
      const tx = db.transaction('slots', 'readwrite');
      const previous = await tx.store.get('previous');
      if (previous === undefined) {
        await tx.done;
        return false;
      }
      await tx.store.put(previous, 'active');
      await tx.store.delete('previous');
      await tx.done;
      return true;
    },
  };
}
