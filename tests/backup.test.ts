import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  createBackup,
  parseBackup,
  validateAndCommitBackup,
} from '../src/storage/backup.ts';
import { MULTI_DECK_SESSION_ID } from '../src/storage/session.ts';
import type { Card, NormalizedCards } from '../src/core/types.ts';

const NOW = 1_700_000_000_000;

const card: Card = {
  id: 'user-card',
  deckId: 'vocabulary',
  front: 'Cảm ơn',
  back: 'ありがとう',
  furigana: 'ありがとう',
  romaji: 'arigatou',
  tags: ['bài 1'],
  lesson: 1,
  createdAt: NOW - 100,
  srs: {
    ease: 2.7,
    interval: 6,
    repetitions: 2,
    lapses: 1,
    due: NOW + 1000,
    lastRating: 'good',
    lastWrongAt: NOW - 50,
  },
};

const options = {
  cards: [card],
  settings: { theme: 'dark' as const, dailyNewLimit: 12, shuffleByDefault: true },
  contentSync: {
    contentVersion: 'content.1',
    cardIdsByDeck: { vocabulary: ['published-card'] },
  },
  screen: 'lessons' as const,
  session: {
    deckId: 'vocabulary',
    mode: 'flip' as const,
    focus: 'weak' as const,
    queue: ['user-card'],
    index: 0,
    revealed: true,
    rated: 0,
    mistakes: 0,
    savedAt: NOW - 100,
  },
};

test('versioned personal backup round-trips cards, SRS, settings and study session', () => {
  const text = createBackup({ ...options, includeProgress: true });
  const parsed = parseBackup(text, NOW);
  assert.equal(parsed.includeProgress, true);
  assert.deepEqual(parsed.cards[0], card);
  assert.deepEqual(parsed.settings, options.settings);
  assert.deepEqual(parsed.contentSync, options.contentSync);
  assert.equal(parsed.screen, 'lessons');
  assert.deepEqual(parsed.session, { ...options.session, lesson: undefined });
  assert.equal(parsed.session?.focus, 'weak');
  assert.equal(parsed.sessionExpired, false);
});

test('phiên nhiều bộ đi qua bản sao lưu như mọi phiên khác', () => {
  const text = createBackup({
    ...options,
    session: { ...options.session, deckId: MULTI_DECK_SESSION_ID, focus: 'random' as const },
    includeProgress: true,
  });
  const parsed = parseBackup(text, NOW);
  assert.equal(parsed.session?.focus, 'random');
  assert.equal(parsed.session?.deckId, MULTI_DECK_SESSION_ID);
});

test('phạm vi Collection đi kèm backup có tiến độ, và vắng mặt thì rơi về null', () => {
  const scope = { kind: 'lesson', deckId: 'vocabulary', lesson: 15 } as const;
  const parsed = parseBackup(createBackup({ ...options, collectionScope: scope, includeProgress: true }), NOW);
  assert.deepEqual(parsed.collectionScope, scope);

  // Backup cũ (không có trường này) vẫn đọc được: `null` để nơi gọi rơi về phạm vi
  // mặc định, không phải lỗi.
  const legacy = parseBackup(createBackup({ ...options, includeProgress: true }), NOW);
  assert.equal(legacy.collectionScope, null);

  // Không kèm tiến độ thì cũng không kèm phạm vi — hai thứ thuộc cùng một nhóm.
  const noProgress = parseBackup(
    createBackup({ ...options, collectionScope: scope, includeProgress: false }),
    NOW,
  );
  assert.equal(noProgress.collectionScope, null);
});

test('backup without progress excludes SRS and the unfinished session', () => {
  const parsed = parseBackup(createBackup({ ...options, includeProgress: false }), NOW);
  assert.equal(parsed.includeProgress, false);
  assert.equal('srs' in (parsed.cards[0] ?? {}), false);
  assert.equal(parsed.session, null);
  assert.equal(parsed.screen, 'home');
});

test('expired backup session is safely omitted while card progress remains', () => {
  const parsed = parseBackup(createBackup({ ...options, includeProgress: true }), NOW + 13 * 60 * 60 * 1000);
  assert.equal(parsed.cards[0]?.srs?.interval, 6);
  assert.equal(parsed.session, null);
  assert.equal(parsed.sessionExpired, true);
});

test('unsupported, malformed and duplicate backup data is rejected', () => {
  const valid = JSON.parse(createBackup({ ...options, includeProgress: true })) as Record<string, unknown>;
  assert.throws(() => parseBackup('{'), /JSON hợp lệ/);
  assert.throws(() => parseBackup(JSON.stringify({ ...valid, version: BACKUP_VERSION + 1 })), /không được hỗ trợ/);
  assert.throws(() => parseBackup(JSON.stringify({ ...valid, format: 'shared-deck' })), /không phải file backup/);

  const malformedCard = { ...card, srs: { ...card.srs, interval: -1 } };

  assert.throws(
    () => parseBackup(JSON.stringify({ ...valid, cards: [malformedCard] })),
    /SRS.*không hợp lệ/,
  );
  assert.throws(
    () => parseBackup(JSON.stringify({ ...valid, cards: [card, card] })),
    /id thẻ trùng/,
  );
  assert.throws(
    () => parseBackup(JSON.stringify({ ...valid, session: { ...options.session, queue: [1] } })),
    /Phiên học trong file backup không hợp lệ/,
  );
  assert.throws(
    () => parseBackup(JSON.stringify({ ...valid, settings: { ...options.settings, dailyNewLimit: 501 } })),
    /Cài đặt.*không hợp lệ/,
  );
  // Điểm lần trả lời cũng là một phần của trạng thái SRS: giá trị ngoài [0,1]
  // phải bị từ chối ngay ở cổng kiểm tra, không đẩy xuống cho lõi chịu đựng.
  for (const bad of [-0.1, 1.5, 'x']) {
    assert.throws(
      () => parseBackup(JSON.stringify({ ...valid, cards: [{ ...card, srs: { ...card.srs, lastScore: bad } }] })),
      /SRS.*không hợp lệ/,
      `lastScore=${String(bad)} phải bị từ chối`,
    );
  }
  assert.equal(valid['format'], BACKUP_FORMAT);
});

