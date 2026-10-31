/**
 * Ghép nháp sửa thẻ — kiểm thử lớp ghép JS và đường thật qua WASM.
 *
 * Ca trung tâm là lỗi từng tồn tại: XOÁ ô "Bài Minna" trong trình biên tập không
 * có tác dụng. Trình biên tập gửi `lesson: undefined` (khoá vẫn có mặt), nhưng
 * nếu lớp ghép dùng `draft.lesson ?? card.lesson` như các trường khác thì
 * `undefined` bị hiểu thành "giữ nguyên" và bài cũ không đời nào bị xoá.
 * `mergeCardDraft` phân biệt hai ý này bằng `'lesson' in draft`; test khoá hành
 * vi đó cả ở lớp ghép thuần lẫn qua lõi Rust thật (nạp WASM bằng bytes, như
 * `wasm-contract.test.ts`).
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { mergeCardDraft, type EditableCard } from '../src/app/card-edit.ts';
import { cardApplyDraft, cardMake, type CardDraft } from '../src/core/index.ts';
import { loadCoreFrom } from '../src/core/wasm.ts';

const T0 = 1_700_000_000_000;
const WASM = new URL('../src/generated/midori-wasm/midori_wasm_bg.wasm', import.meta.url);

await loadCoreFrom(await readFile(WASM));

function card(extras: Partial<EditableCard> = {}): EditableCard {
  return {
    front: 'Xin chào',
    back: 'こんにちは',
    furigana: '',
    romaji: 'konnichiwa',
    tags: [],
    lesson: 5,
    ...extras,
  };
}

/**
 * Nháp đủ khoá đúng như `toDraft` của trình biên tập gửi xuống.
 *
 * `lesson: undefined` ở đây là khoá CÓ MẶT mang giá trị undefined — khác hẳn
 * nháp thiếu khoá (như `{ front: … }`), vốn nghĩa là không đụng tới bài.
 */
function editorDraft(extras: Partial<CardDraft> = {}): CardDraft {
  return {
    front: 'Xin chào',
    back: 'こんにちは',
    furigana: '',
    romaji: 'konnichiwa',
    tags: [],
    lesson: undefined,
    ...extras,
  };
}

// ── Lớp ghép thuần ────────────────────────────────────────────────────────

test('khoá lesson mang undefined nghĩa là XOÁ bài, không phải giữ nguyên', () => {
  const merged = mergeCardDraft(card({ lesson: 12 }), editorDraft({ lesson: undefined }));
  assert.equal(merged.lesson, undefined);
  // Lõi Serde đọc thiếu khoá thành None — JSON phải bỏ hẳn khoá đi.
  assert.equal('lesson' in JSON.parse(JSON.stringify(merged)), false);
});

test('thiếu hẳn khoá lesson mới là giữ nguyên bài của thẻ', () => {
  const merged = mergeCardDraft(card({ lesson: 12 }), { front: 'Tạm biệt' });
  assert.equal(merged.lesson, 12);
});

test('lesson có trong nháp thì lấy đúng giá trị nháp', () => {
  const merged = mergeCardDraft(card({ lesson: 12 }), editorDraft({ lesson: 7 }));
  assert.equal(merged.lesson, 7);
});

test('trường văn bản cắt khoảng trắng; trường thiếu giữ nguyên của thẻ', () => {
  const merged = mergeCardDraft(card(), {
    front: '  Tạm biệt  ',
    tags: [' bài 3 ', '  ', 'n5'],
  });
  assert.equal(merged.front, 'Tạm biệt');
  assert.equal(merged.back, 'こんにちは');
  assert.equal(merged.romaji, 'konnichiwa');
  assert.deepEqual(merged.tags, ['bài 3', 'n5']);
});

// ── Qua lõi WASM thật ─────────────────────────────────────────────────────

test('xoá bài rồi lưu: thẻ hết bài, giữ nguyên id và lịch SRS', async () => {
  const made = await cardMake(editorDraft({ lesson: 5 }), 'id-1', 'vocabulary', T0);
  assert.equal(made.lesson, 5);

  const updated = await cardApplyDraft(
    made,
    mergeCardDraft(made, editorDraft({ lesson: undefined })),
  );
  assert.equal(updated.id, made.id);
  assert.equal(updated.lesson, undefined);
  assert.equal(updated.createdAt, made.createdAt);
  assert.deepEqual(updated.srs, made.srs);
});

test('xoá bài nhưng tag còn nói bài N thì lõi suy lại bài N', async () => {
  const made = await cardMake(editorDraft({ lesson: 5 }), 'id-2', 'vocabulary', T0);
  const updated = await cardApplyDraft(
    made,
    mergeCardDraft(made, editorDraft({ lesson: undefined, tags: ['bài 3'] })),
  );
  assert.equal(updated.lesson, 3);
});

test('nháp không nhắc tới lesson: giữ nguyên bài cũ', async () => {
  const made = await cardMake(editorDraft({ lesson: 5 }), 'id-3', 'vocabulary', T0);
  const updated = await cardApplyDraft(made, mergeCardDraft(made, { front: 'Tạm biệt' }));
  assert.equal(updated.lesson, 5);
  assert.equal(updated.front, 'Tạm biệt');
  assert.equal(updated.back, 'こんにちは');
});
