import 'fake-indexeddb/auto';

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, before, test } from 'node:test';

import { loadCoreFrom } from '../src/core/wasm.ts';
import { cardsNormalize } from '../src/core/index.ts';
import type { Card, NormalizedCards } from '../src/core/types.ts';
import { createBackup, validateAndCommitBackup } from '../src/storage/backup.ts';
import {
  commitContentReconciliation,
  loadCards,
  loadRecoveryRecords,
  replaceUserLibrary,
} from '../src/storage/cards.ts';
import { META_KEYS, USER_DB_NAME, closeUserDb, userDb } from '../src/storage/db.ts';
import { loadSession } from '../src/storage/session.ts';

before(async () => {
  await loadCoreFrom(
    await readFile(new URL('../src/generated/midori-wasm/midori_wasm_bg.wasm', import.meta.url)),
  );
});

afterEach(async () => {
  await closeUserDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(USER_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Xoá database kiểm thử bị chặn.'));
  });
});

test('bản ghi hỏng được chuyển nguyên trạng vào kho phục hồi khi nạp thư viện', async () => {
  const db = await userDb();
  const invalid = {
    id: 'damaged-1',
    deckId: 'vocabulary',
    front: '',
    back: 'ありがとう',
    furigana: 'ありがとう',
    romaji: 'arigatou',
    tags: [],
    createdAt: 1,
    srs: { ease: 2.5, interval: 0, repetitions: 0, lapses: 0, due: 1 },
  } satisfies Card;
  await db.put('cards', invalid);

  const library = await loadCards(10);
  const recovery = await loadRecoveryRecords();

  assert.equal(library.cards.length, 0);
  assert.equal(library.rejected.length, 1);
  assert.equal(recovery.length, 1);
  assert.equal(recovery[0]?.originalKey, 'damaged-1');
  assert.deepEqual(recovery[0]?.record, invalid);
  assert.equal(await db.get('cards', 'damaged-1'), undefined);
});

test('lỗi khi ghi hồ sơ phục hồi hủy giao dịch và giữ nguyên bản ghi gốc', async () => {
  const db = await userDb();
  const invalid = {
    id: 'damaged-2',
    deckId: 'vocabulary',
    front: '',
    back: 'ありがとう',
    furigana: 'ありがとう',
    romaji: 'arigatou',
    tags: [],
    createdAt: 1,
    srs: { ease: 2.5, interval: 0, repetitions: 0, lapses: 0, due: 1 },
  } satisfies Card;
  await db.put('cards', invalid);
  const originalAdd = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (value, key) {
    if (this.name === 'recovery') throw new DOMException('Simulated clone failure', 'DataCloneError');
    return originalAdd.call(this, value, key);
  };

  try {
    await assert.rejects(loadCards(10), /Simulated clone failure/);
  } finally {
    IDBObjectStore.prototype.add = originalAdd;
  }

  assert.deepEqual(await db.get('cards', 'damaged-2'), invalid);
  assert.equal((await loadRecoveryRecords()).length, 0);
});

test('restore hỏng giữa lúc ghi không xóa thư viện hoặc metadata cũ', async () => {
  const db = await userDb();
  const original: Card = {
    id: 'existing',
    deckId: 'vocabulary',
    front: 'cũ',
    back: '古い',
    furigana: 'ふるい',
    romaji: 'furui',
    tags: [],
    createdAt: 1,
    srs: { ease: 2.5, interval: 6, repetitions: 2, lapses: 0, due: 2 },
  };
  await db.put('cards', original);
  await db.put('meta', 'old-version', META_KEYS.contentVersion);
  const malformed = JSON.parse('{"front":"thẻ không có id"}') as Card;

  await assert.rejects(
    replaceUserLibrary([malformed], { [META_KEYS.contentVersion]: 'new-version' }),
  );

  assert.deepEqual(await db.getAll('cards'), [original]);
  assert.equal(await db.get('meta', META_KEYS.contentVersion), 'old-version');
});

test('reconciliation abort giữ nguyên thẻ và metadata nội dung nếu một put lỗi', async () => {
  const db = await userDb();
  const original: Card = {
    id: 'existing',
    deckId: 'vocabulary',
    front: 'cũ',
    back: '古い',
    furigana: 'ふるい',
    romaji: 'furui',
    tags: [],
    createdAt: 1,
    srs: { ease: 2.5, interval: 6, repetitions: 2, lapses: 0, due: 2 },
  };
  await db.put('cards', original);
  await db.put('meta', 'old-version', META_KEYS.contentVersion);
  await db.put('meta', { vocabulary: ['old-card'] }, META_KEYS.contentCardIds);
  const malformed = JSON.parse('{"front":"không có id"}') as Card;

  await assert.rejects(
    commitContentReconciliation(
      [{ ...original, front: 'đã đổi' }, malformed],
      'new-version',
      { vocabulary: ['new-card'] },
    ),
  );

  assert.deepEqual(await db.get('cards', original.id), original);
  assert.equal(await db.get('meta', META_KEYS.contentVersion), 'old-version');
  assert.deepEqual(await db.get('meta', META_KEYS.contentCardIds), { vocabulary: ['old-card'] });
});

test('backup hợp lệ khôi phục atomically SRS, cài đặt, metadata nội dung và phiên học', async () => {
  const db = await userDb();
  const backup = createBackup({
    includeProgress: true,
    cards: [
      {
        id: 'restored',
        deckId: 'vocabulary',
        front: 'cảm ơn',
        back: 'ありがとう',
        furigana: 'ありがとう',
        romaji: 'arigatou',
        tags: [],
        createdAt: 1,
        srs: { ease: 2.7, interval: 6, repetitions: 2, lapses: 1, due: 10, lastRating: 'good' },
      },
    ],
    settings: { theme: 'dark', dailyNewLimit: 12, shuffleByDefault: true },
    contentSync: { contentVersion: 'backup-version', cardIdsByDeck: { vocabulary: ['published'] } },
    screen: 'home',
    session: {
      deckId: 'vocabulary',
      mode: 'flip',
      queue: ['restored'],
      index: 0,
      revealed: true,
      rated: 0,
      mistakes: 0,
      savedAt: Date.now(),
    },
  });
  const restored = await validateAndCommitBackup(backup, {
    normalizeCards: (records, now): Promise<NormalizedCards> => cardsNormalize(records, now),
    commit: (cards, metadata) =>
      replaceUserLibrary(cards, {
        [META_KEYS.settings]: metadata['settings'],
        [META_KEYS.contentVersion]: metadata['contentVersion'],
        [META_KEYS.contentCardIds]: metadata['contentCardIds'],
        [META_KEYS.screen]: metadata['screen'],
        [META_KEYS.session]: metadata['session'],
      }),
  });

  assert.equal(restored.cards[0]?.srs.interval, 6);
  assert.equal((await db.get('meta', META_KEYS.contentVersion)), 'backup-version');
  assert.deepEqual(await db.get('meta', META_KEYS.contentCardIds), { vocabulary: ['published'] });
  assert.deepEqual(await db.get('meta', META_KEYS.settings), {
    theme: 'dark',
    dailyNewLimit: 12,
    shuffleByDefault: true,
  });
  assert.equal((await loadSession())?.queue[0], 'restored');
});
