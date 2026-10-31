/**
 * Kiểm thử quy trình hai bước trên **IndexedDB thật** (giả lập trong Node):
 *
 *   tải manifest → tải gói → xác minh hash → staging
 *   → xem trước → kích hoạt (staging→active, active→previous, xoá staging)
 *   → content_reconcile → meta.contentSync.version
 *
 * `content-pipeline.test.ts` kiểm thử cùng trình tự nhưng qua store trong bộ nhớ.
 * Tệp này kiểm thử phần mà store trong bộ nhớ không thể chứng minh: giao dịch
 * IndexedDB thật sự nguyên tử, reconcile ghi đúng vào thư viện, và mốc phiên bản
 * được ghi đúng chỗ.
 */

import 'fake-indexeddb/auto';

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, before, test } from 'node:test';

import { contentReconcile, deckParse, loadCoreFrom } from '../src/core/index.ts';
import type { Card, CardDraft } from '../src/core/types.ts';
import { createContentService } from '../src/content/service.ts';
import { stageContentUpdate, type UpdateDeps } from '../src/content/pipeline.ts';
import {
  previewReconciliation,
  reconcilePublishedContent,
} from '../src/content/reconciliation.ts';
import { createContentStore, deleteContentDb } from '../src/content/store.ts';
import type { ContentStore } from '../src/content/types.ts';
import { sha256Hex } from '../src/platform/crypto.ts';
import { commitContentReconciliation, loadCards } from '../src/storage/cards.ts';
import { USER_DB_NAME, closeUserDb } from '../src/storage/db.ts';
import { loadContentSync } from '../src/storage/settings.ts';

const T0 = 1_700_000_000_000;

before(async () => {
  await loadCoreFrom(
    await readFile(new URL('../src/generated/midori-wasm/midori_wasm_bg.wasm', import.meta.url)),
  );
});

afterEach(async () => {
  await deleteContentDb();
  await closeUserDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(USER_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Xoá database kiểm thử bị chặn.'));
  });
});

function draft(id: string, front: string, back: string): CardDraft {
  return { id, front, back, furigana: '', romaji: '', tags: [] };
}

/** Manifest + file gói y như `scripts/build-content.mjs` sinh ra. */
function publish(version: string, cards: CardDraft[]): Map<string, string> {
  const text = `${JSON.stringify(
    { id: 'vocabulary', name: 'Từ vựng', version: 1, cards },
    null,
    2,
  )}\n`;
  const manifest = JSON.stringify({
    schemaVersion: 1,
    contentVersion: version,
    bundles: [
      {
        deckId: 'vocabulary',
        name: 'Từ vựng',
        path: 'bundles/vocabulary.json',
        bytes: Buffer.byteLength(text, 'utf8'),
        sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
        quiz: 'meaning',
      },
    ],
  });
  return new Map<string, string>([
    ['/data/content/manifest.json', manifest],
    ['/data/content/bundles/vocabulary.json', text],
  ]);
}

/** Phụ thuộc của pipeline, trỏ vào store IndexedDB thật. */
function depsFor(files: Map<string, string>, store: ContentStore, now: number): UpdateDeps {
  return {
    store,
    fetchManifest: async () => {
      const text = files.get('/data/content/manifest.json');
      if (text === undefined) throw new Error('404');
      return JSON.parse(text) as unknown;
    },
    fetchBundle: async (path) => {
      const text = files.get(`/data/content/${path}`);
      if (text === undefined) throw new Error(`404: ${path}`);
      return new TextEncoder().encode(text);
    },
    parseBundleText: async (text, path, quiz) => (await deckParse(text, path, quiz)).cards,
    sha256: sha256Hex,
    now,
  };
}

/** Thẻ đã học tới hạn — dùng để chứng minh reconcile không đụng vào lịch SRS. */
const studied: Card = {
  id: 'v-chao',
  deckId: 'vocabulary',
  front: 'Xin chào',
  back: 'こんにちは',
  furigana: '',
  romaji: '',
  tags: [],
  createdAt: 1,
  srs: {
    ease: 2.5,
    interval: 6,
    repetitions: 2,
    lapses: 0,
    due: 2,
    lastRating: 'good',
  },
};

test('khởi động ngoại tuyến cài collection rỗng và không tự thêm thẻ vào thư viện', async () => {
  const service = createContentService({ store: createContentStore(), now: () => T0 });
  const active = await service.ensureActive();

  assert.equal(active.bundles.length, 3);
  assert.deepEqual(active.bundles.map((bundle) => bundle.deckId), [
    'vocabulary',
    'patterns',
    'kanji-noun',
  ]);
  assert.ok(active.bundles.every((bundle) => bundle.cards.length === 0));
  assert.ok(active.bundles.every((bundle) => bundle.cardIds.length === 0));

  const synced = await reconcilePublishedContent({
    library: [],
    bundles: active.bundles,
    previousIdsByDeck: {},
    contentVersion: active.contentVersion,
    now: T0,
    reconcile: contentReconcile,
    commit: commitContentReconciliation,
  });
  assert.equal(synced.added, 0);
  assert.deepEqual((await loadCards()).cards, []);
  assert.deepEqual((await loadContentSync()).cardIdsByDeck, {
    vocabulary: [],
    patterns: [],
    'kanji-noun': [],
  });
});

