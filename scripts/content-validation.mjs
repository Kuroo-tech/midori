import { readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

const QUIZZES = new Set(['meaning', 'reading']);
const CARD_FIELDS = ['id', 'front', 'back', 'furigana', 'romaji', 'tags', 'lesson'];
const KANA_READING = /^[\p{Script=Hiragana}\p{Script=Katakana}\u3005\u30FB\u30FC\s]+$/u;
const LATIN_READING = /^[\p{Script=Latin}\p{M}\d\s.'’\-‐‑]+$/u;

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (cause) {
    fail(`Không đọc được JSON ${path}: ${cause.message}`);
  }
}

function requireString(value, what) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${what} phải là chuỗi không rỗng`);
  }
  return value.trim();
}

function normalizeCard(raw, where, deckId) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    fail(`${where}: thẻ không phải đối tượng`);
  }

  const card = {};
  for (const field of CARD_FIELDS) {
    if (field in raw && raw[field] !== undefined) card[field] = raw[field];
  }

  card.id = requireString(card.id, `${where}: "id"`);
  card.front = requireString(card.front, `${where}: "front"`);
  card.back = requireString(card.back, `${where}: "back"`);

  for (const field of ['furigana', 'romaji']) {
    if (card[field] === undefined) card[field] = '';
    if (typeof card[field] !== 'string') {
      fail(`${where}: "${field}" phải là chuỗi`);
    }
    card[field] = card[field].trim();
  }
  if (card.furigana && !KANA_READING.test(card.furigana)) {
    fail(`${where}: "furigana" phải chỉ chứa kana và dấu phân cách tiếng Nhật`);
  }
  if (card.romaji && !LATIN_READING.test(card.romaji)) {
    fail(`${where}: "romaji" phải chỉ chứa chữ Latin, số và dấu phân cách`);
  }

  if (card.tags === undefined) card.tags = [];
  if (!Array.isArray(card.tags) || card.tags.some((tag) => typeof tag !== 'string')) {
    fail(`${where}: "tags" phải là mảng chuỗi`);
  }
  card.tags = card.tags.map((tag) => tag.trim());

  if (card.lesson !== undefined && (!Number.isInteger(card.lesson) || card.lesson < 1 || card.lesson > 50)) {
    fail(`${where}: "lesson" phải là số nguyên từ 1 đến 50`);
  }
  if ((deckId === 'vocabulary' || deckId === 'patterns') && card.lesson === undefined) {
    const deck = deckId === 'patterns' ? 'mẫu câu' : 'từ vựng';
    fail(`${where}: thẻ ${deck} phải có "lesson" từ 1 đến 50`);
  }
  if (deckId.startsWith('kanji-')) {
    if (card.lesson !== undefined) fail(`${where}: thẻ Kanji không được gán "lesson" Minna`);
    if (!card.furigana) fail(`${where}: thẻ Kanji phải có "furigana"`);
  }
  if (raw.deckId !== undefined && raw.deckId !== deckId) {
    fail(`${where}: deckId "${raw.deckId}" không khớp gói "${deckId}"`);
  }
  return card;
}

function resolveBundlePath(sourceDir, sourcePath, deckId) {
  if (isAbsolute(sourcePath) || sourcePath.includes('\\') || sourcePath.split('/').includes('..')) {
    fail(`${deckId}: source phải là đường dẫn tương đối bên trong content/`);
  }
  const path = resolve(sourceDir, sourcePath);
  const fromSource = relative(sourceDir, path);
  if (fromSource === '' || fromSource === '..' || fromSource.startsWith(`..${sep}`) || !sourcePath.endsWith('.json')) {
    fail(`${deckId}: source phải tham chiếu tệp JSON bên trong content/`);
  }
  return path;
}

export function validateContent(root) {
  const sourceDir = resolve(root, 'content');
  const source = readJson(join(sourceDir, 'content.json'));
  if (source.schemaVersion !== 1) fail(`schemaVersion không được hỗ trợ: ${source.schemaVersion}`);
  const contentVersion = requireString(source.contentVersion, 'contentVersion');
  if (!Array.isArray(source.bundles) || source.bundles.length === 0) {
    fail('content.json không có gói nào');
  }

  const seenDecks = new Set();
  const seenSources = new Set();
  const seenCardIds = new Set();
  const bundles = source.bundles.map((entry, bundleIndex) => {
    const where = `content.json.bundles[${bundleIndex}]`;
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      fail(`${where}: gói không phải đối tượng`);
    }
    const deckId = requireString(entry.deckId, `${where}: deckId`);
    const name = requireString(entry.name, `${deckId}: name`);
    const sourcePath = requireString(entry.source, `${deckId}: source`);
    const quiz = requireString(entry.quiz, `${deckId}: quiz`);
    if (!QUIZZES.has(quiz)) fail(`${deckId}: quiz phải là "meaning" hoặc "reading"`);
    if (seenDecks.has(deckId)) fail(`deckId trùng: ${deckId}`);
    seenDecks.add(deckId);

    if ((deckId === 'vocabulary' || deckId === 'patterns') && quiz !== 'meaning') {
      fail(`${deckId}: quiz phải là "meaning"`);
    }
    if (deckId.startsWith('kanji-')) {
      if (deckId === 'kanji-' || quiz !== 'reading') {
        fail(`${deckId}: gói Kanji cần hậu tố danh mục và quiz "reading"`);
      }
    }

    const bundlePath = resolveBundlePath(sourceDir, sourcePath, deckId);
    if (seenSources.has(bundlePath)) fail(`${deckId}: source đã được gán cho gói khác`);
    seenSources.add(bundlePath);
    const bundleSource = readJson(bundlePath);
    if (typeof bundleSource !== 'object' || bundleSource === null || !Array.isArray(bundleSource.cards)) {
      fail(`${sourcePath}: thiếu mảng "cards"`);
    }

    const bundleCardIds = new Set();
    const cards = bundleSource.cards.map((raw, cardIndex) => {
      const card = normalizeCard(raw, `${sourcePath}[${cardIndex}]`, deckId);
      if (bundleCardIds.has(card.id)) fail(`${sourcePath}: id trùng "${card.id}"`);
      if (seenCardIds.has(card.id)) fail(`id trùng giữa các gói: "${card.id}"`);
      bundleCardIds.add(card.id);
      seenCardIds.add(card.id);
      return card;
    });
    const sourceReference = entry.sourceReference;
    const license = entry.license;
    if (sourceReference !== undefined && (typeof sourceReference !== 'string' || sourceReference.trim() === '')) {
      fail(`${deckId}: sourceReference phải là chuỗi không rỗng`);
    }
    if (license !== undefined && (typeof license !== 'string' || license.trim() === '')) {
      fail(`${deckId}: license phải là chuỗi không rỗng`);
    }
    return { deckId, name, sourcePath, quiz, cards, sourceReference, license };
  });

  return { schemaVersion: source.schemaVersion, contentVersion, bundles };
}

export function summarizeCoverage(validated) {
  const lessons = (deckId) => {
    const counts = new Map();
    for (const bundle of validated.bundles.filter((item) => item.deckId === deckId)) {
      for (const card of bundle.cards) {
        if (card.lesson !== undefined) counts.set(card.lesson, (counts.get(card.lesson) ?? 0) + 1);
      }
    }
    return Array.from({ length: 50 }, (_, index) => ({
      lesson: index + 1,
      cards: counts.get(index + 1) ?? 0,
    }));
  };
  const kanjiBundles = validated.bundles.filter((bundle) => bundle.deckId.startsWith('kanji-'));
  const provenanceDeclared = validated.bundles.every((bundle) => {
    return typeof bundle.sourceReference === 'string' && typeof bundle.license === 'string';
  });

  return {
    contentVersion: validated.contentVersion,
    bundleCount: validated.bundles.length,
    cardCount: validated.bundles.reduce((sum, bundle) => sum + bundle.cards.length, 0),
    vocabulary: {
      cards: validated.bundles.find((bundle) => bundle.deckId === 'vocabulary')?.cards.length ?? 0,
      lessons: lessons('vocabulary'),
    },
    patterns: {
      cards: validated.bundles.find((bundle) => bundle.deckId === 'patterns')?.cards.length ?? 0,
      lessons: lessons('patterns'),
    },
    kanji: {
      targetCategories: 7,
      bundles: kanjiBundles.map(({ deckId, cards }) => ({ deckId, cards: cards.length })),
    },
    provenanceDeclared,
  };
}

export function formatCoverageReport(coverage) {
  const summarizeLessons = (items) => {
    const covered = items.filter((item) => item.cards > 0);
    const missing = items.filter((item) => item.cards === 0).map((item) => item.lesson);
    const missingText = missing.length === 50
      ? 'không có bài nào'
      : missing.length === 0
        ? 'không còn bài trống'
        : `bài trống: ${compressNumbers(missing)}`;
    return `${covered.length}/50 bài có thẻ; ${missingText}`;
  };
  const kanjiCards = coverage.kanji.bundles.reduce((sum, bundle) => sum + bundle.cards, 0);
  const kanjiMissing = Math.max(0, coverage.kanji.targetCategories - coverage.kanji.bundles.length);
  const kanjiRows = coverage.kanji.bundles.length
    ? coverage.kanji.bundles.map((bundle) => `- \`${bundle.deckId}\`: ${bundle.cards} thẻ`).join('\n')
    : '- Chưa có gói Kanji.';
  const vocabularyUnmapped = coverage.vocabulary.cards
    - coverage.vocabulary.lessons.reduce((sum, lesson) => sum + lesson.cards, 0);
  const patternUnmapped = coverage.patterns.cards
    - coverage.patterns.lessons.reduce((sum, lesson) => sum + lesson.cards, 0);

  return [
    '# Báo cáo độ phủ nội dung',
    '',
    `- Phiên bản nội dung: \`${coverage.contentVersion}\``,
    `- Tổng: ${coverage.cardCount} thẻ trong ${coverage.bundleCount} gói`,
    `- Từ vựng Minna: ${coverage.vocabulary.cards} thẻ; ${summarizeLessons(coverage.vocabulary.lessons)}.`,
    `- Mẫu câu: ${coverage.patterns.cards} thẻ; ${summarizeLessons(coverage.patterns.lessons)}; ${patternUnmapped} thẻ chưa gắn bài.`,
    `- Thẻ từ vựng chưa gắn bài: ${vocabularyUnmapped}.`,
    `- Kanji: ${coverage.kanji.bundles.length}/${coverage.kanji.targetCategories} nhóm theo deckId (${kanjiCards} thẻ); còn thiếu ${kanjiMissing} nhóm. Tên taxonomy cho bảy nhóm chưa được khai báo nên không liệt kê tên nhóm còn thiếu.`,
    '',
    '## Gói Kanji hiện có',
    '',
    kanjiRows,
    '',
    '## Nguồn và giấy phép',
    '',
    coverage.provenanceDeclared
      ? 'Mỗi gói khai báo nguồn tham chiếu và giấy phép.'
      : 'Nguồn tham chiếu và giấy phép chưa được khai báo cho từng gói; không thể xác nhận xuất xứ hoặc quyền phân phối từ dữ liệu hiện tại. Không mở rộng bộ nội dung cho tới khi được rà soát và ghi nhận.',
    '',
    '## Cách tái tạo',
    '',
    'Chạy `npm run content:audit`. Báo cáo chỉ thống kê metadata có trong `content/`; số thẻ không chứng minh độ đầy đủ hay tính chính xác sư phạm của giáo trình.',
    '',
  ].join('\n');
}

function compressNumbers(numbers) {
  const ranges = [];
  for (let index = 0; index < numbers.length;) {
    const start = numbers[index];
    let end = start;
    while (numbers[index + 1] === end + 1) end = numbers[++index];
    ranges.push(start === end ? `${start}` : `${start}–${end}`);
    index += 1;
  }
  return ranges.join(', ');
}
