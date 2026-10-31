/**
 * Quy tắc của phiên "Học ngẫu nhiên" — phần thuần, có kiểm thử.
 *
 * Hai quy tắc nghiệp vụ được kiểm ở đây, không phải chi tiết giao diện:
 *
 * - `isStudyCatalogDeck` quyết định thẻ nào thuộc danh mục (và vì vậy nằm trong
 *   tập bốc thăm);
 * - `randomDrawSize` quyết định bốc bao nhiêu thẻ: đúng bằng "thẻ mới tối đa mỗi
 *   ngày" trong Cài đặt, nhưng không vượt quá số thẻ đang có.
 *
 * Việc TRỘN do lõi Rust làm (`sessionShuffle`) nên thứ tự bốc không được kiểm ở
 * đây — một bản JS tự trộn sẽ là nguồn sự thật thứ hai cho cùng một việc.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isStudyCatalogDeck } from '../src/app/content-sections.ts';
import { randomDrawSize } from '../src/app/random-study.ts';

test('bốc đúng bằng giới hạn thẻ mới mỗi ngày', () => {
  assert.equal(randomDrawSize(5000, 20), 20);
  assert.equal(randomDrawSize(5000, 1), 1);
});

test('thư viện nhỏ hơn giới hạn thì bốc hết, không lặp thẻ', () => {
  assert.equal(randomDrawSize(7, 20), 7);
  assert.equal(randomDrawSize(0, 20), 0);
});

test('giới hạn 0 nghĩa là không bốc thẻ nào', () => {
  assert.equal(randomDrawSize(100, 0), 0);
});

test('giá trị rác quay về 0 thay vì tạo hàng đợi vô lý', () => {
  assert.equal(randomDrawSize(100, Number.NaN), 0);
  assert.equal(randomDrawSize(100, Number.POSITIVE_INFINITY), 0);
  assert.equal(randomDrawSize(100, -5), 0);
  assert.equal(randomDrawSize(Number.NaN, 20), 0);
  assert.equal(randomDrawSize(-10, 20), 0);
});

test('giới hạn không nguyên được làm tròn về số nguyên', () => {
  assert.equal(randomDrawSize(100, 20.4), 20);
  assert.equal(randomDrawSize(100, 20.6), 21);
});

test('danh mục học gồm đúng Từ vựng, Kanji và Mẫu câu', () => {
  assert.equal(isStudyCatalogDeck('vocabulary'), true);
  assert.equal(isStudyCatalogDeck('patterns'), true);
  assert.equal(isStudyCatalogDeck('kanji-noun'), true);
  assert.equal(isStudyCatalogDeck('kanji-sino-japanese-compound'), true);
  // Bộ do người dùng nhập/nhận không thuộc danh mục.
  assert.equal(isStudyCatalogDeck('bo-cua-toi'), false);
  assert.equal(isStudyCatalogDeck('vocabulary-reading'), false);
  assert.equal(isStudyCatalogDeck(''), false);
});
