/**
 * Định nghĩa ba chủ đề của "Danh mục học" — nguồn duy nhất cho cả lối vào lẫn
 * tập thẻ của phiên ngẫu nhiên.
 *
 * Bảy nhóm Kanji là danh mục CỐ ĐỊNH của giáo trình (như 50 bài Minna), không
 * phải danh sách bộ có trong thư viện: nhóm chưa có nội dung vẫn phải hiện ra,
 * nếu không danh sách trông như lỗi. Vì vậy danh mục nằm ở đây, còn trạng thái
 * "có nội dung hay chưa" do `app.content` quyết định ở nơi hiển thị.
 */
export const KANJI_CATEGORIES: {
  readonly id: string;
  readonly deckId: string;
  readonly label: string;
  readonly description: string;
}[] = [
  {
    id: 'noun',
    deckId: 'kanji-noun',
    label: 'Danh từ',
    description: 'Người, vật, địa điểm, khái niệm.',
  },
  {
    id: 'verb',
    deckId: 'kanji-verb',
    label: 'Động từ',
    description: 'Động từ thường gặp.',
  },
  {
    id: 'i-adjective',
    deckId: 'kanji-i-adjective',
    label: 'Tính từ đuôi i',
    description: 'Tính từ kết thúc bằng い.',
  },
  {
    id: 'na-adjective',
    deckId: 'kanji-na-adjective',
    label: 'Tính từ đuôi na',
    description: 'Tính từ dùng với な.',
  },
  {
    id: 'adverb',
    deckId: 'kanji-adverb',
    label: 'Trạng từ',
    description: 'Bổ nghĩa cho hành động, trạng thái.',
  },
  {
    id: 'time-quantity',
    deckId: 'kanji-time-quantity',
    label: 'Thời gian & số lượng',
    description: 'Thời gian, số đếm, đơn vị.',
  },
  {
    id: 'sino-japanese-compound',
    deckId: 'kanji-sino-japanese-compound',
    label: 'Từ ghép Hán Nhật',
    description: 'Từ ghép dùng âm On.',
  },
];

export function isKanjiDeck(deckId: string): boolean {
  return deckId.toLowerCase().includes('kanji');
}

/**
 * Bộ thuộc "Danh mục học" — ba chủ đề hiển thị ở màn Học: Từ vựng, Kanji, Mẫu câu.
 *
 * Dùng chung cho lối vào danh mục và cho tập thẻ của phiên "Học ngẫu nhiên", nên
 * chỉ có một chỗ định nghĩa "ba chủ đề gồm những bộ nào".
 */
export function isStudyCatalogDeck(deckId: string): boolean {
  return deckId === 'vocabulary' || deckId === 'patterns' || isKanjiDeck(deckId);
}
