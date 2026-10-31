/**
 * Điểm vào của ứng dụng — và là **nơi duy nhất** được biết cả hai lớp.
 *
 * Nhiệm vụ: gắn giao diện vào DOM, biến mọi lỗi khởi động thành một thông báo đọc
 * được thay vì màn hình trắng, và cắm bộ nạp màn hình của lớp giao diện vào lớp
 * điều phối.
 *
 * # Vì sao việc cắm này nằm ở đây
 *
 * Màn hình được nạp theo nhu cầu (`src/ui/screens.ts`), nhưng thứ tự khởi động do
 * lớp điều phối quyết định — và gói của màn hình đầu tiên phải có trước khi giao
 * diện hiện ra. Hai lớp không được import lẫn nhau, nên lớp điều phối khai báo một
 * cổng (`app.screenLoader`) và điểm vào cắm hàm thật vào đó.
 */

import { mount } from 'svelte';

import './app.css';
import { app } from './app/store.svelte.ts';
import { type Screen } from './app/screen.ts';
import App from './ui/App.svelte';
import { loadScreen, prefetchScreens } from './ui/screens.ts';

app.screenLoader = loadScreen;
app.screenPrefetcher = (current) => prefetchScreens(PREFETCH_ORDER, current);

/**
 * Thứ tự nạp trước: ba tab chính trước (đó là những nơi người dùng thật sự đi
 * tiếp), rồi các màn hình mở từ Trang chủ và Cài đặt.
 *
 * Cố ý KHÔNG nạp trước cả 9 màn hình ngay: mỗi yêu cầu là một lượt trên mạng, và
 * Collection / Phiên học chỉ có nghĩa sau khi người dùng đã chọn nội dung.
 */
const PREFETCH_ORDER: Screen[] = [
  'transfer',
  'settings',
  'home',
  'lessons',
  'stats',
  'editor',
  'kanji',
  'collection',
  'session',
];

const target = document.getElementById('app');
if (target === null) {
  throw new Error('Không tìm thấy phần tử #app trong index.html');
}

mount(App, { target });
