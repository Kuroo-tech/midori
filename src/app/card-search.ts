/**
 * Tìm thẻ theo văn bản — bản JS của quy tắc tìm kiếm trong lõi Rust.
 *
 * NGUỒN SỰ THẬT là `matches_query` trong `crates/midori-core/src/stats.rs`: khớp
 * chuỗi con, không phân biệt hoa thường, trên front/back/furigana/romaji và tags;
 * truy vấn rỗng (hoặc toàn dấu cách) nghĩa là không lọc.
 *
 * # Vì sao không gọi `cardsFilter` của lõi cho mỗi phím gõ
 *
 * Mỗi lần gọi phải tuần tự hoá TOÀN BỘ thư viện thành JSON rồi mới qua biên WASM,
 * nên gõ phím trong một thư viện vài nghìn thẻ sẽ giật; lọc trên mảng đã có sẵn
 * trong bộ nhớ thì tức thời. Hai bên được giữ khớp bằng test:
 * `tests/card-search.test.ts` chạy đúng các ca của test Rust
 * (`search_matches_all_text_fields_and_tags`).
 */

import type { Card } from '../core/index.ts';

/**
 * Thẻ có khớp truy vấn không.
 *
 * Chỉ nhận các trường văn bản — thẻ chưa lưu (nháp trong trình biên tập) vẫn
 * dùng được hàm này.
 */
export function cardMatchesQuery(
  card: Pick<Card, 'front' | 'back' | 'furigana' | 'romaji' | 'tags'>,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return (
    card.front.toLowerCase().includes(needle) ||
    card.back.toLowerCase().includes(needle) ||
    card.furigana.toLowerCase().includes(needle) ||
    card.romaji.toLowerCase().includes(needle) ||
    card.tags.some((tag) => tag.toLowerCase().includes(needle))
  );
}
