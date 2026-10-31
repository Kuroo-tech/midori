/**
 * Kiểm thử nhận biết precache bị thu hồi.
 *
 * Sai ở đây nghĩa là hoặc application tự gỡ service worker không cần thiết
 * (mất khả năng ngoại tuyến giữa hai lần đăng ký), hoặc — tệ hơn — không
 * bao giờ phục hồi sau khi trình duyệt xoá Cache Storage.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

import { precacheIsEvicted } from '../src/pwa/precache.ts';

const PRECACHE = 'workbox-precache-v2-http://127.0.0.1:4173/';
const HEALTHY_ENTRIES = [
  '/index.html',
  '/assets/index-DLAZg39C.js',
  '/assets/index-EzeGb8dO.css',
  '/assets/midori_wasm_bg-DpAUYUIr.wasm',
];

test('precache còn đủ thì không đụng tới', () => {
  assert.equal(precacheIsEvicted([PRECACHE], HEALTHY_ENTRIES), false);
});

test('không còn cache nào (trình duyệt thu hồi sạch) → cần cài lại', () => {
  assert.equal(precacheIsEvicted([], []), true);
});

test('cache precache tồn tại nhưng rỗng → cần cài lại', () => {
  assert.equal(precacheIsEvicted([PRECACHE], []), true);
});

test('precache có mục nhưng mất index.html → cần cài lại', () => {
  assert.equal(
    precacheIsEvicted(
      [PRECACHE],
      ['/assets/index-DLAZg39C.js', '/assets/index-EzeGb8dO.css'],
    ),
    true,
  );
});

test('cache khác còn đó nhưng không có precache → vẫn coi là bị thu hồi', () => {
  assert.equal(
    precacheIsEvicted(['workbox-runtime-http://127.0.0.1:4173/'], []),
    true,
  );
});

test('đường dẫn index.html có query số bản vẫn được nhận ra', () => {
  // Workbox lưu index.html dưới khoá có `?__WB_REVISION__=…`; người gọi chỉ
  // truyền `pathname`, nhưng test này chốt rõ query không được làm lệch kết quả.
  const path = new URL('http://127.0.0.1:4173/index.html?__WB_REVISION__=abc')
    .pathname;
  assert.equal(precacheIsEvicted([PRECACHE], [path]), false);
});

/**
 * Mọi tệp của bản dựng phải nằm trong precache.
 *
 * Đây là bất biến dễ vỡ nhất khi màn hình được tách thành gói riêng: một gói không
 * được precache thì màn hình đó **vẫn chạy khi đang trực tuyến** (nó tải qua mạng)
 * nhưng hỏng khi ngoại tuyến — tức là lỗi chỉ lộ ra ở đúng tình huống mà ứng dụng
 * được thiết kế để phục vụ.
 *
 * Chỉ chạy khi đã có `dist/` (cần `npm run build`), vì `npm run check` cố ý không
 * sinh sản phẩm dựng. Khi không có, test tự khai báo là BỎ QUA chứ không đánh dấu
 * đạt — xem `docs/verification.md`.
 */
test('mọi gói của bản dựng đều được precache (cần dist/)', () => {
  const dist = new URL('../dist/', import.meta.url);
  const swPath = new URL('sw.js', dist);
  if (!existsSync(swPath)) {
    console.log('BỎ QUA: chưa có dist/sw.js — chạy `npm run build` rồi chạy lại test này.');
    return;
  }

  const urls = [...readFileSync(swPath, 'utf8').matchAll(/url:\s*"([^"]+)"/g)]
    .map((match) => match[1])
    .filter((url): url is string => url !== undefined);
  assert.ok(urls.length > 0, 'không đọc được mục nào từ danh sách precache');

  const assets = readdirSync(new URL('assets/', dist)).filter((name) =>
    /\.(js|css|wasm)$/.test(name),
  );
  assert.ok(assets.length > 0, 'bản dựng không có tệp JS/CSS/WASM nào');

  for (const name of assets) {
    assert.ok(
      urls.includes(`assets/${name}`),
      `tệp ${name} không được precache — ngoại tuyến sẽ hỏng`,
    );
  }
  // Danh sách precache không được trỏ tới tệp không tồn tại (dấu hiệu cache cũ).
  for (const url of urls.filter((value) => value.startsWith('assets/'))) {
    assert.ok(existsSync(new URL(url, dist)), `precache trỏ tới ${url} nhưng tệp không có`);
  }
  // Nội dung xuất bản do pipeline riêng quản lý — KHÔNG được lẫn vào precache ứng dụng.
  assert.equal(
    urls.some((url) => url.includes('/data/content/')),
    false,
    'nội dung xuất bản không được precache cùng ứng dụng',
  );
  assert.ok(urls.includes('index.html'), 'thiếu index.html');
});
