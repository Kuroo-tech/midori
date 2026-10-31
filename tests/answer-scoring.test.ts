/**
 * Thuật toán chấm điểm, kiểm qua ĐÚNG lớp mà ứng dụng dùng.
 *
 * `cargo test` đã kiểm thuật toán ở phía Rust, bằng dữ liệu dựng trong bộ nhớ.
 * File này kiểm thứ khác: đường đi thật của một câu trả lời — từ `quizCheck` qua
 * biên WASM, qua `cardMarkAttempt` để lưu điểm, rồi qua `cardsNormalize` khi đọc
 * lại từ IndexedDB. Ba chặng đó có thể cùng đúng mà vẫn lệch nhau ở tên trường
 * JSON, và đó là loại lỗi chỉ lộ ra khi chạy thật.
 *
 * Bộ dữ liệu có NHÃN ở đây trùng ý với `crates/midori-core/tests/answer-scoring.rs`.
 * Cố ý giữ hai bản: bản Rust chạy nhanh và không cần sinh WASM, bản này chứng
 * minh hợp đồng biên. Chỉ số được tính và in ra, không chỉ được \"cảm nhận\".
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  cardMarkAttempt,
  cardsNormalize,
  cardsMake,
  loadCoreFrom,
  quizCheck,
  srsNew,
  type Card,
  type Quiz,
} from '../src/core/index.ts';

const T0 = 1_700_000_000_000;
const DAY = 86_400_000;
const bytes = await readFile(
  new URL('../src/generated/midori-wasm/midori_wasm_bg.wasm', import.meta.url),
);
await loadCoreFrom(bytes);

interface Labelled {
  /** Nhóm ca, để đọc được bảng số liệu khi có ca hỏng. */
  group: string;
  quiz: Quiz;
  front: string;
  back: string;
  furigana: string;
  romaji: string;
  input: string;
  /** Người chấm công bằng có tính là đúng không. */
  accept: boolean;
}

const CASES: Labelled[] = [
  // Chữ Nhật: đúng chính xác, khác hoa/thường, hoặc sai hẳn.
  { group: 'chữ Nhật', quiz: 'meaning', front: 'Xin chào', back: 'こんにちは', furigana: 'こんにちは', romaji: 'konnichiwa', input: 'こんにちは', accept: true },
  { group: 'romaji', quiz: 'meaning', front: 'Xin chào', back: 'こんにちは', furigana: 'こんにちは', romaji: 'konnichiwa', input: 'KonniCHIwa', accept: true },
  { group: 'chữ Nhật', quiz: 'meaning', front: 'Xin chào', back: 'こんにちは', furigana: 'こんにちは', romaji: 'konnichiwa', input: 'さようなら', accept: false },
  // Tiếng Việt: thiếu dấu vẫn được nhận, nhưng kết luận phải nói rõ.
  { group: 'thiếu dấu', quiz: 'reading', front: 'nghĩa', back: '意味', furigana: 'いみ', romaji: '', input: 'nghia', accept: true },
  { group: 'thiếu dấu', quiz: 'reading', front: 'Cảm ơn', back: 'ありがとう', furigana: 'ありがとう', romaji: '', input: 'cam on', accept: true },
  { group: 'đúng chính xác', quiz: 'reading', front: 'nghĩa', back: '意味', furigana: 'いみ', romaji: '', input: 'nghĩa', accept: true },
  { group: 'đúng chính xác', quiz: 'reading', front: 'Xin chào', back: 'こんにちは', furigana: '', romaji: '', input: 'xin chào', accept: true },
  // Không được nhận: bỏ trống, rác, và từ khác hẳn.
  { group: 'bỏ trống', quiz: 'reading', front: 'nghĩa', back: '意味', furigana: 'いみ', romaji: '', input: '', accept: false },
  { group: 'bỏ trống', quiz: 'reading', front: 'nghĩa', back: '意味', furigana: 'いみ', romaji: '', input: '   ', accept: false },
  { group: 'rác', quiz: 'meaning', front: 'Xin chào', back: 'こんにちは', furigana: '', romaji: 'konnichiwa', input: '?????', accept: false },
  { group: 'sai hẳn', quiz: 'reading', front: 'nghĩa', back: '意味', furigana: 'いみ', romaji: '', input: 'không biết', accept: false },
  // Gần đúng: KHÔNG tính là đúng, nhưng không được rơi xuống \"sai hẳn\".
  { group: 'gần đúng', quiz: 'reading', front: 'nghĩa', back: '意味', furigana: '', romaji: '', input: 'nghĩ', accept: false },
];

async function library(): Promise<Card[]> {
  return cardsMake(
    CASES.map((entry) => ({
      front: entry.front,
      back: entry.back,
      furigana: entry.furigana,
      romaji: entry.romaji,
      tags: [],
    })),
    CASES.map((_, index) => `case-${index}`),
    'vocabulary',
    T0,
  );
}

