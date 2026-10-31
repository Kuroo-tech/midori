/**
 * Kiểm thử chuẩn hoá bản lưu phiên học.
 *
 * Bản lưu là **dữ liệu phụ**. Sai ở đây không được phép làm ứng dụng không dùng
 * được — nhưng cũng không được phép khôi phục một phiên vô nghĩa. Cả hai chiều
 * đều được kiểm ở đây.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isScreen, navigationSection } from '../src/app/screen.ts';
import { isKanjiDeck, KANJI_CATEGORIES } from '../src/app/content-sections.ts';
import {
  MULTI_DECK_SESSION_ID,
  SESSION_TTL_MS,
  normalizeSession,
  persistScreenSafely,
  persistSessionSafely,
} from '../src/storage/session.ts';

const NOW = 1_700_000_000_000;

/** Một bản lưu hợp lệ, để từng test chỉ đổi đúng trường nó quan tâm. */
function valid(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    deckId: 'vocabulary',
    mode: 'flip',
    queue: ['a', 'b', 'c'],
    index: 1,
    revealed: false,
    rated: 1,
    mistakes: 0,
    savedAt: NOW - 1000,
    ...patch,
  };
}

test('bản lưu hợp lệ được đọc nguyên vẹn', () => {
  const session = normalizeSession(valid(), NOW);
  assert.notEqual(session, null);
  assert.deepEqual(session?.queue, ['a', 'b', 'c']);
  assert.equal(session?.index, 1);
  assert.equal(session?.deckId, 'vocabulary');
  assert.equal(session?.mode, 'flip');
  assert.equal(session?.focus, 'due');
  assert.equal(session?.rated, 1);
  assert.equal(session?.mistakes, 0);
  assert.equal(session?.revealed, false);
});

test('study focus round-trips and legacy sessions default to due cards', () => {
  assert.equal(normalizeSession(valid({ focus: 'weak' }), NOW)?.focus, 'weak');
  // Phiên nhiều bộ (ngẫu nhiên, hoặc phạm vi toàn thư viện): deckId là ký hiệu `*`,
  // không phải một bộ thật. Cả hai trường phải sống sót qua chuẩn hoá.
  const random = normalizeSession(
    valid({ focus: 'random', deckId: MULTI_DECK_SESSION_ID }),
    NOW,
  );
  assert.equal(random?.focus, 'random');
  assert.equal(random?.deckId, MULTI_DECK_SESSION_ID);
  assert.equal(normalizeSession(valid({ focus: 'invalid' }), NOW), null);
  assert.equal(normalizeSession(valid(), NOW)?.focus, 'due');
});

test('giá trị không phải object bị từ chối thay vì gây lỗi', () => {
  for (const bad of [null, undefined, 'x', 42, true, ['a']]) {
    assert.equal(normalizeSession(bad, NOW), null, `đầu vào: ${String(bad)}`);
  }
});

test('thiếu trường bắt buộc thì không khôi phục', () => {
  assert.equal(normalizeSession(valid({ deckId: '' }), NOW), null);
  assert.equal(normalizeSession(valid({ deckId: 7 }), NOW), null);
  assert.equal(normalizeSession(valid({ mode: 'khác' }), NOW), null);
  assert.equal(normalizeSession(valid({ mode: undefined }), NOW), null);
  assert.equal(normalizeSession(valid({ queue: 'a,b' }), NOW), null);
  assert.equal(normalizeSession(valid({ savedAt: undefined }), NOW), null);
  assert.equal(normalizeSession(valid({ savedAt: 'hôm qua' }), NOW), null);
});

test('hàng đợi rỗng hoặc chỉ chứa giá trị rác thì coi như không có phiên', () => {
  assert.equal(normalizeSession(valid({ queue: [] }), NOW), null);
  assert.equal(normalizeSession(valid({ queue: [1, null, '', {}] }), NOW), null);
  // Phần tử rác bị loại, phần còn lại vẫn dùng được.
  assert.deepEqual(normalizeSession(valid({ queue: ['a', 1, '', 'b'] }), NOW)?.queue, ['a', 'b']);
});

test('vị trí được kẹp vào trong hàng đợi', () => {
  // Hàng đợi dài 3, vị trí 99 ⇒ coi như phiên đã đi hết.
  assert.equal(normalizeSession(valid({ index: 99 }), NOW)?.index, 3);
  // Vị trí âm hoặc không hữu hạn ⇒ quay về 0 thay vì từ chối cả bản lưu.
  assert.equal(normalizeSession(valid({ index: -3 }), NOW)?.index, 0);
  assert.equal(normalizeSession(valid({ index: Number.NaN }), NOW)?.index, 0);
});

