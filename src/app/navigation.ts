/**
 * Mô hình điều hướng dựa trên History API.
 *
 * Các entry chỉ đại diện cho màn hình; giao diện phủ lên màn hình không được
 * đẩy vào history. Các hàm thuần ở đây để kiểm thử quy tắc Back độc lập.
 */

import { navigationSection, normalizeScreen, type Screen } from './screen.ts';

export interface NavEntry {
  readonly midori: true;
  readonly screen: Screen;
}

/** Tạo entry cho một màn hình. */
export function navEntry(screen: Screen): NavEntry {
  return { midori: true, screen };
}

/**
 * Đọc một `history.state` không tin cậy thành `NavEntry`.
 *
 * Trả `null` cho state của ứng dụng khác, state rỗng, hoặc dữ liệu sai hình dạng.
 */
export function readNavEntry(state: unknown): NavEntry | null {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) return null;
  const value = state as Record<string, unknown>;
  if (value['midori'] !== true) return null;
  // `normalizeScreen` chấp nhận cả tên màn hình của phiên bản cũ: một entry lịch
  // sử được đẩy TRƯỚC khi ứng dụng cập nhật vẫn phải đọc được, thay vì bị coi là
  // dữ liệu lạ và làm nút Back rơi về Trang chủ.
  const screen = normalizeScreen(value['screen']);
  if (screen === null) return null;
  return { midori: true, screen };
}

/**
 * Màn hình cha khi ứng dụng được khôi phục thẳng vào một màn hình con.
 *
 * Màn con trở về ĐÚNG mục điều hướng sở hữu nó (Bài học và Kanji → Học, Thống kê
 * → Trang chủ, Trình biên tập → Cài đặt). Các tab gốc trở về Trang chủ — chỉ
 * Trang chủ là không còn gì phía sau, để nền tảng tự xử lý.
 */
export function backFallback(screen: Screen): Screen | null {
  const section = navigationSection(screen);
  if (section !== screen) return section;
  return screen === 'home' ? null : 'home';
}
