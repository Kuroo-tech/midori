/**
 * Kiểm thử mô hình điều hướng (history entry + Back/Home).
 *
 * Đây là lớp quyết định hành vi của nút Back hệ điều hành và của nút Quay lại
 * trên các màn hình con. Sai ở đây khiến người dùng thoát ứng dụng giữa lúc học,
 * nên các quy tắc thuần phải được khoá bằng test.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { backFallback, navEntry, readNavEntry } from '../src/app/navigation.ts';
import { SCREENS, isScreen, normalizeScreen } from '../src/app/screen.ts';

test('entry màn hình mang đủ dấu nhận diện và màn hình', () => {
  assert.deepEqual(navEntry('lessons'), { midori: true, screen: 'lessons' });
});

test('readNavEntry chấp nhận entry màn hình do ứng dụng tạo', () => {
  for (const screen of SCREENS) {
    assert.deepEqual(readNavEntry(navEntry(screen)), { midori: true, screen });
  }
});

test('readNavEntry từ chối dữ liệu lạ thay vì ném lỗi', () => {
  const bad: unknown[] = [
    null,
    undefined,
    42,
    'home',
    true,
    [],
    {},
    { midori: false, screen: 'home' },
    { midori: true },
    { midori: true, screen: 'không-tồn-tại' },
    { midori: true, screen: 7 },
  ];
  for (const value of bad) {
    assert.equal(readNavEntry(value), null, `đầu vào: ${JSON.stringify(value)}`);
  }
});

test('readNavEntry chỉ đọc màn hình, bỏ qua trường cũ không liên quan', () => {
  assert.deepEqual(readNavEntry({ midori: true, screen: 'kanji', overlay: true }), {
    midori: true,
    screen: 'kanji',
  });
});

test('màn hình con quay về ĐÚNG mục điều hướng sở hữu nó', () => {
  // Bài học, Mẫu câu, Kanji, Collection và Phiên học thuộc Trang chủ (mục Học đã
  // gộp vào đó); Thống kê và Trình biên tập thuộc Cài đặt (mục Thư viện của Trang
  // chủ đã chuyển sang Cài đặt). Mục chứa màn con cũng chính là màn mà tab dưới
  // đánh dấu.
  assert.equal(backFallback('lessons'), 'home');
  assert.equal(backFallback('patterns'), 'home');
  assert.equal(backFallback('kanji'), 'home');
  assert.equal(backFallback('collection'), 'home');
  assert.equal(backFallback('session'), 'home');
  assert.equal(backFallback('stats'), 'settings');
  assert.equal(backFallback('editor'), 'settings');
});

test('tab gốc quay về Trang chủ khi không còn lịch sử phía sau', () => {
  assert.equal(backFallback('transfer'), 'home');
  assert.equal(backFallback('settings'), 'home');
});

test('ở Trang chủ không còn gì để quay lại — để nền tảng xử lý', () => {
  assert.equal(backFallback('home'), null);
});

test('màn hình hợp lệ gồm cả tầng Collection và Phiên học', () => {
  for (const screen of ['home', 'lessons', 'patterns', 'kanji', 'collection', 'session', 'stats'] as const) {
    assert.equal(isScreen(screen), true);
  }
  assert.equal(isScreen('unknown'), false);
});

test('tên màn hình của bản cũ được ánh xạ về màn hình hôm nay', () => {
  // Màn "Học" đã gộp vào Trang chủ: bản lưu màn hình hoặc entry lịch sử ghi
  // `study` được đọc về `home` thay vì bị coi là dữ liệu lạ.
  assert.equal(normalizeScreen('study'), 'home');
  assert.equal(readNavEntry({ midori: true, screen: 'study' })?.screen, 'home');
  // Bảy màn Kanji riêng lẻ đã gộp vào màn danh mục + Collection. Bản lưu màn hình
  // và entry lịch sử ghi bằng bản cũ không được biến thành lỗi.
  for (const legacy of [
    'kanji-noun',
    'kanji-verb',
    'kanji-i-adjective',
    'kanji-na-adjective',
    'kanji-adverb',
    'kanji-time-quantity',
    'kanji-sino-japanese-compound',
  ]) {
    assert.equal(normalizeScreen(legacy), 'kanji');
    assert.equal(readNavEntry({ midori: true, screen: legacy })?.screen, 'kanji');
  }
  // Đọc lại về `null` với dữ liệu thật sự lạ, để nơi gọi tự chọn chỗ rơi về.
  assert.equal(normalizeScreen('không-tồn-tại'), null);
  assert.equal(normalizeScreen(7), null);
});