test('số đếm thiếu hoặc vô lý quay về 0', () => {
  assert.equal(normalizeSession(valid({ rated: undefined }), NOW)?.rated, 0);
  assert.equal(normalizeSession(valid({ rated: -5 }), NOW)?.rated, 0);
  assert.equal(normalizeSession(valid({ mistakes: 'hai' }), NOW)?.mistakes, 0);
  assert.equal(normalizeSession(valid({ revealed: 'có' }), NOW)?.revealed, false);
  assert.equal(normalizeSession(valid({ revealed: true }), NOW)?.revealed, true);
});

test('phiên quá cũ không được khôi phục', () => {
  // Vừa đúng ngưỡng: vẫn dùng được.
  assert.notEqual(normalizeSession(valid({ savedAt: NOW - SESSION_TTL_MS }), NOW), null);
  // Quá ngưỡng một mili giây: bỏ.
  assert.equal(normalizeSession(valid({ savedAt: NOW - SESSION_TTL_MS - 1 }), NOW), null);
});

test('mốc thời gian ở tương lai bị từ chối', () => {
  // Đồng hồ máy bị chỉnh lùi, hoặc dữ liệu bị sửa tay. Khôi phục một phiên "từ
  // tương lai" sẽ khiến hạn dùng không bao giờ hết.
  assert.equal(normalizeSession(valid({ savedAt: NOW + 1 }), NOW), null);
});

test('màn hình chỉ nhận các giá trị đã biết', () => {
  assert.ok(isScreen('home'));
  assert.ok(isScreen('lessons'));
  assert.ok(isScreen('transfer'));
  assert.ok(isScreen('settings'));
  for (const bad of ['', 'Home', 'admin', null, 3, undefined]) {
    assert.equal(isScreen(bad), false, `đầu vào: ${String(bad)}`);
  }
});

test('màn hình phụ giữ mục điều hướng gốc được đánh dấu', () => {
  // Màn con thuộc đúng mục của màn hình mở nó: Bài học/Kanji/Collection/Phiên học
  // → Trang chủ (mục Học đã gộp vào đó), Thống kê và Trình biên tập → Cài đặt (mục
  // Thư viện đã chuyển sang Cài đặt). Tab dưới đánh dấu theo ánh xạ này.
  assert.equal(navigationSection('kanji'), 'home');
  assert.equal(navigationSection('lessons'), 'home');
  assert.equal(navigationSection('collection'), 'home');
  assert.equal(navigationSection('session'), 'home');
  assert.equal(navigationSection('stats'), 'settings');
  assert.equal(navigationSection('editor'), 'settings');
  assert.equal(navigationSection('transfer'), 'transfer');
  assert.equal(navigationSection('settings'), 'settings');
});

test('màn Kanji chỉ nhận các bộ có danh tính Kanji, không phải mọi bộ hỏi kiểu đọc', () => {
  assert.equal(isKanjiDeck('kanji-noun'), true);
  assert.equal(isKanjiDeck('vocabulary-reading'), false);
  assert.equal(isKanjiDeck('patterns'), false);
});

test('Kanji có đủ bảy danh mục, mỗi danh mục một bộ thẻ riêng', () => {
  assert.deepEqual(
    KANJI_CATEGORIES.map(({ label }) => label),
    [
      'Danh từ',
      'Động từ',
      'Tính từ đuôi i',
      'Tính từ đuôi na',
      'Trạng từ',
      'Thời gian & số lượng',
      'Từ ghép Hán Nhật',
    ],
  );
  // Bảy danh mục KHÔNG còn ứng với bảy màn hình riêng: mỗi nhóm được mở bằng
  // Collection với phạm vi `{ kind: 'deck', deckId }` (xem `KanjiOverview.svelte`),
  // nên thứ phải duy nhất là `deckId`.
  assert.equal(new Set(KANJI_CATEGORIES.map(({ deckId }) => deckId)).size, 7);
  assert.equal(
    new Set(KANJI_CATEGORIES.map(({ id }) => id)).size,
    7,
  );
});

test('lỗi ghi phiên được báo về cho giao diện thay vì tạo kết quả thành công giả', async () => {
  const session = normalizeSession(valid(), NOW);
  if (session === null) assert.fail('Phiên hợp lệ không được bị loại');
  assert.equal(
    await persistSessionSafely(session, async () => {
      throw new Error('quota');
    }),
    false,
  );
  assert.equal(await persistSessionSafely(session, async () => {}), true);
});

test('lỗi lưu màn hình được trả về tường minh thay vì bị bỏ qua', async () => {
  const cause = new Error('quota');
  assert.deepEqual(
    await persistScreenSafely('lessons', async () => {
      throw cause;
    }),
    { ok: false, error: cause },
  );
  assert.deepEqual(await persistScreenSafely('stats', async () => {}), { ok: true });
});
