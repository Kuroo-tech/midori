/**
 * Kiểm thử HỢP ĐỒNG Rust/WASM ↔ JavaScript.
 *
 * Chạy mô-đun WASM THẬT trong Node (nạp bằng bytes), với `node --test` và bộ
 * chuyển kiểu TypeScript có sẵn của Node — không cần bundler, không cần trình
 * duyệt, không thêm dependency.
 *
 * Vì sao cần lớp kiểm thử này khi đã có `cargo test`: hai bên có thể cùng đúng mà
 * vẫn lệch nhau. Cụ thể ở đây bắt được:
 *   - hàm bị đổi tên hoặc mất khi sinh WASM;
 *   - hình dạng phong bì thay đổi;
 *   - tên trường JSON đổi (snake_case lọt ra ngoài) làm lớp TS đọc sai;
 *   - `u64`/`f64` vượt độ chính xác của `number`.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { CoreError, unwrap } from '../src/core/envelope.ts';
import { loadCoreFrom } from '../src/core/wasm.ts';
import {
  cardApplyDraft,
  cardMake,
  cardNormalize,
  cardsMake,
  cardsNormalize,
  cardsFilter,
  contentReconcile,
  deckExport,
  deckParse,
  deckPlanImport,
  deckStats,
  lessonSummary,
  cardMarkAttempt,
  quizCheck,
  quizPrompt,
  quizScore,
  sessionRestore,
  sessionShuffle,
  srsIsDue,
  srsIsMastered,
  srsIsMature,
  srsIsNew,
  srsMastery,
  srsNew,
  srsPreview,
  srsSchedule,
  srsWeakReason,
  coreVersion,
} from '../src/core/index.ts';
import type { Card, CardDraft, SrsState } from '../src/core/index.ts';

const T0 = 1_700_000_000_000;
const DAY = 86_400_000;
const WASM = new URL('../src/generated/midori-wasm/midori_wasm_bg.wasm', import.meta.url);
const DTS = new URL('../src/generated/midori-wasm/midori_wasm.d.ts', import.meta.url);

const bytes = await readFile(WASM);
const core = await loadCoreFrom(bytes);

// ── Hình dạng phong bì ─────────────────────────────────────────────────────

test('phong bì thành công có đúng hai trường ok và data', () => {
  const envelope = JSON.parse(core.srs_new(T0)) as Record<string, unknown>;
  assert.deepEqual(Object.keys(envelope).sort(), ['data', 'ok']);
  assert.equal(envelope['ok'], true);
});

test('phong bì thất bại có đúng hai trường ok và error', () => {
  const envelope = JSON.parse(core.srs_schedule('{}', 'khong-co', T0)) as {
    ok: boolean;
    error: Record<string, unknown>;
  };
  assert.deepEqual(Object.keys(envelope).sort(), ['error', 'ok']);
  assert.equal(envelope['ok'], false);
  assert.equal(envelope['error']['code'], 'invalid_argument');
  assert.equal(typeof envelope['error']['message'], 'string');
});

test('mọi mã lỗi đều nằm trong danh sách đã biết', async () => {
  const { CORE_ERROR_CODES } = await import('../src/core/envelope.ts');
  const samples = [
    core.srs_schedule('{}', 'good', T0), // hợp lệ
    core.srs_schedule('{}', 'x', T0),
    core.card_normalize('{', T0),
    core.card_normalize('{"front":"a"}', T0),
    core.deck_parse('a,b', 'x.xlsx', 'meaning'),
    core.deck_parse('', 'x.csv', 'meaning'),
    core.deck_parse('{"name":"x"}', 'x.json', 'meaning'),
  ];
  for (const raw of samples) {
    const envelope = JSON.parse(raw) as { ok: boolean; error?: { code: string } };
    if (envelope.ok) continue;
    assert.ok(
      CORE_ERROR_CODES.includes(envelope.error?.code as never),
      `mã lỗi lạ: ${envelope.error?.code}`,
    );
  }
});

test('mọi hàm khai báo trong .d.ts đều tồn tại khi chạy', async () => {
  const declarations = await readFile(DTS, 'utf8');
  const declared = [...declarations.matchAll(/^export function (\w+)\(/gm)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined);
  assert.ok(declared.length >= 20, `chỉ thấy ${declared.length} hàm trong .d.ts`);

  const runtime = core as unknown as Record<string, unknown>;
  for (const name of declared) {
    assert.equal(typeof runtime[name], 'function', `thiếu hàm ${name} trong mô-đun WASM`);
  }
});

test('phiên bản lõi khớp với Cargo.toml', async () => {
  const cargo = await readFile(new URL('../crates/midori-core/Cargo.toml', import.meta.url), 'utf8');
  const version = /version\.workspace\s*=\s*true/.test(cargo)
    ? /\[workspace\.package\][\s\S]*?version\s*=\s*"([^"]+)"/.exec(
        await readFile(new URL('../Cargo.toml', import.meta.url), 'utf8'),
      )?.[1]
    : undefined;
  assert.equal(await coreVersion(), version);
});

// ── SRS ────────────────────────────────────────────────────────────────────

test('thang khoảng ôn là 1 → 6 → ease, và ease chỉ đổi sau đó', async () => {
  let srs = await srsNew(T0);
  assert.equal(srs.interval, 0);
  assert.equal(srs.ease, 2.5);

  srs = await srsSchedule(srs, 'good', T0);
  assert.equal(srs.interval, 1);
  assert.equal(srs.due, T0 + DAY);

  srs = await srsSchedule(srs, 'good', T0);
  assert.equal(srs.interval, 6);

  srs = await srsSchedule(srs, 'good', T0);
  assert.equal(srs.interval, 15, 'round(6 × 2.5)');
  assert.equal(srs.ease, 2.5, 'Good giữ nguyên ease');
});

test('Hard hạ ease và bước kế dùng ease TRƯỚC khi hạ', async () => {
  let srs = await srsNew(T0);
  srs = await srsSchedule(srs, 'hard', T0);
  assert.equal(srs.ease, 2.36);
  srs = await srsSchedule(srs, 'hard', T0);
  assert.equal(srs.ease, 2.22);
  srs = await srsSchedule(srs, 'hard', T0);
  assert.equal(srs.interval, 13, 'round(6 × 2.22), không phải 6 × 2.08');
});

test('Again đặt lại tiến trình và ghi một lần quên', async () => {
  let srs: SrsState = await srsNew(T0);
  srs = await srsSchedule(srs, 'good', T0);
  srs = await srsSchedule(srs, 'good', T0);
  const forgotten = await srsSchedule(srs, 'again', T0);

  assert.equal(forgotten.interval, 0);
  assert.equal(forgotten.repetitions, 0);
  assert.equal(forgotten.lapses, 1);
  assert.equal(forgotten.due, T0);
  assert.equal(forgotten.lastRating, 'again');
  assert.equal(await srsIsNew(forgotten), false, 'đã từng học nên không còn là thẻ mới');
  assert.equal(await srsWeakReason(forgotten), 'rating');
});

test('các vị từ SRS trả về đúng theo thời gian', async () => {
  const srs = await srsSchedule(await srsNew(T0), 'good', T0);
  assert.equal(await srsIsDue(srs, T0), false);
  assert.equal(await srsIsDue(srs, T0 + DAY), true);
  assert.equal(await srsIsMature(srs), false);

  const fresh = await srsNew(T0);
  assert.equal(await srsIsNew(fresh), true);
  assert.equal(await srsWeakReason(fresh), null);
});

test('mốc thời gian vượt độ chính xác số học bị từ chối', async () => {
  await assert.rejects(
    () => srsNew(Number.NaN),
    (error: unknown) => error instanceof CoreError && error.code === 'invalid_argument',
  );
  await assert.rejects(() => srsNew(1e18), CoreError);
});

// ── Chuẩn hoá thẻ ──────────────────────────────────────────────────────────

test('bản ghi cũ có "reading" được di trú theo hệ chữ', async () => {
  const kana = await cardNormalize({ id: 'c1', front: 'a', back: 'b', reading: 'こんにちは' }, T0);
  assert.equal(kana.furigana, 'こんにちは');
  assert.equal(kana.romaji, '');

  const latin = await cardNormalize({ id: 'c2', front: 'a', back: 'b', reading: 'konnichiwa' }, T0);
  assert.equal(latin.romaji, 'konnichiwa');
  assert.equal(latin.deckId, 'vocabulary');
});

test('lô chuẩn hoá giữ phần dùng được và báo phần hỏng', async () => {
  const result = await cardsNormalize(
    [
      { id: 'a', front: 'Xin chào', back: 'こんにちは' },
      { front: 'thiếu id' },
      { id: 'c', front: 'Tạm biệt', back: 'さようなら' },
    ],
    T0,
  );
  assert.equal(result.cards.length, 2);
  assert.deepEqual(
    result.rejected.map((entry) => entry.index),
    [1],
  );
  assert.equal(result.rejected[0]?.code, 'invalid_record');
});

test('nội dung thẻ đi qua ranh giới WASM không bị đổi kiểu trường', async () => {
  const card = await cardNormalize(
    { id: 'c1', deckId: 'patterns', front: 'a', back: 'b', tags: ['bài 3'], createdAt: T0 },
    T0,
  );
  // snake_case lọt ra ngoài sẽ làm lớp TS đọc sai — khoá lại bằng test.
  assert.deepEqual(Object.keys(card).sort(), [
    'back',
    'createdAt',
    'deckId',
    'front',
    'furigana',
    'id',
    'lesson',
    'romaji',
    'srs',
    'tags',
  ]);
  assert.equal(card.lesson, 3);
  assert.equal(card.createdAt, T0);
  assert.equal(typeof card.srs.ease, 'number');
});

test('tạo nhiều thẻ trong một lần gọi', async () => {
  const drafts: CardDraft[] = [
    { front: 'Xin chào', back: 'こんにちは', furigana: '', romaji: 'konnichiwa', tags: [] },
    { front: 'Tạm biệt', back: 'さようなら', furigana: '', romaji: '', tags: [] },
  ];
  const cards = await cardsMake(drafts, ['id-1', 'id-2'], 'vocabulary', T0);
  assert.deepEqual(
    cards.map((card) => card.id),
    ['id-1', 'id-2'],
  );
  assert.ok(cards.every((card) => card.srs.interval === 0));
});

test('id ổn định của nháp được ưu tiên hơn id sinh tự động', async () => {
  const draft: CardDraft = {
    id: 'v-chao',
    front: 'Xin chào',
    back: 'こんにちは',
    furigana: '',
    romaji: '',
    tags: [],
  };
  const card = await cardMake(draft, 'uuid-bi-bo-qua', 'vocabulary', T0);
  assert.equal(card.id, 'v-chao');
});

test('sửa nội dung thẻ không làm mất lịch SRS', async () => {
  const original = await cardNormalize(
    { id: 'c1', front: 'a', back: 'b', createdAt: T0 },
    T0,
  );
  const learned: Card = { ...original, srs: await srsSchedule(original.srs, 'easy', T0) };
  const edited = await cardApplyDraft(learned, {
    front: 'a (sửa)',
    back: 'b',
    furigana: '',
    romaji: '',
    tags: [],
  });
  assert.deepEqual(edited.srs, learned.srs);
  assert.equal(edited.createdAt, learned.createdAt);
  assert.equal(edited.front, 'a (sửa)');
});

// ── Nhập / xuất ────────────────────────────────────────────────────────────

test('đọc CSV có header và header không dấu', async () => {
  const withHeader = await deckParse(
    'front,back,furigana,romaji,tags\nXin chào,こんにちは,こんにちは,konnichiwa,bài 1\n',
    'tu.csv',
    'meaning',
  );
  assert.equal(withHeader.cards.length, 1);
  assert.equal(withHeader.cards[0]?.lesson, 1);
  assert.equal(withHeader.skipped, 0);

  const positional = await deckParse('A,B,C,D,nhóm\n', 'tu.tsv', 'meaning');
  assert.equal(positional.cards[0]?.tags.length, 1);
});

test('lõi đếm bản ghi bị bỏ qua của cả CSV và JSON', async () => {
  const csv = await deckParse('front,back\nA,B\n,C\nD,\n', 'tu.csv', 'meaning');
  assert.equal(csv.cards.length, 1);
  assert.equal(csv.skipped, 2);

  const json = await deckParse('[{"front":"a","back":"b"},{"front":"c"},5]', 'tu.json', 'meaning');
  assert.equal(json.cards.length, 1);
  assert.equal(json.skipped, 2);
});

test('ô CSV có dấu phẩy và dấu nháy kép được đọc đúng', async () => {
  const parsed = await deckParse('front,back\n"Xin chào, bạn","Anh ấy nói ""chào"""\n', 'tu.csv', 'meaning');
  assert.equal(parsed.cards[0]?.front, 'Xin chào, bạn');
  assert.equal(parsed.cards[0]?.back, 'Anh ấy nói "chào"');
});

test('xuất CSV rồi đọc lại cho ra đúng dữ liệu ban đầu', async () => {
  const cards = await cardsMake(
    [
      { front: 'Có, dấu, phẩy', back: '"trích"', furigana: '', romaji: '', tags: ['bài 1'] },
      { front: 'こんにちは', back: 'Xin chào', furigana: '', romaji: 'konnichiwa', tags: [] },
    ],
    ['c1', 'c2'],
    'vocabulary',
    T0,
  );

  const exported = await deckExport(cards, 'csv', 'Bộ của tôi', '2026-10-12');
  assert.equal(exported.filename, 'midori-2026-10-12.csv');
  assert.equal(exported.mime, 'text/csv');

  const reparsed = await deckParse(exported.text, 'midori-2026-10-12.csv', 'meaning');
  assert.equal(reparsed.cards.length, 2);
  assert.equal(reparsed.cards[0]?.front, 'Có, dấu, phẩy');
  assert.equal(reparsed.cards[0]?.back, '"trích"');
  assert.equal(reparsed.cards[1]?.romaji, 'konnichiwa');
});

test('cột có tên trong header không rò sang trường khác', async () => {
  // Ba dạng header mà bộ đọc cũ biến thành furigana sai: cột tags, mặt sau, và
  // cột romaji (bị chép vào cả hai trường).
  const withTags = await deckParse('front,back,tags\nA,B,bài 1\n', 'tu.csv', 'meaning');
  assert.equal(withTags.cards[0]?.furigana, '');
  assert.equal(withTags.cards[0]?.romaji, '');
  assert.deepEqual(withTags.cards[0]?.tags, ['bài 1']);

  const withId = await deckParse('id,front,back\nc1,A,B\n', 'tu.csv', 'meaning');
  assert.equal(withId.cards[0]?.furigana, '');
  assert.equal(withId.cards[0]?.back, 'B');

  const withRomaji = await deckParse('front,back,romaji\nA,B,kana\n', 'tu.csv', 'meaning');
  assert.equal(withRomaji.cards[0]?.romaji, 'kana');
  assert.equal(withRomaji.cards[0]?.furigana, '');
});

test('file có cả cột reading và romaji thì giữ cả hai', async () => {
  const parsed = await deckParse(
    'front,back,reading,romaji\nXin chào,こんにちは,こんにちは,konnichiwa\n',
    'tu.csv',
    'meaning',
  );
  assert.equal(parsed.cards[0]?.furigana, 'こんにちは');
  assert.equal(parsed.cards[0]?.romaji, 'konnichiwa');
});

test('ô CSV nhiều dòng, dấu nháy lạc và tag có dấu phẩy sống sót vòng xuất–nhập', async () => {
  const [card] = await cardsMake(
    [{ front: 'dòng 1\ndòng 2', back: 'B', furigana: '', romaji: '', tags: ['a,b', 'c'] }],
    ['c1'],
    'vocabulary',
    T0,
  );
  const exported = await deckExport([card!], 'csv', 'x', '2026-10-12');
  const reparsed = await deckParse(exported.text, 'midori-2026-10-12.csv', 'meaning');
  assert.equal(reparsed.skipped, 0);
  assert.equal(reparsed.cards[0]?.front, 'dòng 1\ndòng 2');
  assert.deepEqual(reparsed.cards[0]?.tags, ['a,b', 'c']);

  // Dấu nháy gõ lạc giữa chữ không được nuốt dấu phân cách phía sau.
  const stray = await deckParse('front,back\nAnh "ấy,B\n', 'tu.csv', 'meaning');
  assert.equal(stray.cards.length, 1);
  assert.equal(stray.cards[0]?.front, 'Anh "ấy');
  assert.equal(stray.cards[0]?.back, 'B');
});

test('hai đường tạo thẻ cùng từ chối id rỗng', async () => {
  const draft: CardDraft = { front: 'a', back: 'b', furigana: '', romaji: '', tags: [] };
  await assert.rejects(
    () => cardMake(draft, '', 'vocabulary', T0),
    (error: unknown) => error instanceof CoreError && error.code === 'invalid_argument',
  );
  await assert.rejects(
    () => cardsMake([draft], [''], 'vocabulary', T0),
    (error: unknown) => error instanceof CoreError && error.code === 'invalid_argument',
  );
});

test('xuất JSON rồi đọc lại giữ nguyên danh tính thẻ', async () => {
  const cards = await cardsMake(
    [{ id: 'v-chao', front: 'Xin chào', back: 'こんにちは', furigana: '', romaji: '', tags: [] }],
    ['khong-dung'],
    'vocabulary',
    T0,
  );
  const exported = await deckExport(cards, 'json', 'Từ vựng', '2026-10-12');
  assert.equal(exported.filename, 'midori-2026-10-12.json');
  assert.ok(!exported.text.includes('"srs"'), 'bản xuất không mang trạng thái học');

  const reparsed = await deckParse(exported.text, 'x.json', 'meaning');
  assert.equal(reparsed.name, 'Từ vựng');
  assert.equal(reparsed.cards[0]?.id, 'v-chao');
});

test('nhập thẻ bỏ trùng và không ghi đè thẻ đã có', async () => {
  const library = await cardsMake(
    [{ id: 'v-chao', front: 'Xin chào', back: 'こんにちは', furigana: '', romaji: '', tags: [] }],
    ['x'],
    'vocabulary',
    T0,
  );
  const drafts: CardDraft[] = [
    { front: 'Xin chào', back: 'こんにちは', furigana: '', romaji: '', tags: [] },
    { front: 'Mới', back: '新しい', furigana: '', romaji: '', tags: [] },
  ];
  const plan = await deckPlanImport(library, drafts, 'vocabulary', ['n1', 'n2'], T0);
  assert.equal(plan.skipped, 1);
  assert.equal(plan.fresh.length, 1);
  assert.equal(plan.fresh[0]?.front, 'Mới');
});

// ── Thống kê, lọc, phiên học ───────────────────────────────────────────────

test('thống kê và lọc nhìn cùng một thư viện', async () => {
  const library = await cardsMake(
    [
      { front: 'Xin chào', back: 'こんにちは', furigana: '', romaji: 'konnichiwa', tags: ['bài 1'] },
      { front: 'Tạm biệt', back: 'さようなら', furigana: '', romaji: 'sayounara', tags: ['bài 2'] },
    ],
    ['c1', 'c2'],
    'vocabulary',
    T0,
  );

  const stats = await deckStats(library, 'meaning', T0);
  assert.equal(stats.total, 2);
  assert.equal(stats.new, 2);
  assert.equal(stats.due, 2);
  assert.equal(stats.byDeck['vocabulary']?.total, 2);

  const found = await cardsFilter(library, { query: 'KONNICHIWA' }, T0);
  assert.deepEqual(found.ids, ['c1']);
  assert.equal(found.lessons.length, 50, 'luôn kèm khung 50 bài');

  const limited = await cardsFilter(library, { dueOnly: true, newLimit: 1 }, T0);
  assert.deepEqual(limited.ids, ['c1']);

  const lessons = await lessonSummary(library, T0);
  assert.equal(lessons.length, 50);
  assert.equal(lessons[0]?.count, 1);
  // Mỗi bài mang đủ nhóm tiến độ như một bộ thu nhỏ — lõi đếm, giao diện không tự tính.
  assert.equal(lessons[0]?.new, 1);
  assert.equal(lessons[0]?.due, 1);
  assert.equal(lessons[0]?.learning, 0);
  assert.equal(lessons[0]?.mature, 0);
  assert.equal(lessons[0]?.weak, 0);
  assert.equal(lessons[0]?.graded, 0);
});

test('thống kê tách độ thành thạo khỏi điểm làm bài', async () => {
  const [fresh, learned] = await cardsMake(
    [
      { front: 'a', back: 'あ', furigana: '', romaji: '', tags: [] },
      { front: 'b', back: 'い', furigana: '', romaji: '', tags: [] },
    ],
    ['s-1', 's-2'],
    'vocabulary',
    T0,
  );

  const studied = {
    ...learned!,
    srs: {
      ...learned!.srs,
      interval: 21,
      repetitions: 5,
      due: T0 + 21 * DAY,
      lastScore: 0.5,
    },
  };
  const stats = await deckStats([fresh!, studied], 'meaning', T0);

  // Hai đại lượng khác bản chất và KHÔNG được là cùng một con số.
  assert.equal(stats.graded, 1, 'chỉ một thẻ đã từng làm bài');
  assert.equal(stats.accuracy, 0.5);
  assert.equal(stats.mastered, 1);
  assert.ok(stats.mastery > 0 && stats.mastery < 1, `mastery=${stats.mastery}`);
  assert.notEqual(stats.mastery, stats.accuracy);

  const byDeck = stats.byDeck['vocabulary']!;
  assert.equal(byDeck.graded, 1);
  assert.equal(byDeck.mastered, 1);
  assert.equal(byDeck.accuracy, 0.5);
  assert.equal(byDeck.mastery, stats.mastery);

  // Thư viện chưa làm bài lần nào: `graded` bằng 0 nói rõ "chưa có dữ liệu".
  const untouched = await deckStats([fresh!], 'meaning', T0);
  assert.equal(untouched.graded, 0);
  assert.equal(untouched.accuracy, 0);
  assert.equal(untouched.mastery, 0);
});

test('trộn hàng đợi có seed xác định và giữ nguyên tập id', async () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const once = await sessionShuffle(ids, 12345);
  const twice = await sessionShuffle(ids, 12345);
  assert.deepEqual(once, twice);
  assert.notDeepEqual(once, ids, 'phải thực sự đổi thứ tự');
  assert.deepEqual([...once].sort(), [...ids].sort());
});

test('khôi phục phiên học tính lại vị trí sau khi thẻ bị bỏ', async () => {
  // Đây là lỗi dễ mắc nhất nếu làm ở JavaScript: giữ nguyên `index` cũ.
  const restored = await sessionRestore(
    { queue: ['a', 'b', 'c', 'd', 'e'], index: 3 },
    ['a', 'c', 'd', 'e'],
  );
  assert.deepEqual(restored.queue, ['a', 'c', 'd', 'e']);
  assert.equal(restored.index, 2, 'thẻ "d" phải ở vị trí 2, không phải 3');
  assert.equal(restored.queue[restored.index], 'd', 'phải trỏ đúng thẻ đang làm dở');
  assert.equal(restored.dropped, 1);
});

test('khôi phục phiên học chịu được bản lưu hỏng', async () => {
  // Bản lưu là dữ liệu phụ: hỏng nó không được làm ứng dụng không dùng được.
  const empty = await sessionRestore(
    {} as unknown as { queue: string[]; index: number },
    ['a', 'b'],
  );
  assert.deepEqual(empty.queue, []);
  assert.equal(empty.index, 0);

  const stale = await sessionRestore({ queue: ['x', 'y'], index: 9 }, ['a', 'b']);
  assert.deepEqual(stale.queue, []);
  assert.equal(stale.dropped, 2);
});

// ── Làm bài ────────────────────────────────────────────────────────────────

test('chấm câu trả lời dựa trên đáp án đã khai báo', async () => {
  const card = await cardNormalize(
    { id: 'c1', front: 'Xin chào', back: 'こんにちは', furigana: 'こんにちは', romaji: 'konnichiwa' },
    T0,
  );
  assert.equal(await quizPrompt(card, 'meaning'), 'Xin chào');
  assert.equal(await quizPrompt(card, 'reading'), 'こんにちは');

  const accepted = await quizCheck('KONNICHIWA', card, 'meaning');
  assert.equal(accepted.correct, true);
  assert.equal(accepted.matched, 'konnichiwa');

  const fullWidth = await quizCheck('ｋｏｎｎｉｃｈｉｗａ', card, 'meaning');
  assert.equal(fullWidth.correct, true, 'input full-width từ IME phải khớp');

  const rejectedAnswer = await quizCheck('sayounara', card, 'meaning');
  assert.equal(rejectedAnswer.correct, false);
  assert.equal(rejectedAnswer.matched, undefined);
  assert.deepEqual(rejectedAnswer.reference, ['こんにちは', 'こんにちは', 'konnichiwa']);

  // Kết luận và điểm phải đi qua được ranh giới WASM như hai trường bình thường.
  assert.equal(accepted.verdict, 'exact');
  assert.equal(accepted.score, 1);
  assert.equal(rejectedAnswer.verdict, 'wrong');
  assert.equal(rejectedAnswer.score, 0);
});

test('chấm theo mức đi qua ranh giới WASM với đủ năm kết luận', async () => {
  const vietnamese = await cardsMake(
    [{ front: 'nghĩa', back: '意味', furigana: 'いみ', romaji: '', tags: [] }],
    ['v-nghia'],
    'vocabulary',
    T0,
  );
  const card = vietnamese[0]!;

  const exact = await quizCheck('nghĩa', card, 'reading');
  const accents = await quizCheck('nghia', card, 'reading');
  const near = await quizCheck('nghĩ', card, 'reading');
  const wrong = await quizCheck('không biết', card, 'reading');
  const empty = await quizCheck('   ', card, 'reading');

  assert.deepEqual(
    [exact.verdict, accents.verdict, near.verdict, wrong.verdict, empty.verdict],
    ['exact', 'accepted', 'near', 'wrong', 'empty'],
  );
  assert.deepEqual([exact.score, accents.score, near.score, wrong.score, empty.score], [1, 0.9, 0.5, 0, 0]);
  // "Thiếu dấu" được tính là đúng; "gần đúng" thì KHÔNG.
  assert.deepEqual(
    [exact.correct, accents.correct, near.correct, wrong.correct, empty.correct],
    [true, true, false, false, false],
  );

  // Cùng đầu vào + cùng cấu hình ⇒ cùng kết quả, gọi bao nhiêu lần cũng vậy.
  const again = await quizScore('nghia', card, 'reading', {});
  assert.deepEqual(again, accents);

  const strict = await quizScore('nghia', card, 'reading', { accentTolerant: false, allowTypos: false });
  assert.equal(strict.verdict, 'wrong');
  assert.equal(strict.score, 0);
});

test('điểm lần trả lời được lưu mà không đổi lịch SRS', async () => {
  const card = (
    await cardsMake(
      [{ front: 'nghĩa', back: '意味', furigana: '', romaji: '', tags: [] }],
      ['v-1'],
      'vocabulary',
      T0,
    )
  )[0]!;
  const learned = { ...card, srs: await srsSchedule(card.srs, 'good', T0) };

  const marked = await cardMarkAttempt(learned, false, 0.5, T0 + 1000);
  assert.equal(marked.srs.lastScore, 0.5);
  assert.equal(marked.srs.lastWrongAt, T0 + 1000);
  assert.equal(marked.srs.interval, learned.srs.interval);
  assert.equal(marked.srs.due, learned.srs.due);
  assert.equal(marked.srs.ease, learned.srs.ease);

  // Thẻ chưa từng làm bài thì KHÔNG có trường này, và lịch sử cũ không bị diễn
  // giải lại: vắng `lastScore` khác hẳn `lastScore = 0`.
  assert.equal(card.srs.lastScore, undefined);
  assert.equal(await srsMastery(marked.srs), await srsMastery(learned.srs));
  assert.equal(await srsIsMastered(marked.srs), await srsIsMastered(learned.srs));
});

test('một lần gọi cho cả bốn khoảng ôn, khớp với từng lần gọi riêng', async () => {
  const fresh = await srsNew(T0);
  const preview = await srsPreview(fresh, T0);
  assert.deepEqual(preview, { again: 0, hard: 1, good: 1, easy: 1 });

  const learned = await srsSchedule(await srsSchedule(fresh, 'good', T0), 'good', T0);
  const batched = await srsPreview(learned, T0);
  for (const rating of ['again', 'hard', 'good', 'easy'] as const) {
    const one = await srsSchedule(learned, rating, T0);
    assert.equal(batched[rating], one.interval, `mức ${rating}`);
  }
  // Bốn mức phải thực sự khác nhau ở thẻ đã học — nếu không, phép so vô nghĩa.
  assert.ok(new Set(Object.values(batched)).size > 1);
});

// ── Đồng bộ nội dung (§7.4) ────────────────────────────────────────────────

test('người học không mất tiến độ khi nội dung xuất bản thay đổi', async () => {
  // Thư viện hiện tại: một thẻ đã học, một thẻ do người dùng tự tạo.
  const learnedCard = await cardsMake(
    [{ id: 'v-chao', front: 'Xin chào', back: 'こんにちは', furigana: '', romaji: 'konnichiwa', tags: [] }],
    ['x'],
    'vocabulary',
    T0,
  );
  const userCard = await cardsMake(
    [{ front: 'Thẻ của tôi', back: 'わたしのカード', furigana: '', romaji: '', tags: [] }],
    ['9f1c-uuid'],
    'vocabulary',
    T0,
  );
  const trained: Card[] = [
    { ...learnedCard[0]!, srs: await srsSchedule(learnedCard[0]!.srs, 'good', T0) },
    userCard[0]!,
  ];
  const before = trained[0]!.srs;

  // Nội dung v2: sửa nội dung thẻ cũ, bỏ một thẻ, thêm một thẻ.
  const content: CardDraft[] = [
    { id: 'v-chao', front: 'Xin chào (v2)', back: 'こんにちは', furigana: '', romaji: 'konnichiwa', tags: [] },
    { id: 'v-moi', front: 'Mới', back: '新しい', furigana: '', romaji: 'atarashii', tags: [] },
  ];

  const result = await contentReconcile(trained, content, ['v-chao', 'v-tambiet'], 'vocabulary', T0 + DAY);

  assert.equal(result.updated.length, 1);
  assert.equal(result.updated[0]?.id, 'v-chao');
  assert.equal(result.updated[0]?.front, 'Xin chào (v2)');
  assert.deepEqual(result.updated[0]?.srs, before, 'lịch SRS phải được giữ nguyên');
  assert.equal(result.fresh.length, 1);
  assert.equal(result.orphaned.length, 0, 'thẻ người dùng tự tạo không bị coi là mồ côi');

  // Thẻ "v-tambiet" đã biến mất khỏi nội dung nhưng không nằm trong thư viện.
  assert.equal(result.unchanged, 0);
  assert.equal(
    result.updated.length + result.fresh.length + result.orphaned.length + result.unchanged,
    content.length,
  );

  // Không kết quả nào mang ý nghĩa "xoá": union giữ nguyên mọi thẻ người dùng.
  const after = new Map(trained.map((card) => [card.id, card]));
  for (const card of [...result.updated, ...result.fresh]) after.set(card.id, card);
  assert.ok(after.has('9f1c-uuid'), 'thẻ người dùng tự tạo vẫn còn');
  assert.deepEqual(after.get('v-chao')?.srs, before);
});

test('thẻ bị bỏ khỏi nội dung được báo là mồ côi, không bị xoá', async () => {
  const cards = await cardsMake(
    [
      { id: 'v-a', front: 'A', back: 'あ', furigana: '', romaji: '', tags: [] },
      { id: 'v-b', front: 'B', back: 'い', furigana: '', romaji: '', tags: [] },
    ],
    ['x', 'y'],
    'vocabulary',
    T0,
  );
  const result = await contentReconcile(
    cards,
    [{ id: 'v-a', front: 'A', back: 'あ', furigana: '', romaji: '', tags: [] }],
    ['v-a', 'v-b'],
    'vocabulary',
    T0,
  );
  assert.deepEqual(result.orphaned, ['v-b']);
  assert.equal(result.updated.length, 0);
  assert.equal(result.unchanged, 1);
});

test('nội dung thiếu id ổn định bị từ chối thay vì tạo bản sao', async () => {
  await assert.rejects(
    () =>
      contentReconcile(
        [],
        [{ front: 'a', back: 'b', furigana: '', romaji: '', tags: [] }],
        [],
        'vocabulary',
        T0,
      ),
    (error: unknown) => error instanceof CoreError && error.code === 'invalid_record',
  );
});

// ── unwrap ────────────────────────────────────────────────────────────────

test('unwrap dịch phong bì lỗi thành CoreError có mã', () => {
  assert.throws(
    () => unwrap('{"ok":false,"error":{"code":"invalid_json","message":"hỏng"}}'),
    (error: unknown) =>
      error instanceof CoreError && error.code === 'invalid_json' && error.message === 'hỏng',
  );
});

test('unwrap từ chối chuỗi không phải phong bì', () => {
  assert.throws(() => unwrap('không phải json'), /không phải JSON/);
  assert.throws(() => unwrap('{"data":1}'), /thiếu trường "ok"/);
  assert.throws(() => unwrap('{"ok":false}'), /thiếu trường "error"/);
});