test('đủ năm kết luận đi qua được lớp TypeScript', async () => {
  const cards = await library();
  const verdicts = new Set<string>();
  for (const [index, entry] of CASES.entries()) {
    const check = await quizCheck(entry.input, cards[index]!, entry.quiz);
    verdicts.add(check.verdict);
  }
  for (const verdict of ['exact', 'accepted', 'near', 'wrong', 'empty']) {
    assert.ok(verdicts.has(verdict), `thiếu kết luận ${verdict}`);
  }
});

test('nhãn, recall và precision của bộ dữ liệu', async () => {
  const cards = await library();
  let expectedAccept = 0;
  let accepted = 0;
  let truePositive = 0;
  let falsePositive = 0;
  const misses: string[] = [];

  for (const [index, entry] of CASES.entries()) {
    const check = await quizCheck(entry.input, cards[index]!, entry.quiz);
    if (entry.accept) expectedAccept += 1;
    if (check.correct) accepted += 1;
    if (entry.accept && check.correct) truePositive += 1;
    if (!entry.accept && check.correct) falsePositive += 1;
    if (entry.accept !== check.correct) {
      misses.push(`${entry.group}: ${JSON.stringify(entry.input)}`);
    }
  }

  const recall = truePositive / expectedAccept;
  const precision = truePositive / accepted;
  console.log(
    `── Chấm điểm qua WASM: ${CASES.length} ca · recall ${recall.toFixed(3)} · precision ${precision.toFixed(3)}`,
  );

  assert.deepEqual(misses, [], 'có ca lệch nhãn');
  assert.equal(recall, 1);
  assert.equal(precision, 1);
  assert.equal(falsePositive, 0);
  // Không có ca \"gần đúng\" nào được tính là đúng, nhưng vẫn phải được nhận ra.
  const near = await quizCheck('nghĩ', cards[CASES.length - 1]!, 'reading');
  assert.equal(near.verdict, 'near');
  assert.equal(near.correct, false);
  assert.equal(near.score, 0.5);
});

test('điểm của một lần trả lời sống sót qua đường lưu trữ', async () => {
  const fresh = await srsNew(T0);
  const [card] = await cardsMake(
    [{ front: 'nghĩa', back: '意味', furigana: '', romaji: '', tags: [] }],
    ['persist-1'],
    'vocabulary',
    T0,
  );
  assert.equal(card!.srs.lastScore, undefined, 'thẻ mới chưa có điểm');

  const marked = await cardMarkAttempt(card!, false, 0.5, T0 + 500);
  assert.equal(marked.srs.lastScore, 0.5);

  // Đường ĐỌC LẠI từ thư viện — chính đường mà IndexedDB dùng khi mở ứng dụng.
  const reread = await cardsNormalize([JSON.parse(JSON.stringify(marked))], T0);
  assert.equal(reread.rejected.length, 0);
  assert.equal(reread.cards[0]!.srs.lastScore, 0.5);
  assert.equal(reread.cards[0]!.srs.lastWrongAt, T0 + 500);

  // Bản ghi CŨ (không có `lastScore`) đọc ra vẫn vắng trường đó — không bị gán 0,
  // nên các bản tổng hợp đọc `graded` để biết là chưa có dữ liệu.
  const legacy = await cardsNormalize(
    [{ id: 'old', front: 'a', back: 'b', srs: { due: T0, interval: 6, repetitions: 2, lastRating: 'hard' } }],
    T0,
  );
  assert.equal(legacy.rejected.length, 0);
  assert.equal(legacy.cards[0]!.srs.lastScore, undefined);
  assert.equal(legacy.cards[0]!.srs.lastRating, 'hard');
  assert.equal(fresh.lastScore, undefined);
});

test('điểm bất thường bị kẹp chứ không làm hỏng bước ghi', async () => {
  const [card] = await cardsMake(
    [{ front: 'a', back: 'b', furigana: '', romaji: '', tags: [] }],
    ['clamp-1'],
    'vocabulary',
    T0,
  );
  assert.equal((await cardMarkAttempt(card!, true, 9, T0)).srs.lastScore, 1);
  assert.equal((await cardMarkAttempt(card!, false, -1, T0)).srs.lastScore, 0);
  assert.equal((await cardMarkAttempt(card!, true, Number.NaN, T0)).srs.lastScore, 0);
});

test('một lần trả lời đúng không tự nâng độ thành thạo dài hạn', async () => {
  const [card] = await cardsMake(
    [{ front: 'a', back: 'b', furigana: '', romaji: '', tags: [] }],
    ['mastery-1'],
    'vocabulary',
    T0,
  );
  const marked = await cardMarkAttempt(card!, true, 1, T0);
  assert.equal(marked.srs.interval, 0, 'làm bài không được dời lịch ôn');
  assert.equal(marked.srs.due, card!.srs.due);
  assert.equal(marked.srs.repetitions, 0);
  assert.ok(marked.srs.due <= T0 + 1, 'thẻ vẫn tới hạn ngay');
  assert.equal(await quizCheck('', card!, 'meaning').then((check) => check.score), 0);
  // Và một lần trả lời không được tạo ra lịch sử SRS nào khác.
  assert.equal(marked.srs.interval * DAY, 0);
});
