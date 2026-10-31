/**
 * Thư viện thẻ của người học — CRUD trên IndexedDB dữ liệu người dùng.
 *
 * Mọi bản ghi đi qua và đi ra đều được **chuẩn hoá bằng lõi Rust**
 * (`cardsNormalize`) chứ không phải bằng code JavaScript. Nhờ vậy quy tắc đọc dữ
 * liệu cũ chỉ tồn tại ở MỘT chỗ, và dữ liệu nằm trong IndexedDB luôn đúng schema
 * hiện tại sau mỗi lần nạp.
 */

import {
  cardsNormalize,
  contentReconcile,
  deckPlanImport,
  type Card,
  type CardDraft,
  type ImportPlan,
  type ReconcileResult,
  type RejectedRecord,
} from '../core/index.ts';
import { RECOVERY_STORE, userDb, type RecoveryRecord } from './db.ts';

/** Kết quả nạp thư viện: phần đọc được và phần bị loại (nếu có). */
export interface LibraryLoad {
  cards: Card[];
  rejected: RejectedRecord[];
}

/**
 * Nạp toàn bộ thư viện.
 *
 * Bản ghi hỏng không làm hỏng cả thư viện: chúng được báo riêng trong `rejected`
 * để giao diện hiển thị. Bản ghi hợp lệ được ghi lại ở dạng đã chuẩn hoá, nên
 * việc di chuyển schema chỉ xảy ra một lần.
 */
export async function loadCards(now: number = Date.now()): Promise<LibraryLoad> {
  const db = await userDb();
  const [raw, keys] = await Promise.all([db.getAll('cards'), db.getAllKeys('cards')]);
  if (raw.length === 0) return { cards: [], rejected: [] };

  const { cards, rejected } = await cardsNormalize(raw, now);

  if (rejected.length > 0) {
    const tx = db.transaction(['cards', RECOVERY_STORE], 'readwrite');
    const done = tx.done;
    const writes: Promise<unknown>[] = [];
    try {
      const recovery = tx.objectStore(RECOVERY_STORE);
      const quarantinedAt = Date.now();
      for (const entry of rejected) {
        writes.push(
          (async () => {
            const record = raw[entry.index];
            const originalKey = keys[entry.index];
            if (record === undefined || originalKey === undefined) {
              throw new Error(`Không thể lưu bản ghi hỏng ở vị trí ${entry.index}`);
            }
            const value: RecoveryRecord = {
              originalKey,
              record,
              code: entry.code,
              message: entry.message,
              quarantinedAt,
            };
            await recovery.add(value);
            await tx.objectStore('cards').delete(originalKey);
          })(),
        );
      }
      await Promise.all([...writes, done]);
    } catch (cause) {
      await abortTransaction(tx, writes, done);
      throw cause;
    }
  }

  return { cards, rejected };
}

/** Đọc các bản ghi được cách ly, giữ nguyên giá trị gốc để xuất cứu hộ. */
export async function loadRecoveryRecords(): Promise<RecoveryRecord[]> {
  const db = await userDb();
  return db.getAll(RECOVERY_STORE);
}

/** Đọc nhanh số lượng thẻ mà không cần chuẩn hoá. */
export async function countCards(): Promise<number> {
  const db = await userDb();
  return db.count('cards');
}

export async function putCard(card: Card): Promise<void> {
  const db = await userDb();
  await db.put('cards', card);
}

export async function putCards(cards: Card[]): Promise<void> {
  if (cards.length === 0) return;
  const db = await userDb();
  const tx = db.transaction('cards', 'readwrite');
  await Promise.all([...cards.map((card) => tx.store.put(card)), tx.done]);
}

export async function deleteCard(id: string): Promise<void> {
  const db = await userDb();
  await db.delete('cards', id);
}

/** Xoá toàn bộ thư viện. Cần người dùng xác nhận ở lớp giao diện. */
export async function clearCards(): Promise<void> {
  const db = await userDb();
  await db.clear('cards');
}

