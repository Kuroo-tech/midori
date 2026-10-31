import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildContent } from '../scripts/build-content.mjs';
import {
  formatCoverageReport,
  summarizeCoverage,
  validateContent,
} from '../scripts/content-validation.mjs';

async function fixture(t: { after(callback: () => Promise<void>): void }, cards: unknown[] = [
  { id: 'card-a', front: 'xin chào', back: 'こんにちは', furigana: 'こんにちは', lesson: 1 },
]) {
  const root = await mkdtemp(join(tmpdir(), 'midori-content-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'content', 'bundles'), { recursive: true });
  await writeFile(
    join(root, 'content', 'content.json'),
    JSON.stringify({
      schemaVersion: 1,
      contentVersion: 'test.1',
      bundles: [
        { deckId: 'vocabulary', name: 'Từ vựng', source: 'bundles/vocabulary.json', quiz: 'meaning' },
      ],
    }),
  );
  await writeFile(
    join(root, 'content', 'bundles', 'vocabulary.json'),
    JSON.stringify({ cards }),
  );
  return root;
}

test('build content emits a consistent manifest, package and offline seed', async (t) => {
  const root = await fixture(t);
  const messages: string[] = [];
  buildContent(root, (message) => messages.push(message));

  const output = join(root, 'public', 'data', 'content');
  const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')) as {
    contentVersion: string;
    bundles: { path: string; bytes: number; sha256: string; deckId: string }[];
  };
  const bundle = await readFile(join(output, 'bundles', 'vocabulary.json'));
  const seed = JSON.parse(
    await readFile(join(root, 'src', 'generated', 'content-seed.json'), 'utf8'),
  ) as { bundles: { cards: unknown[]; cardIds: string[] }[] };
  const descriptor = manifest.bundles[0];

  assert.equal(manifest.contentVersion, 'test.1');
  assert.equal(descriptor?.deckId, 'vocabulary');
  assert.equal(descriptor?.bytes, bundle.byteLength);
  assert.equal(
    descriptor?.sha256,
    createHash('sha256').update(bundle).digest('hex'),
  );
  assert.deepEqual(seed.bundles[0]?.cardIds, ['card-a']);
  assert.equal(seed.bundles[0]?.cards.length, 1);
  assert.equal(messages.length, 3);
});

test('build content rejects duplicate card IDs before publishing the bundle', async (t) => {
  const duplicate = [
    { id: 'same', front: 'một', back: '一', lesson: 1 },
    { id: 'same', front: 'hai', back: '二', lesson: 1 },
  ];
  const root = await fixture(t, duplicate);

  assert.throws(() => buildContent(root, () => {}), /id trùng "same"/);
});

test('build content rejects invalid quiz and missing required card content', async (t) => {
  const root = await fixture(t, [{ id: 'x', front: '', back: 'あ' }]);
  assert.throws(() => buildContent(root, () => {}), /"front" phải là chuỗi không rỗng/);

  const manifestPath = join(root, 'content', 'content.json');
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: 1,
      contentVersion: 'test.2',
      bundles: [
        { deckId: 'vocabulary', name: 'Từ vựng', source: 'bundles/vocabulary.json', quiz: 'unknown' },
      ],
    }),
  );
  assert.throws(() => buildContent(root, () => {}), /quiz phải là "meaning" hoặc "reading"/);
});

test('build content preserves empty collections in manifest, bundles and offline seed', async (t) => {
  const root = await fixture(t, []);
  const messages: string[] = [];
  buildContent(root, (message) => messages.push(message));

  const output = join(root, 'public', 'data', 'content');
  const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')) as {
    bundles: { deckId: string; bytes: number }[];
  };
  const bundle = JSON.parse(
    await readFile(join(output, 'bundles', 'vocabulary.json'), 'utf8'),
  ) as { cards: unknown[] };
  const seed = JSON.parse(
    await readFile(join(root, 'src', 'generated', 'content-seed.json'), 'utf8'),
  ) as { bundles: { cards: unknown[]; cardIds: string[] }[] };

  assert.deepEqual(manifest.bundles.map(({ deckId }) => deckId), ['vocabulary']);
  assert.ok(manifest.bundles[0]!.bytes > 0, 'bundle JSON vẫn được phát hành');
  assert.deepEqual(bundle.cards, []);
  assert.deepEqual(seed.bundles[0]?.cards, []);
  assert.deepEqual(seed.bundles[0]?.cardIds, []);
  assert.match(messages[0] ?? '', /0 thẻ mặc định/);
});

