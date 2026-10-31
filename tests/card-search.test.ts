/**
 * Tìm thẻ theo văn bản — bản JS phải khớp TỪNG CA với lõi Rust.
 *
 * NGUỒN SỰ THẬT là `matches_query` trong `crates/midori-core/src/stats.rs`, và các
 * ca dưới đây được sao lại từ test `search_matches_all_text_fields_and_tags` bên đó
 * (cùng một thư viện mẫu: "Xin chào", "Tạm biệt", "Bạn là ai?" với romaji chung
 * "romaji-"). Trình biên tập thẻ lọc ngay trong bộ nhớ thay vì gọi `cardsFilter`
 * mỗi phím gõ — lý do ở `src/app/card-search.ts`. Nếu hai bên lệch nhau, cùng một
 * từ khoá sẽ cho kết quả khác nhau tùy ngã rẽ của mã; test này giữ chúng khớp.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cardMatchesQuery } from '../src/app/card-search.ts';
import type { Card } from '../src/core/index.ts';

type SearchableCard = Pick<Card, 'front' | 'back' | 'furigana' | 'romaji' | 'tags'>;

function card(
  front: string,
  back: string,
  extras: Partial<SearchableCard> = {},
): SearchableCard {
  return { front, back, furigana: '', romaji: 'romaji-', tags: [], ...extras };
}

const CARDS: SearchableCard[] = [
  card('Xin chào', 'こんにちは', { tags: ['nhóm chào hỏi'] }),
  card('Tạm biệt', 'さようなら'),
  card('Bạn là ai?', 'だれですか'),
];

/** Chỉ số các thẻ khớp — tương đương kết quả `filter_ids` của lõi. */
function search(query: string): number[] {
  return CARDS.flatMap((entry, index) => (cardMatchesQuery(entry, query) ? [index] : []));
}

test('khớp mặt trước, không phân biệt hoa thường', () => {
  assert.deepEqual(search('xin'), [0]);
  assert.deepEqual(search('XIN CHÀO'), [0]);
});

test('khớp mặt sau (chữ Nhật)', () => {
  assert.deepEqual(search('こんにちは'), [0]);
});

test('khớp trường romaji của mọi thẻ', () => {
  assert.deepEqual(search('romaji-'), [0, 1, 2]);
});

test('khớp tag, không phân biệt hoa thường', () => {
  assert.deepEqual(search('chào hỏi'), [0]);
  assert.deepEqual(search('NHÓM CHÀO'), [0]);
});

test('khớp furigana', () => {
  const cards = [card('Cảm ơn', 'ありがとう', { furigana: 'ありがとう' })];
  assert.equal(cardMatchesQuery(cards[0]!, 'りがと'), true);
});

test('không khớp thì không trả về thẻ nào', () => {
  assert.deepEqual(search('không tồn tại'), []);
});

test('truy vấn rỗng hoặc toàn dấu cách nghĩa là không lọc', () => {
  // Cùng hành vi với lõi: `search("   ")` trong test Rust trả về cả ba thẻ.
  assert.deepEqual(search(''), [0, 1, 2]);
  assert.deepEqual(search('   '), [0, 1, 2]);
});

test('khoảng trắng hai đầu truy vấn được bỏ qua', () => {
  assert.deepEqual(search('  xin  '), [0]);
});