/**
 * Thay thư viện và metadata học tập trong cùng một giao dịch.
 *
 * Dữ liệu đầu vào phải được xác thực và chuẩn hoá trước khi gọi. Nếu bất kỳ
 * request nào thất bại, IndexedDB hủy cả giao dịch và giữ nguyên thư viện cũ.
 */
export async function replaceUserLibrary(
  cards: Card[],
  metadata: Record<string, unknown>,
): Promise<void> {
  const db = await userDb();
  const tx = db.transaction(['cards', 'meta'], 'readwrite');
  const done = tx.done;
  const writes: Promise<unknown>[] = [];
  try {
    const cardStore = tx.objectStore('cards');
    const metaStore = tx.objectStore('meta');
    writes.push(cardStore.clear());
    for (const card of cards) writes.push(cardStore.put(card));
    for (const [key, value] of Object.entries(metadata)) writes.push(metaStore.put(value, key));
    await Promise.all([...writes, done]);
  } catch (cause) {
    await abortTransaction(tx, writes, done);
    throw cause;
  }
}

/** Lưu một bộ đối chiếu nội dung cùng thư viện trong cùng giao dịch. */
export async function commitContentReconciliation(
  cards: Card[],
  contentVersion: string,
  cardIdsByDeck: Record<string, string[]>,
): Promise<void> {
  const db = await userDb();
  const tx = db.transaction(['cards', 'meta'], 'readwrite');
  const done = tx.done;
  const writes: Promise<unknown>[] = [];
  try {
    const cardStore = tx.objectStore('cards');
    const ids: Record<string, string[]> = {};
    for (const [deckId, deckCardIds] of Object.entries(cardIdsByDeck)) {
      ids[deckId] = [...deckCardIds];
    }
    for (const card of cards) writes.push(cardStore.put(card));
    writes.push(tx.objectStore('meta').put(contentVersion, 'contentVersion'));
    writes.push(tx.objectStore('meta').put(ids, 'contentCardIds'));
    await Promise.all([...writes, done]);
  } catch (cause) {
    await abortTransaction(tx, writes, done);
    throw cause;
  }
}

/**
 * Nhập thẻ mới từ nháp.
 *
 * Việc bỏ trùng do lõi Rust quyết định, và thẻ đã có **không bao giờ bị ghi đè**:
 * nhập lại cùng một file không làm mất tiến độ học.
 */
export async function importDrafts(
  existing: Card[],
  drafts: CardDraft[],
  deckId: string,
  now: number = Date.now(),
): Promise<ImportPlan> {
  const ids = drafts.map(() => crypto.randomUUID());
  const plan = await deckPlanImport(existing, drafts, deckId, ids, now);
  await putCards(plan.fresh);
  return plan;
}

async function abortTransaction(
  tx: { abort: () => void },
  writes: Promise<unknown>[],
  done: Promise<unknown>,
): Promise<void> {
  try {
    tx.abort();
  } catch {
    // The transaction may already have aborted on its own.
  }
  await Promise.allSettled([...writes, done]);
}

/**
 * Đồng bộ nội dung xuất bản vào thư viện người học.
 *
 * Đây là CẦU NỐI DUY NHẤT giữa nội dung xuất bản và dữ liệu người học. Nó:
 * - cập nhật 4 trường nội dung của thẻ đã có, giữ nguyên lịch SRS;
 * - thêm thẻ mới ở trạng thái chưa học;
 * - **không xoá** thẻ đã biến mất khỏi nội dung — chỉ trả về danh sách `orphaned`.
 *
 * @param previousIds id thẻ của phiên bản nội dung đang dùng trước lần này.
 */
export async function applyContent(
  cards: Card[],
  content: CardDraft[],
  previousIds: string[],
  deckId: string,
  now: number = Date.now(),
): Promise<ReconcileResult> {
  const result = await contentReconcile(cards, content, previousIds, deckId, now);
  await putCards([...result.updated, ...result.fresh]);
  return result;
}