test('điểm lần trả lời đi theo backup, và backup cũ thiếu nó vẫn đọc được', () => {
  // Bản ghi có `lastScore` (định dạng mới) sống sót qua một vòng xuất–nhập.
  const withScore: Card = { ...card, srs: { ...card.srs, lastScore: 0.9 } };
  const text = createBackup({ ...options, cards: [withScore], includeProgress: true });
  const parsed = parseBackup(text, NOW);
  assert.equal(parsed.cards[0]?.srs?.lastScore, 0.9);

  // Bản ghi kiểu cũ (không có trường đó) KHÔNG bị gán 0 — vắng mặt khác hẳn
  // "0 điểm", nên các bản tổng hợp đọc `graded` để biết là chưa có dữ liệu.
  const legacy = parseBackup(createBackup({ ...options, includeProgress: true }), NOW);
  assert.equal(legacy.cards[0]?.srs?.lastScore, undefined);
  assert.equal(legacy.cards[0]?.srs?.interval, card.srs.interval);
});

test('thẻ không có furigana hoặc romaji vẫn sao lưu và khôi phục được', async () => {
  // Lỗi thật đã gặp: `requiredString` đòi furigana/romaji PHẢI khác rỗng, trong
  // khi hai trường đó là nội dung tuỳ chọn ở mọi đường khác (Editor, CSV, nội dung
  // xuất bản — `patterns` có thẻ romaji rỗng). Hệ quả: một thẻ như thế trong thư
  // viện làm CẢ file backup bị từ chối, tức người dùng không khôi phục được bản
  // sao lưu của chính mình. Cổng kiểm tra cấu trúc phải khớp với schema thẻ.
  const plain: Card = { ...card, id: 'plain', furigana: '', romaji: '' };
  const text = createBackup({ ...options, cards: [plain], includeProgress: true });
  const parsed = parseBackup(text, NOW);
  assert.deepEqual(parsed.cards[0], plain);

  // Trường vắng hẳn (bản ghi do công cụ khác tạo) đọc thành chuỗi rỗng, không lỗi.
  const withoutFields = JSON.parse(text) as { cards: Record<string, unknown>[] };
  delete withoutFields.cards[0]!['furigana'];
  delete withoutFields.cards[0]!['romaji'];
  const tolerant = parseBackup(JSON.stringify(withoutFields), NOW);
  assert.equal(tolerant.cards[0]?.furigana, '');
  assert.equal(tolerant.cards[0]?.romaji, '');
});

test('furigana hay romaji sai KIỂU vẫn bị từ chối, chỉ chuỗi rỗng là hợp lệ', () => {
  const valid = JSON.parse(createBackup({ ...options, includeProgress: true })) as Record<string, unknown>;
  for (const bad of [7, true, ['x']]) {
    assert.throws(
      () => parseBackup(JSON.stringify({ ...valid, cards: [{ ...card, romaji: bad }] })),
      /romaji/,
      `romaji=${JSON.stringify(bad)} phải bị từ chối`,
    );
  }
  assert.throws(
    () => parseBackup(JSON.stringify({ ...valid, cards: [{ ...card, front: '' }] })),
    /front/,
  );
});

test('invalid backup never calls the atomic commit callback', async () => {
  let committed = false;
  await assert.rejects(
    validateAndCommitBackup('{not json', {
      normalizeCards: async () => ({ cards: [card], rejected: [] }),
      commit: async () => {
        committed = true;
      },
      now: NOW,
    }),
    /JSON hợp lệ/,
  );
  assert.equal(committed, false);
});

test('all normalized records are committed once after validation', async () => {
  const text = createBackup({ ...options, includeProgress: true });
  let committedCards: Card[] = [];
  let committedMetadata: Record<string, unknown> = {};
  const result = await validateAndCommitBackup(text, {
    normalizeCards: async (): Promise<NormalizedCards> => ({ cards: [card], rejected: [] }),
    commit: async (cards, metadata) => {
      committedCards = cards;
      committedMetadata = metadata;
    },
    now: NOW,
  });
  assert.deepEqual(committedCards, [card]);
  assert.equal(committedMetadata['contentVersion'], 'content.1');
  assert.equal(result.backup.session?.queue[0], 'user-card');
});

test('normalizer rejection leaves the existing library untouched', async () => {
  let library = [card];
  await assert.rejects(
    validateAndCommitBackup(createBackup({ ...options, includeProgress: true }), {
      normalizeCards: async () => ({ cards: [], rejected: [{ index: 0, code: 'invalid_record', message: 'bad' }] }),
      commit: async (cards) => {
        library = cards;
      },
      now: NOW,
    }),
    /chưa bị thay đổi/,
  );
  assert.deepEqual(library, [card]);
});
