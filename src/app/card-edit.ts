/**
 * Ghép nháp sửa thẻ vào thẻ đang có — quy tắc áp nháp thuần JS.
 *
 * NGUỒN SỰ THẬT cho phần nội dung là `Card::apply_draft` trong
 * `crates/midori-core/src/card.rs`: trường nào nháp khai báo thì lấy từ nháp (đã
 * cắt khoảng trắng), trường nào thiếu thì giữ nguyên từ thẻ. Nháp ở đây là
 * `Partial<CardDraft>` nên vẫn dùng được cho lời gọi chỉ muốn đụng vài trường.
 *
 * # Riêng `lesson` phân biệt "thiếu khoá" với "khoá mang giá trị undefined"
 *
 * Trình biên tập LUÔN gửi đủ khoá `lesson`; ô "Bài Minna" để trống nghĩa là
 * người dùng muốn XOÁ bài, chứ không phải "không đụng tới". Với chuỗi thì hai ý
 * này tách được (`''` khác `undefined`), nhưng `lesson` là số nên `undefined` là
 * cách duy nhất để nói "xoá". Bởi vậy `lesson` dùng `'lesson' in draft`: khoá có
 * mặt — kể cả khi giá trị là `undefined` — thì lấy đúng giá trị đó; thiếu khoá
 * mới giữ của thẻ. Dùng chung `draft.lesson ?? card.lesson` như các trường khác
 * sẽ khiến xoá ô bài là việc không đời nào làm được (đây từng là lỗi thật).
 *
 * Lõi Rust vẫn có quy tắc riêng: nháp thiếu `lesson` ⇒ suy từ tag ("bài 3"…)
 * trong `text::lesson_from_tags`, nên xoá ô bài mà tag còn nói bài N thì thẻ vẫn
 * thuộc bài N — đồng nhất với lúc tạo/nhập thẻ.
 *
 * `tests/card-edit.test.ts` giữ hàm này khớp với lõi qua WASM thật.
 */

import type { Card, CardDraft } from '../core/index.ts';

/** Phần thẻ mà nháp sửa được đụng tới. */
export type EditableCard = Pick<
  Card,
  'front' | 'back' | 'furigana' | 'romaji' | 'tags' | 'lesson'
>;

/** Áp nháp sửa lên thẻ, trả về nội dung sẵn sàng cho `cardApplyDraft`. */
export function mergeCardDraft(card: EditableCard, draft: Partial<CardDraft>): CardDraft {
  return {
    front: draft.front?.trim() ?? card.front,
    back: draft.back?.trim() ?? card.back,
    furigana: draft.furigana?.trim() ?? card.furigana,
    romaji: draft.romaji?.trim() ?? card.romaji,
    tags: Array.isArray(draft.tags)
      ? draft.tags.map((tag) => tag.trim()).filter(Boolean)
      : card.tags,
    lesson: 'lesson' in draft ? draft.lesson : card.lesson,
  };
}
