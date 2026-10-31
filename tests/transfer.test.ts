/**
 * Kiểm thử luật đọc file và chọn phạm vi của màn Nhập/xuất.
 *
 * `src/app/transfer.ts` gọi mô-đun WASM THẬT (qua `deckParse`), nên test này bao
 * luôn ranh giới Rust ↔ JavaScript: số bản ghi bị bỏ qua được đếm ở Rust và chỉ
 * được hiển thị ở đây — nếu hai bên lệch nhau, người dùng sẽ thấy một con số sai
 * trước khi bấm Nhập.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadCoreFrom } from '../src/core/wasm.ts';
import { cardsMake, type Card, type Quiz } from '../src/core/index.ts';
import {
  countCards,
  readImportFile,
  scopeLabel,
  selectExportGroups,
  type TransferContext,
} from '../src/app/transfer.ts';
import { KANJI_CATEGORIES } from '../src/app/content-sections.ts';

const wasmBytes = await import('node:fs/promises').then((fs) =>
  fs.readFile(new URL('../src/generated/midori-wasm/midori_wasm_bg.wasm', import.meta.url)),
);
await loadCoreFrom(wasmBytes);

const T0 = 1_700_000_000_000;

function context(overrides: Partial<TransferContext> = {}): TransferContext {
  return {
    section: 'vocabulary',
    lesson: 'all',
    kanjiDeckId: KANJI_CATEGORIES[0]!.deckId,
    kanjiScope: 'single',
    quizForDeck: (deckId: string): Quiz => (deckId.startsWith('kanji-') ? 'reading' : 'meaning'),
    deckName: (deckId: string) => (deckId === 'vocabulary' ? 'Từ vựng Minna' : deckId),
    ...overrides,
  };
}

const VOCABULARY_CSV = [
  'front,back,furigana,romaji,tags',
  'Xin chào,こんにちは,こんにちは,konnichiwa,bài 3',
  'Tạm biệt,さようなら,さようなら,sayounara,',
  '',
].join('\n');

// ── Gán phạm vi ────────────────────────────────────────────────────────────

test('chọn một bài thì gán cả file vào bài đó, kể cả thẻ đã có số bài khác', async () => {
  const read = await readImportFile(VOCABULARY_CSV, 'tu.csv', context({ lesson: '3' }));
  assert.equal(read.batches.length, 1);
  assert.deepEqual(
    read.batches[0]!.drafts.map((draft) => draft.lesson),
    [3, 3],
  );
  assert.equal(read.skippedRecords, 0);
});

test('toàn bộ từ vựng giữ số bài trên từng thẻ, thiếu bài thì từ chối cả file', async () => {
  // Thẻ thứ hai không có bài: cột tags rỗng ⇒ không đủ điều kiện nhập toàn bộ.
  await assert.rejects(
    () => readImportFile(VOCABULARY_CSV, 'tu.csv', context({ lesson: 'all' })),
    /cần có bài từ 1 đến 50/,
  );
});

test('toàn bộ từ vựng nhận file có đủ số bài cho mọi thẻ', async () => {
  const csv = 'front,back,furigana,romaji,tags\nXin chào,こんにちは,,,bài 1\nTạm biệt,さようなら,,,bài 2\n';
  const read = await readImportFile(csv, 'tu.csv', context({ lesson: 'all' }));
  assert.deepEqual(
    read.batches[0]!.drafts.map((draft) => draft.lesson),
    [1, 2],
  );
});

test('bài ngoài khoảng 1–50 bị từ chối thay vì nhập vào bài sai', async () => {
  const csv = 'front,back,furigana,romaji,tags\nXin chào,こんにちは,,,bài 51\n';
  await assert.rejects(() => readImportFile(csv, 'tu.csv', context({ lesson: 'all' })), /1 đến 50/);
});

test('Kanji bỏ trường bài Minna và đếm bản ghi thiếu mặt thẻ', async () => {
  const json = JSON.stringify([
    { front: '日', back: 'ngày', romaji: 'nichi', lesson: 4 },
    { front: '月' },
  ]);
  const deckId = KANJI_CATEGORIES[0]!.deckId;
  const read = await readImportFile(json, 'kanji.json', context({ section: 'kanji', kanjiDeckId: deckId }));
  assert.equal(read.batches[0]!.deckId, deckId);
  assert.equal(read.batches[0]!.name, KANJI_CATEGORIES[0]!.label);
  assert.equal(read.batches[0]!.drafts[0]!.lesson, undefined);
  assert.equal(read.skippedRecords, 1);
});

// ── Gói Kanji nhiều nhóm ───────────────────────────────────────────────────

function kanjiPackage(deckIds: string[]): string {
  return JSON.stringify({
    name: 'Kanji Midori',
    bundles: deckIds.map((deckId, index) => ({
      deckId,
      name: deckId,
      cards: [{ front: `字${index}`, back: `nghĩa ${index}`, furigana: '', romaji: '', tags: [] }],
    })),
  });
}

test('gói nhiều nhóm chỉ lấy nhóm đang chọn khi phạm vi là một mục', async () => {
  const deckIds = [KANJI_CATEGORIES[0]!.deckId, KANJI_CATEGORIES[1]!.deckId];
  const read = await readImportFile(
    kanjiPackage(deckIds),
    'goi.json',
    context({ section: 'kanji', kanjiScope: 'single', kanjiDeckId: deckIds[1]! }),
  );
  assert.equal(read.batches.length, 1);
  assert.equal(read.batches[0]!.deckId, deckIds[1]);
});

test('gói thiếu nhóm đang chọn thì báo rõ tên nhóm', async () => {
  const read = readImportFile(
    kanjiPackage([KANJI_CATEGORIES[0]!.deckId]),
    'goi.json',
    context({ section: 'kanji', kanjiScope: 'single', kanjiDeckId: KANJI_CATEGORIES[2]!.deckId }),
  );
  await assert.rejects(() => read, new RegExp(KANJI_CATEGORIES[2]!.label));
});

test('chọn gói nhiều nhóm nhưng file là file đơn thì từ chối kèm hướng dẫn', async () => {
  const json = JSON.stringify([{ front: '日', back: 'ngày' }]);
  await assert.rejects(
    () => readImportFile(json, 'kanji.json', context({ section: 'kanji', kanjiScope: 'package' })),
    /bundles/,
  );
});

test('gói nhiều nhóm giữ đúng thứ tự nhóm và đếm bản ghi hỏng của từng nhóm', async () => {
  const deckIds = [KANJI_CATEGORIES[0]!.deckId, KANJI_CATEGORIES[1]!.deckId];
  const text = JSON.stringify({
    bundles: [
      { deckId: deckIds[0], cards: [{ front: '日', back: 'ngày' }, { front: '月' }] },
      { deckId: deckIds[1], cards: [{ front: '食', back: 'ăn' }] },
    ],
  });
  const read = await readImportFile(
    text,
    'goi.json',
    context({ section: 'kanji', kanjiScope: 'package' }),
  );
  assert.deepEqual(
    read.batches.map((batch) => batch.deckId),
    deckIds,
  );
  assert.equal(read.skippedRecords, 1);
});

test('gói Kanji từ chối nhóm lạ, nhóm lặp và bundles rỗng', async () => {
  const deckId = KANJI_CATEGORIES[0]!.deckId;
  const scope = context({ section: 'kanji', kanjiScope: 'package' });
  await assert.rejects(
    () => readImportFile(kanjiPackage(['kanji-khong-ton-tai']), 'goi.json', scope),
    /không được hỗ trợ/,
  );
  await assert.rejects(
    () => readImportFile(kanjiPackage([deckId, deckId]), 'goi.json', scope),
    /bị lặp/,
  );
  await assert.rejects(() => readImportFile('{"bundles":[]}', 'goi.json', scope), /ít nhất một nhóm/);
});

test('nhập tất cả mẫu câu giữ số bài và nhập collection bài cụ thể gán đúng bài', async () => {
  const csv = 'front,back,furigana,romaji,tags\nĐi học,学校へ行く,,,bài 6\n';
  const all = await readImportFile(csv, 'mau.csv', context({ section: 'patterns', lesson: 'all' }));
  assert.equal(all.batches[0]!.deckId, 'patterns');
  assert.equal(all.batches[0]!.drafts.length, 1);
  assert.equal(all.batches[0]!.drafts[0]!.lesson, 6);

  const targeted = await readImportFile(csv, 'mau.csv', context({ section: 'patterns', lesson: '12' }));
  assert.equal(targeted.batches[0]!.drafts[0]!.lesson, 12);
});

test('nhập tất cả mẫu câu từ chối bản ghi chưa được gán bài', async () => {
  const csv = 'front,back,furigana,romaji,tags\nĐi học,学校へ行く,,,\n';
  await assert.rejects(
    () => readImportFile(csv, 'mau.csv', context({ section: 'patterns', lesson: 'all' })),
    /mẫu câu cần có bài từ 1 đến 50/,
  );
});

// ── Phạm vi xuất ───────────────────────────────────────────────────────────

async function library(): Promise<Card[]> {
  return cardsMake(
    [
      { front: 'a', back: 'あ', furigana: '', romaji: 'a', tags: [], lesson: 1 },
      { front: 'b', back: 'い', furigana: '', romaji: 'i', tags: [], lesson: 2 },
    ],
    ['v1', 'v2'],
    'vocabulary',
    T0,
  ).then(async (vocabulary) => [
    ...vocabulary,
    ...(await cardsMake(
      [{ front: 'p', back: 'ぱ', furigana: '', romaji: 'pa', tags: [] }],
      ['p1'],
      'patterns',
      T0,
    )),
  ]);
}

test('xuất một bài chỉ đếm thẻ của bài đó, đọc từ thư viện thật', async () => {
  const cards = await library();
  const groups = selectExportGroups(cards, { section: 'vocabulary', lesson: '2', kanjiDeckId: '', kanjiScope: 'single' }, (id) => id);
  assert.equal(countCards(groups), 1);
  assert.equal(groups[0]!.cards[0]!.front, 'b');

  const all = selectExportGroups(cards, { section: 'vocabulary', lesson: 'all', kanjiDeckId: '', kanjiScope: 'single' }, (id) => id);
  assert.equal(countCards(all), 2);
});

test('xuất mẫu câu hỗ trợ collection tổng hợp và lọc đúng một bài', async () => {
  const patterns = await cardsMake(
    [
      { front: 'a', back: 'あ', furigana: '', romaji: '', tags: [], lesson: 1 },
      { front: 'b', back: 'い', furigana: '', romaji: '', tags: [], lesson: 2 },
    ],
    ['p1', 'p2'],
    'patterns',
    T0,
  );
  const all = selectExportGroups(
    patterns,
    { section: 'patterns', lesson: 'all', kanjiDeckId: '', kanjiScope: 'single' },
    (id) => id,
  );
  assert.equal(countCards(all), 2);
  assert.equal(all[0]!.name, 'Tất cả mẫu câu');

  const oneLesson = selectExportGroups(
    patterns,
    { section: 'patterns', lesson: '2', kanjiDeckId: '', kanjiScope: 'single' },
    (id) => id,
  );
  assert.equal(countCards(oneLesson), 1);
  assert.equal(oneLesson[0]!.name, 'Mẫu câu bài 2');
  assert.equal(oneLesson[0]!.cards[0]!.front, 'b');
});

test('xuất gói Kanji bỏ nhóm rỗng; xuất một mục rỗng cũng cho ra tập rỗng (nút xuất bị vô hiệu)', async () => {
  const cards = await library();
  const deckId = KANJI_CATEGORIES[0]!.deckId;
  const at = 'all';
  const single = selectExportGroups(cards, { section: 'kanji', lesson: at, kanjiDeckId: deckId, kanjiScope: 'single' }, (id) => id);
  assert.deepEqual(single, []);

  const pack = selectExportGroups(cards, { section: 'kanji', lesson: at, kanjiDeckId: deckId, kanjiScope: 'package' }, (id) => id);
  assert.deepEqual(pack, []);
});

test('nhãn phạm vi nói đúng việc sẽ làm', () => {
  assert.equal(
    scopeLabel({ section: 'vocabulary', lesson: 'all', kanjiDeckId: '', kanjiScope: 'single' }),
    'toàn bộ Từ vựng',
  );
  assert.equal(
    scopeLabel({ section: 'vocabulary', lesson: '12', kanjiDeckId: '', kanjiScope: 'single' }),
    'Bài 12',
  );
  assert.equal(
    scopeLabel({ section: 'patterns', lesson: 'all', kanjiDeckId: '', kanjiScope: 'single' }),
    'Tất cả mẫu câu',
  );
  assert.equal(
    scopeLabel({
      section: 'kanji',
      lesson: 'all',
      kanjiDeckId: KANJI_CATEGORIES[3]!.deckId,
      kanjiScope: 'single',
    }),
    KANJI_CATEGORIES[3]!.label,
  );
  assert.equal(
    scopeLabel({ section: 'kanji', lesson: 'all', kanjiDeckId: '', kanjiScope: 'package' }),
    'gói nhiều nhóm Kanji',
  );
});
