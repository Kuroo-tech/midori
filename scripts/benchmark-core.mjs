#!/usr/bin/env node
/**
 * Repeatable workstation benchmark for the Rust/WASM filter and deck parser.
 *
 * Run after `npm run generate`:
 *   npm run benchmark:core
 *   BENCH_SAMPLES=30 BENCH_SIZES=1000,10000,50000 npm run benchmark:core
 *
 * Ba nhóm phép đo:
 *   - `cardsFilter-query` / `deckParse-json` — theo kích thước thư viện;
 *   - `quizCheck` — chấm điểm, so cấu hình mặc định với so khớp chính xác thuần
 *     (đường đi của thuật toán cũ), để biết cải tiến tốn thêm bao nhiêu;
 *   - `srsIntervalPreview` — một lần gọi cho bốn khoảng ôn, so với bốn lần gọi.
 *
 * Timings include JS JSON serialization and the WASM boundary. They exclude
 * IndexedDB writes and UI rendering; this is not a mobile-device benchmark.
 */

import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import {
  cardsFilter,
  deckParse,
  loadCoreFrom,
  quizCheck,
  quizScore,
  srsNew,
  srsPreview,
  srsSchedule,
} from '../src/core/index.ts';

const samples = positiveInteger(process.env['BENCH_SAMPLES'], 15);
const warmups = positiveInteger(process.env['BENCH_WARMUPS'], 3);
const sizes = (process.env['BENCH_SIZES'] ?? '1000,10000,50000')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isSafeInteger(value) && value > 0);

if (sizes.length === 0) throw new Error('BENCH_SIZES must contain positive integers.');

const wasm = await readFile(new URL('../src/generated/midori-wasm/midori_wasm_bg.wasm', import.meta.url));
const wasmInitStarted = performance.now();
await loadCoreFrom(wasm);
const wasmInitMs = performance.now() - wasmInitStarted;
const now = 1_800_000_000_000;

console.log(
  JSON.stringify({
    kind: 'environment',
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    wasmBytes: wasm.byteLength,
    samples,
    warmups,
    wasmInitMs: round(wasmInitMs),
    note: 'WASM bytes loaded from disk; one initialization sample, not browser download timing.',
  }),
);

for (const size of sizes) {
  const cards = Array.from({ length: size }, (_, index) => {
    const match = index % 10 === 0;
    return {
      id: `bench-${index}`,
      deckId: 'vocabulary',
      front: `Nghĩa tiếng Việt ${index}`,
      back: match ? 'こんにちは' : 'ありがとう',
      furigana: match ? 'こんにちは' : 'ありがとう',
      romaji: match ? 'konnichiwa' : 'arigatou',
      tags: [],
      lesson: (index % 50) + 1,
      createdAt: now,
      srs: { ease: 2.5, interval: 0, repetitions: 0, lapses: 0, due: now },
    };
  });

  const filterTimings = await timeRepeated(
    () => cardsFilter(cards, { query: 'konnichiwa', deckIds: ['vocabulary'] }, now),
    samples,
    warmups,
  );
  console.log(
    JSON.stringify({
      kind: 'cardsFilter-query',
      cards: size,
      query: 'konnichiwa',
      includesJsonSerialization: true,
      ...summarize(filterTimings),
    }),
  );

  const packageText = JSON.stringify({
    id: 'benchmark',
    name: 'Benchmark',
    version: 1,
    cards: cards.map(({ id, front, back, furigana, romaji, tags, lesson }) => ({
      id,
      front,
      back,
      furigana,
      romaji,
      tags,
      lesson,
    })),
  });
  const parseTimings = await timeRepeated(
    () => deckParse(packageText, 'benchmark.json', 'meaning'),
    samples,
    warmups,
  );
  console.log(
    JSON.stringify({
      kind: 'deckParse-json',
      cards: size,
      inputBytes: Buffer.byteLength(packageText),
      includesJsonSerialization: false,
      excludesIndexedDbAndFileRead: true,
      ...summarize(parseTimings),
    }),
  );
}

// ── Chấm điểm và xem trước khoảng ôn ──────────────────────────────────────
//
// Hai phép đo này không phụ thuộc kích thước thư viện, nên chạy một lần. Chúng
// trả lời hai câu hỏi khác nhau:
//   1. Thuật toán chấm điểm mới tốn thêm bao nhiêu so với so khớp chính xác thuần?
//      `quizScore` với cấu hình tắt hết khoan dung chính là đường đi cũ.
//   2. Gộp bốn khoảng ôn vào một lần gọi tiết kiệm được bao nhiêu lần vượt biên?

const quizCard = {
  id: 'bench-quiz',
  deckId: 'vocabulary',
  front: 'nghĩa',
  back: '意味',
  furigana: 'いみ',
  romaji: '',
  tags: [],
  createdAt: now,
  srs: { ease: 2.5, interval: 0, repetitions: 0, lapses: 0, due: now },
};

const scoringCases = [
  ['exact', 'nghĩa'],
  ['accepted', 'nghia'],
  ['near', 'nghĩ'],
  ['wrong', 'không biết'],
  ['empty', '   '],
];
const strictConfig = { accentTolerant: false, allowTypos: false };

for (const [label, input] of scoringCases) {
  const relaxed = await timeRepeated(
    () => quizCheck(input, quizCard, 'reading'),
    samples,
    warmups,
  );
  const strict = await timeRepeated(
    () => quizScore(input, quizCard, 'reading', strictConfig),
    samples,
    warmups,
  );
  console.log(
    JSON.stringify({
      kind: 'quizCheck',
      case: label,
      includesJsonSerialization: true,
      relaxed: summarize(relaxed),
      strict: summarize(strict),
    }),
  );
}

const learned = await srsSchedule(await srsSchedule(await srsNew(now), 'good', now), 'good', now);
const batched = await timeRepeated(() => srsPreview(learned, now), samples, warmups);
const fourCalls = await timeRepeated(async () => {
  for (const rating of ['again', 'hard', 'good', 'easy']) {
    await srsSchedule(learned, rating, now);
  }
}, samples, warmups);
console.log(
  JSON.stringify({
    kind: 'srsIntervalPreview',
    batchedOneCall: summarize(batched),
    fourSeparateCalls: summarize(fourCalls),
    wasmCrossings: { batchedOneCall: 1, fourSeparateCalls: 4 },
  }),
);

async function timeRepeated(run, count, warmupCount) {
  for (let index = 0; index < warmupCount; index += 1) await run();
  const timings = [];
  for (let index = 0; index < count; index += 1) {
    const started = performance.now();
    await run();
    timings.push(performance.now() - started);
  }
  return timings;
}

function summarize(timings) {
  const sorted = [...timings].sort((left, right) => left - right);
  return {
    samples: sorted.length,
    medianMs: round(sorted[Math.floor(sorted.length / 2)] ?? 0),
    p95Ms: round(sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0),
  };
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function round(value) {
  return Number(value.toFixed(2));
}
