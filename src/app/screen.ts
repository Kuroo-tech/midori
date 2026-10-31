/**
 * Màn hình của ứng dụng.
 *
 * Kiểu này nằm ở module **lá** (không import gì) vì hai lớp khác nhau đều cần nó:
 * `src/app/store.svelte.ts` để điều hướng, và `src/storage/session.ts` để lưu màn
 * hình đang mở. Nếu để nó trong lớp store, lớp lưu trữ sẽ phải import lớp store
 * trong khi lớp store đã import lớp lưu trữ — tạo phụ thuộc vòng.
 */

export const SCREENS = [
  'home',
  'lessons',
  'patterns',
  'kanji',
  'collection',
  'session',
  'stats',
  'editor',
  'transfer',
  'settings',
] as const;

export type Screen = (typeof SCREENS)[number];

/** Ba mục của điều hướng dưới — mỗi mục sở hữu một vùng chức năng riêng. */
export const SECTIONS = ['home', 'transfer', 'settings'] as const;

export type Section = (typeof SECTIONS)[number];

export function isScreen(value: unknown): value is Screen {
  return typeof value === 'string' && (SCREENS as readonly string[]).includes(value);
}

/**
 * Tên màn hình của phiên bản CŨ, ánh xạ về màn hình tương ứng hôm nay.
 *
 * Bảy màn hình Kanji riêng lẻ đã được gộp vào Collection: cùng một component,
 * khác phạm vi. Bản lưu màn hình và file backup ghi bằng phiên bản cũ vì vậy
 * không được biến thành lỗi — người học đang ở `kanji-noun` lúc cập nhật ứng
 * dụng sẽ quay về màn danh mục Kanji, nơi họ chọn lại đúng nhóm đó.
 */
const LEGACY_SCREEN_ALIASES: Record<string, Screen> = {
  // Màn "Học" đã gộp vào Trang chủ: nội dung chọn nội dung của nó nay nằm ngay
  // trên Trang chủ. Bản lưu màn hình hoặc entry lịch sử ghi `study` vì vậy được
  // đọc về Trang chủ thay vì bị coi là dữ liệu lạ.
  study: 'home',
  'kanji-noun': 'kanji',
  'kanji-verb': 'kanji',
  'kanji-i-adjective': 'kanji',
  'kanji-na-adjective': 'kanji',
  'kanji-adverb': 'kanji',
  'kanji-time-quantity': 'kanji',
  'kanji-sino-japanese-compound': 'kanji',
};

/**
 * Đọc một giá trị không tin cậy thành màn hình, chấp nhận cả tên màn hình CŨ.
 *
 * Dùng cho mọi nơi đọc màn hình từ nguồn ngoài (IndexedDB, `history.state`).
 * `null` nghĩa là "không nhận ra" — nơi gọi tự quyết định rơi về đâu.
 */
export function normalizeScreen(value: unknown): Screen | null {
  if (isScreen(value)) return value;
  if (typeof value === 'string') return LEGACY_SCREEN_ALIASES[value] ?? null;
  return null;
}

/**
 * Mỗi màn hình thuộc ĐÚNG một mục điều hướng.
 *
 * Màn con thừa hưởng mục của màn hình mở nó: Bài học, Mẫu câu, Kanji, Collection
 * và phiên học thuộc Trang chủ (vì mục Học đã gộp vào đó); Thống kê và Trình biên
 * tập thuộc Cài đặt (mục Thư viện của Trang chủ đã chuyển sang Cài đặt, và đó là
 * lối vào của cả hai). Nhờ vậy thanh điều hướng đánh dấu đúng vùng đang đứng, nút
 * Back trở về đúng vùng đó, và một chức năng không thể sống ở hai mục cùng lúc.
 *
 * `Record<Screen, Section>` là ràng buộc KIỂU: thêm màn hình mới vào `SCREENS` mà
 * quên xếp mục sẽ không biên dịch được, thay vì âm thầm rơi vào Trang chủ.
 */
const SECTION_OF: Record<Screen, Section> = {
  home: 'home',
  lessons: 'home',
  patterns: 'home',
  kanji: 'home',
  collection: 'home',
  session: 'home',
  stats: 'settings',
  editor: 'settings',
  transfer: 'transfer',
  settings: 'settings',
};

/** Mục điều hướng sở hữu một màn hình. */
export function navigationSection(screen: Screen): Section {
  return SECTION_OF[screen];
}