test('content validation rejects duplicate IDs across bundles and writes no partial output', async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, 'content', 'bundles', 'extra'), { recursive: true });
  await writeFile(
    join(root, 'content', 'bundles', 'extra', 'patterns.json'),
    JSON.stringify({ cards: [{ id: 'card-a', front: 'câu', back: '文', lesson: 1 }] }),
  );
  await writeFile(
    join(root, 'content', 'content.json'),
    JSON.stringify({
      schemaVersion: 1,
      contentVersion: 'test.1',
      bundles: [
        { deckId: 'vocabulary', name: 'Từ vựng', source: 'bundles/vocabulary.json', quiz: 'meaning' },
        { deckId: 'patterns', name: 'Mẫu câu', source: 'bundles/extra/patterns.json', quiz: 'meaning' },
      ],
    }),
  );

  assert.throws(() => buildContent(root, () => {}), /id trùng giữa các gói: "card-a"/);
  await assert.rejects(readFile(join(root, 'public', 'data', 'content', 'manifest.json')));
});

test('content validation rejects unsafe or missing bundle references', async (t) => {
  const root = await fixture(t);
  const manifestPath = join(root, 'content', 'content.json');
  const manifest: {
    schemaVersion: number;
    contentVersion: string;
    bundles: { deckId: string; name: string; source: string; quiz: string }[];
  } = {
    schemaVersion: 1,
    contentVersion: 'test.1',
    bundles: [
      { deckId: 'vocabulary', name: 'Từ vựng', source: '../outside.json', quiz: 'meaning' },
    ],
  };
  await writeFile(manifestPath, JSON.stringify(manifest));
  assert.throws(() => validateContent(root), /đường dẫn tương đối bên trong content/);

  manifest.bundles[0]!.source = 'bundles/missing.json';
  await writeFile(manifestPath, JSON.stringify(manifest));
  assert.throws(() => validateContent(root), /Không đọc được JSON/);
});

test('content validation rejects malformed readings and inconsistent Kanji assignments', async (t) => {
  const root = await fixture(t, [
    { id: 'card-a', front: 'xin chào', back: 'こんにちは', furigana: 'konnichiwa', lesson: 1 },
  ]);
  assert.throws(() => validateContent(root), /furigana.*chỉ chứa kana/);

  await writeFile(
    join(root, 'content', 'content.json'),
    JSON.stringify({
      schemaVersion: 1,
      contentVersion: 'test.1',
      bundles: [
        { deckId: 'kanji-noun', name: 'Kanji', source: 'bundles/vocabulary.json', quiz: 'meaning' },
      ],
    }),
  );
  await writeFile(
    join(root, 'content', 'bundles', 'vocabulary.json'),
    JSON.stringify({
      cards: [{ id: 'kanji-a', front: 'Nước', back: '水', furigana: 'みず', lesson: 1 }],
    }),
  );
  assert.throws(() => validateContent(root), /gói Kanji cần hậu tố danh mục và quiz "reading"/);
});

test('coverage report summarizes configured lesson and category targets without inventing labels', async (t) => {
  const root = await fixture(t);
  const coverage = summarizeCoverage(validateContent(root));
  const report = formatCoverageReport(coverage);

  assert.equal(coverage.cardCount, 1);
  assert.equal(coverage.vocabulary.lessons.filter((lesson) => lesson.cards > 0).length, 1);
  assert.match(report, /1\/50 bài có thẻ/);
  assert.match(report, /Tên taxonomy cho bảy nhóm chưa được khai báo/);
  assert.match(report, /không thể xác nhận xuất xứ hoặc quyền phân phối/);
});

test('bộ Mẫu câu mặc định rỗng nhưng vẫn giữ đủ 50 lựa chọn bài', () => {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const coverage = summarizeCoverage(validateContent(root));

  assert.equal(coverage.patterns.cards, 0);
  assert.equal(coverage.patterns.lessons.length, 50);
  assert.ok(coverage.patterns.lessons.every((lesson) => lesson.cards === 0));
});
