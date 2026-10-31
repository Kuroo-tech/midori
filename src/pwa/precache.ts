/**
 * Nhận biết precache của service worker **bị trình duyệt thu hồi**.
 *
 * # Vì sao cần
 *
 * Trình duyệt có quyền xoá Cache Storage để lấy lại dung lượng (DevTools →
 * Clear storage cũng vậy), nhưng **giữ lại** đăng ký service worker. Khi đó:
 *
 * - Workbox chỉ điền precache ở sự kiện `install` của service worker.
 *   Ở sự kiện `fetch`, một tài nguyên không có trong cache được lấy từ mạng
 *   và **không** được ghi lại (manifest không có `integrity`).
 * - `registration.update()` không chạy lại `install` khi `sw.js` không đổi
 *   (trình duyệt so sánh theo byte).
 *
 * Hệ quả nếu không xử lý: ứng dụng vẫn mở được khi có mạng, nhưng mãi mãi
 * không mở được khi ngoại tuyến cho tới lần deploy sau — mất khả năng ngoại
 * tuyến một cách **im lặng**, trong khi dữ liệu người học vẫn còn nguyên.
 *
 * Đường sửa: gỡ đăng ký rồi đăng ký lại — đăng ký mới **luôn** chạy `install`,
 * nên precache được điền lại từ mạng (xem `repairEvictedPrecache()` trong
 * `updates.ts`).
 *
 * # Hàm thuần
 *
 * Hàm này chỉ so sánh chuỗi để test được bằng `node --test`, đúng như cách
 * `version.ts` tách phần logic khỏi API của trình duyệt.
 */

/** Dấu hiệu nhận biết tên cache precache do Workbox sinh (`workbox-precache-v2-<scope>`). */
const PRECACHE_MARKER = 'precache';

/** Đường dẫn file khởi động — nếu mất hẳn thì ứng dụng không dựng lại được. */
const SHELL_PATH_SUFFIX = '/index.html';

/**
 * Precache có bị thu hồi hay không.
 *
 * @param cacheNames Tên mọi cache hiện có (đã bao gồm cache khác như runtime).
 * @param precacheEntryPaths Đường dẫn (`pathname`) các mục trong cache precache;
 *   truyền mảng rỗng nếu không tìm thấy cache precache.
 * @returns `true` nếu precache vắng, rỗng, hoặc thiếu `index.html` — tức là
 *   phải đăng ký lại service worker để chạy lại `install`.
 */
export function precacheIsEvicted(
  cacheNames: string[],
  precacheEntryPaths: string[],
): boolean {
  const hasPrecache = cacheNames.some((name) => name.includes(PRECACHE_MARKER));
  if (!hasPrecache) return true;
  return !precacheEntryPaths.some((path) => path.endsWith(SHELL_PATH_SUFFIX));
}
