/**
 * Phạm vi nội dung của một Collection — màn hình quản lý và bắt đầu phiên học.
 *
 * Kiểu này nằm ở module **lá** vì ba lớp khác nhau đều cần nó: lớp điều phối
 * (`store.svelte.ts`) để mở Collection, lớp lưu trữ (`storage/session.ts`,
 * `storage/backup.ts`) để khôi phục lại đúng phạm vi sau khi tải lại trang, và
 * lớp giao diện để dựng tiêu đề, thống kê, bộ lọc.
 *
 * # Vì sao chỉ có ba dạng phạm vi
 *
 * Ba dạng này phủ ĐÚNG ba cách người học chọn nội dung trong ứng dụng:
 *
 * - `all` — toàn thư viện (Trang chủ, hàng "Tất cả nội dung" ở màn Học);
 * - `deck` — một bộ (nhóm Kanji, Mẫu câu, Từ vựng, hoặc bộ do người học tạo);
 * - `lesson` — một bài Minna trong bộ Từ vựng.
 *
 * Không có dạng nào khác vì không có lối vào nào khác: mỗi bài học, mỗi nhóm
 * Kanji đều ánh xạ thẳng về một trong ba dạng trên, nên Collection chỉ cần một
 * component chứ không cần một màn hình cho từng bài.
 */

/** Phạm vi nội dung của Collection. */
export type CollectionScope =
  | { kind: 'all' }
  | { kind: 'deck'; deckId: string }
  | { kind: 'lesson'; deckId: string; lesson: number };

/**
 * Chuẩn hoá một phạm vi đọc từ đĩa hoặc từ bản sao lưu — **hàm thuần**.
 *
 * Dữ liệu này là trạng thái phụ: một bản ghi hỏng phải trở thành "không có phạm
 * vi" (`null`) để nơi gọi rơi về mặc định, tuyệt đối không được ném lỗi.
 * `lesson` giới hạn 1..50 theo đúng giới hạn của bộ Từ vựng.
 */
export function normalizeCollectionScope(value: unknown): CollectionScope | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const scope = value as Record<string, unknown>;
  if (scope['kind'] === 'all') return { kind: 'all' };

  const deckId = scope['deckId'];
  if (typeof deckId !== 'string' || deckId === '') return null;

  if (scope['kind'] === 'deck') return { kind: 'deck', deckId };

  if (scope['kind'] === 'lesson') {
    const lesson = scope['lesson'];
    if (typeof lesson !== 'number' || !Number.isInteger(lesson) || lesson < 1 || lesson > 50) {
      return null;
    }
    return { kind: 'lesson', deckId, lesson };
  }

  return null;
}

/** Hai phạm vi có trỏ tới cùng một tập thẻ không. */
export function sameCollectionScope(a: CollectionScope, b: CollectionScope): boolean {
  if (a.kind === 'all' || b.kind === 'all') return a.kind === b.kind;
  if (a.deckId !== b.deckId) return false;
  if (a.kind === 'deck') return b.kind === 'deck';
  return b.kind === 'lesson' && a.lesson === b.lesson;
}
