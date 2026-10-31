import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  previewReconciliation,
  reconcilePublishedContent,
} from '../src/content/reconciliation.ts';
import type { Card, CardDraft, ReconcileResult } from '../src/core/types.ts';

const original: Card = {
  id: 'published-a',
  deckId: 'vocabulary',
  front: 'cũ',
  back: '古い',
  furigana: 'ふるい',
  romaji: 'furui',
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

function reconcile(
  library: Card[],
  drafts: CardDraft[],
  _previousIds: string[],
  deckId: string,
): Promise<ReconcileResult> {
  const updated: Card[] = [];
  const fresh: Card[] = [];
  for (const draft of drafts) {
    const existing = library.find((card) => card.id === draft.id);
    if (existing !== undefined) {
      updated.push({ ...existing, front: draft.front });
    } else {
      fresh.push({
        ...original,
        id: draft.id ?? 'generated',
        deckId,
        front: draft.front,
        srs: { ...original.srs, interval: 0, repetitions: 0, due: 0 },
      });
    }
  }
  return Promise.resolve({ updated, fresh, orphaned: [], unchanged: 0 });
}

const bundles = [
  {
    deckId: 'vocabulary',
    cards: [{ id: 'published-a', front: 'mới', back: '新しい', furigana: '', romaji: '', tags: [] }],
    cardIds: ['published-a'],
  },
  {
    deckId: 'kanji',
    cards: [{ id: 'kanji-a', front: 'nước', back: '水', furigana: 'みず', romaji: 'mizu', tags: [] }],
    cardIds: ['kanji-a'],
  },
];

test('reconciliation plans all bundles then commits once, preserving SRS', async () => {
  let commitCount = 0;
  let committedVersion = '';
  let committedIds: Record<string, string[]> = {};
  const result = await reconcilePublishedContent({
    library: [original],
    bundles,
    previousIdsByDeck: { vocabulary: ['published-a'] },
    contentVersion: 'content.2',
    now: 10,
    reconcile,
    commit: async (changed, version, ids) => {
      commitCount += 1;
      assert.equal(changed.length, 2);
      committedVersion = version;
      committedIds = ids;
    },
  });

  assert.equal(commitCount, 1);
  assert.equal(committedVersion, 'content.2');
  assert.deepEqual(committedIds, { vocabulary: ['published-a'], kanji: ['kanji-a'] });
  assert.equal(result.updated, 1);
  assert.equal(result.added, 1);
  assert.equal(result.cards.find((card) => card.id === 'published-a')?.srs.interval, 6);
  assert.equal(original.front, 'cũ');
});

test('preview counts the same changes without writing anything', async () => {
  const library = [original];
  const preview = await previewReconciliation({
    library,
    bundles,
    previousIdsByDeck: { vocabulary: ['published-a'] },
    now: 10,
    reconcile,
  });

  assert.equal(preview.updated, 1);
  assert.equal(preview.added, 1);
  assert.equal(preview.orphaned, 0);
  assert.deepEqual(preview.updatedCards.map((card) => card.id), ['published-a']);
  assert.deepEqual(preview.addedCards.map((card) => card.id), ['kanji-a']);
  assert.deepEqual(preview.orphanedCards, []);
  assert.equal(library.length, 1, 'xem trước không được ghi vào thư viện');
  assert.equal(library[0]?.front, 'cũ');
});

test('failed reconciliation commit leaves caller state unchanged and can be retried', async () => {
  const library = [original];
  let commits = 0;
  const makePlan = () =>
    reconcilePublishedContent({
      library,
      bundles,
      previousIdsByDeck: { vocabulary: ['published-a'] },
      contentVersion: 'content.2',
      now: 10,
      reconcile,
      commit: async () => {
        commits += 1;
        if (commits === 1) throw new Error('simulated IndexedDB quota failure');
      },
    });

  await assert.rejects(makePlan(), /quota failure/);
  assert.equal(library.length, 1);
  assert.equal(library[0]?.front, 'cũ');

  const retried = await makePlan();
  assert.equal(commits, 2);
  assert.equal(retried.cards.length, 2);
  assert.equal(retried.cards[0]?.front, 'mới');
});