test('đệm, xem trước, kích hoạt, reconcile và ghi mốc — trên IndexedDB thật', async () => {
  const store = createContentStore();

  // ── 0. Bản 1.0.0: tải vào vùng đệm rồi kích hoạt. ─────────────────────
  const v1 = publish('1.0.0', [draft('v-chao', 'Xin chào', 'こんにちは')]);
  const first = await stageContentUpdate(depsFor(v1, store, T0));
  assert.equal(first.status, 'staged');
  assert.equal(await store.readActive(), null, 'đệm KHÔNG được tự kích hoạt');

  assert.equal(await store.promote(), true);
  assert.equal((await store.readActive())?.contentVersion, '1.0.0');
  assert.equal(await store.readStaging(), null, 'ngăn staging phải bị xoá khi kích hoạt');
  assert.equal(await store.readPrevious(), null, 'lần đầu chưa có gì để phục hồi');

  // Người học đã học thẻ v-chao (interval 6) và mốc đồng bộ trỏ tới 1.0.0.
  await commitContentReconciliation([studied], '1.0.0', { vocabulary: ['v-chao'] });
  const syncedBefore = await loadContentSync();
  assert.equal(syncedBefore.contentVersion, '1.0.0');

  // ── 1. Bản kế tiếp đổi id thẻ: tải + xác minh + đệm. ──────────────────
  const v2 = publish('2.0.0', [draft('v-moi', 'Mới', '新しい')]);
  const staged = await stageContentUpdate(depsFor(v2, store, T0 + 1));
  assert.equal(staged.status, 'staged');
  assert.equal(staged.status === 'staged' ? staged.to : undefined, '2.0.0');
  assert.equal((await store.readActive())?.contentVersion, '1.0.0', 'nội dung đang dùng chưa đổi');

  const stagedContent = await store.readStaging();
  assert.ok(stagedContent !== null);
  assert.equal(stagedContent.contentVersion, '2.0.0');

  // ── 2. Xem trước: 0 cập nhật, 1 mới, 1 bị bỏ. Không ghi gì. ────────────
  const preview = await previewReconciliation({
    library: [studied],
    bundles: stagedContent.bundles,
    previousIdsByDeck: syncedBefore.cardIdsByDeck,
    now: T0 + 1,
    reconcile: contentReconcile,
  });
  assert.equal(preview.updated, 0);
  assert.equal(preview.added, 1);
  assert.equal(preview.orphaned, 1);
  // Danh sách chi tiết phải khớp từng nhóm với con số đếm được.
  assert.deepEqual(preview.addedCards, [
    { id: 'v-moi', deckId: 'vocabulary', front: 'Mới', back: '新しい' },
  ]);
  assert.deepEqual(preview.orphanedCards, [
    { id: 'v-chao', deckId: 'vocabulary', front: 'Xin chào', back: 'こんにちは' },
  ]);
  assert.deepEqual(preview.updatedCards, []);
  assert.equal((await loadCards()).cards.length, 1, 'xem trước không được ghi thư viện');

  // ── 3. Kích hoạt: staging → active, active cũ → previous. ──────────────
  assert.equal(await store.promote(), true);
  assert.equal((await store.readActive())?.contentVersion, '2.0.0');
  assert.equal((await store.readPrevious())?.contentVersion, '1.0.0');
  assert.equal(await store.readStaging(), null);

  // ── 4. content_reconcile + ghi meta trong cùng giao dịch. ──────────────
  const result = await reconcilePublishedContent({
    library: [studied],
    bundles: stagedContent.bundles,
    previousIdsByDeck: syncedBefore.cardIdsByDeck,
    contentVersion: '2.0.0',
    now: T0 + 1,
    reconcile: contentReconcile,
    commit: commitContentReconciliation,
  });
  assert.equal(result.updated, 0);
  assert.equal(result.added, 1);
  assert.equal(result.orphaned, 1);
  assert.equal(
    result.cards.find((card) => card.id === 'v-chao')?.srs.interval,
    6,
    'thẻ mồ côi giữ nguyên lịch ôn',
  );

  // ── 5. Thư viện và meta.contentSync.version phản ánh bản mới. ──────────
  const library = await loadCards();
  assert.deepEqual(
    library.cards.map((card) => card.id).sort(),
    ['v-chao', 'v-moi'],
    'thẻ mồ côi vẫn nằm trong thư viện',
  );
  assert.equal(library.cards.find((card) => card.id === 'v-chao')?.srs.interval, 6);

  const syncedAfter = await loadContentSync();
  assert.equal(syncedAfter.contentVersion, '2.0.0');
  assert.deepEqual(syncedAfter.cardIdsByDeck, { vocabulary: ['v-moi'] });
});
