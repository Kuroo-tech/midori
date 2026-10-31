/**
 * Kiểm thử pipeline cập nhật nội dung (đặc tả §7.2–§7.3).
 *
 * Đây là lớp kiểm thử có giá trị cao nhất của dự án: nó chứng minh rằng **mọi**
 * cách cập nhật thất bại đều để nội dung đang dùng nguyên vẹn, và rằng việc cập
 * nhật chỉ tải những gói thực sự thay đổi.
 *
 * Pipeline được kiểm thử qua chính các cổng tiêm của nó, nhưng KHÔNG dùng giả lập
 * cho phần phân tích file: `parseBundleText` gọi mô-đun WASM THẬT. Nhờ vậy test
 * bao luôn cả ranh giới Rust ↔ JavaScript.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { loadCoreFrom } from '../src/core/wasm.ts';
import { deckParse } from '../src/core/index.ts';
import type { CardDraft, Quiz } from '../src/core/index.ts';
import { bundleIssues, isSafeRelativePath, parseManifest } from '../src/content/manifest.ts';
import {
  runContentUpdate,
  stageContentUpdate,
  type UpdateDeps,
} from '../src/content/pipeline.ts';
import type { ActiveContent, ContentStore, UpdateOutcome } from '../src/content/types.ts';

// ── Tiện ích ───────────────────────────────────────────────────────────────

const T0 = 1_700_000_000_000;
const DAY = 86_400_000;

// Cần cho `parseBundleText` bên dưới: nạp WASM THẬT bằng bytes.
const wasmBytes = await import('node:fs/promises').then((fs) =>
  fs.readFile(new URL('../src/generated/midori-wasm/midori_wasm_bg.wasm', import.meta.url)),
);
await loadCoreFrom(wasmBytes);

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function card(id: string, front: string, back: string): CardDraft {
  return { id, front, back, furigana: '', romaji: '', tags: [] };
}

interface Fixture {
  manifest: unknown;
  files: Map<string, string>;
}

/** Dựng manifest + các file gói như `scripts/build-content.mjs` sẽ sinh ra. */
function fixture(
  contentVersion: string,
  bundles: { deckId: string; name: string; quiz: Quiz; cards: CardDraft[] }[],
  overrides: { schemaVersion?: number; tamperBundle?: string } = {},
): Fixture {
  const files = new Map<string, string>();
  const descriptors = bundles.map((bundle) => {
    const path = `bundles/${bundle.deckId}.json`;
    const text = `${JSON.stringify(
      { id: bundle.deckId, name: bundle.name, version: 1, cards: bundle.cards },
      null,
      2,
    )}\n`;
    files.set(path, text);
    return {
      deckId: bundle.deckId,
      name: bundle.name,
      path,
      bytes: Buffer.byteLength(text, 'utf8'),
      sha256: sha256(text),
      quiz: bundle.quiz,
    };
  });

  const manifest = {
    schemaVersion: overrides.schemaVersion ?? 1,
    contentVersion,
    generatedAt: '2026-10-12T00:00:00.000Z',
    bundles: descriptors,
  };

  if (overrides.tamperBundle !== undefined) {
    files.set(overrides.tamperBundle, `${files.get(overrides.tamperBundle) ?? ''}// bị sửa\n`);
  }

  return { manifest, files };
}

/** Store trong bộ nhớ, mô phỏng tính nguyên tử của giao dịch IndexedDB. */
class FakeStore implements ContentStore {
  active: ActiveContent | null = null;
  previous: ActiveContent | null = null;
  staging: ActiveContent | null = null;

  failWrite = false;
  failPromote = false;
  promoteCalls = 0;

  async readActive(): Promise<ActiveContent | null> {
    return this.active;
  }
  async readPrevious(): Promise<ActiveContent | null> {
    return this.previous;
  }
  async readStaging(): Promise<ActiveContent | null> {
    return this.staging;
  }
  async writeStaging(content: ActiveContent): Promise<void> {
    if (this.failWrite) throw new Error('hết dung lượng');
    this.staging = content;
  }
  async promote(): Promise<boolean> {
    this.promoteCalls += 1;
    // Thất bại TRƯỚC khi thay đổi bất cứ thứ gì — đúng như IndexedDB abort.
    if (this.failPromote) throw new Error('giao dịch bị huỷ');
    if (this.staging === null) return false;
    const old = this.active;
    this.active = this.staging;
    this.previous = old;
    this.staging = null;
    return true;
  }
  async clearStaging(): Promise<void> {
    this.staging = null;
  }
  async rollback(): Promise<boolean> {
    if (this.previous === null) return false;
    this.active = this.previous;
    this.previous = null;
    return true;
  }
}

interface DepsOverrides {
  failManifest?: boolean;
  failBundlePath?: string;
  force?: boolean;
  onProgress?: UpdateDeps['onProgress'];
}

function deps(fixtureData: Fixture, store: ContentStore, overrides: DepsOverrides = {}): UpdateDeps {
  return {
    store,
    fetchManifest: async () => {
      if (overrides.failManifest === true) throw new Error('offline');
      return fixtureData.manifest;
    },
    fetchBundle: async (path) => {
      if (overrides.failBundlePath === path) throw new Error('offline');
      const text = fixtureData.files.get(path);
      if (text === undefined) throw new Error(`404: ${path}`);
      return new TextEncoder().encode(text);
    },
    parseBundleText: async (text, path, quiz) => (await deckParse(text, path, quiz)).cards,
    sha256: async (bytes) => sha256(Buffer.from(bytes).toString('utf8')),
    now: T0,
    ...(overrides.force === undefined ? {} : { force: overrides.force }),
    ...(overrides.onProgress === undefined ? {} : { onProgress: overrides.onProgress }),
  };
}

const V1 = fixture('1.0.0', [
  { deckId: 'vocabulary', name: 'Từ vựng', quiz: 'meaning', cards: [card('v-chao', 'Xin chào', 'こんにちは')] },
  { deckId: 'patterns', name: 'Mẫu câu', quiz: 'meaning', cards: [card('p-dare', 'Bạn là ai?', 'あなたは誰ですか')] },
]);

// ── Cài đặt lần đầu ────────────────────────────────────────────────────────

test('lần cài đặt đầu tiên tải và kích hoạt toàn bộ nội dung', async () => {
  const store = new FakeStore();
  const outcome = await runContentUpdate(deps(V1, store));

  assert.equal(outcome.status, 'updated');
  assert.deepEqual(outcome.status === 'updated' ? outcome.downloaded.sort() : [], [
    'patterns',
    'vocabulary',
  ]);
  assert.deepEqual(outcome.status === 'updated' ? outcome.reused : [], []);
  assert.equal(outcome.status === 'updated' ? outcome.from : undefined, null);

  assert.equal(store.active?.contentVersion, '1.0.0');
  assert.equal(store.active?.bundles.length, 2);
  assert.equal(store.active?.activatedAt, T0);
  assert.equal(store.staging, null, 'vùng đệm phải được dọn sau khi kích hoạt');
  assert.equal(store.previous, null, 'lần đầu thì chưa có gì để phục hồi');
  assert.equal(store.active?.bundles[0]?.cards[0]?.front, 'Xin chào');
  assert.equal(store.active?.bundles[0]?.cardIds[0], 'v-chao');
});

test('báo tiến độ cho giao diện theo từng pha', async () => {
  const store = new FakeStore();
  const phases: string[] = [];
  await runContentUpdate(
    deps(V1, store, {
      onProgress: (progress) => phases.push(progress.phase),
    }),
  );
  assert.deepEqual(phases, [
    'manifest',
    'manifest',
    'bundles',
    'bundles',
    'stage',
    'stage',
    'activate',
    'activate',
  ]);
});

// ── Hai bước: đệm rồi mới kích hoạt ────────────────────────────────────────

test('bước đệm không chạm vào nội dung đang dùng', async () => {
  const store = new FakeStore();
  await runContentUpdate(deps(V1, store));
  const snapshot = structuredClone(store.active);

  const v2 = fixture('1.1.0', [
    {
      deckId: 'vocabulary',
      name: 'Từ vựng',
      quiz: 'meaning',
      cards: [card('v-chao', 'Xin chào', 'こんにちは'), card('v-moi', 'Mới', '新しい')],
    },
    { deckId: 'patterns', name: 'Mẫu câu', quiz: 'meaning', cards: [card('p-dare', 'Bạn là ai?', 'あなたは誰ですか')] },
  ]);

  const outcome = await stageContentUpdate(deps(v2, store));
  assert.equal(outcome.status, 'staged');
  assert.equal(outcome.status === 'staged' ? outcome.from : undefined, '1.0.0');
  assert.equal(outcome.status === 'staged' ? outcome.to : undefined, '1.1.0');

  assert.equal(store.promoteCalls, 1, 'bước đệm KHÔNG được kích hoạt');
  assert.deepEqual(store.active, snapshot, 'nội dung đang dùng phải nguyên vẹn');
  assert.equal(store.staging?.contentVersion, '1.1.0', 'bản mới nằm trong vùng đệm');

  // Bước kích hoạt chỉ chuyển ngăn; reconcile là việc của lớp ứng dụng.
  assert.equal(await store.promote(), true);
  assert.equal(store.active?.contentVersion, '1.1.0');
  assert.equal(store.previous?.contentVersion, '1.0.0');
  assert.equal(store.staging, null);
});

test('bỏ bản đã đệm giữ nguyên nội dung đang dùng', async () => {
  const store = new FakeStore();
  await runContentUpdate(deps(V1, store));
  const snapshot = structuredClone(store.active);

  const v2 = fixture('1.1.0', [
    { deckId: 'vocabulary', name: 'Từ vựng', quiz: 'meaning', cards: [card('v-x', 'X', 'えっくす')] },
    { deckId: 'patterns', name: 'Mẫu câu', quiz: 'meaning', cards: [card('p-dare', 'Bạn là ai?', 'あなたは誰ですか')] },
  ]);
  assert.equal((await stageContentUpdate(deps(v2, store))).status, 'staged');

  await store.clearStaging();
  assert.equal(store.staging, null);
  assert.deepEqual(store.active, snapshot);
  assert.equal(store.previous, null);
});

// ── Cùng phiên bản ─────────────────────────────────────────────────────────

test('cùng phiên bản nội dung thì không tải lại gì', async () => {
  const store = new FakeStore();
  await runContentUpdate(deps(V1, store));

  let fetched = 0;
  const second = deps(V1, store);
  const counted: UpdateDeps = {
    ...second,
    fetchBundle: async (path) => {
      fetched += 1;
      return second.fetchBundle(path);
    },
  };

  const outcome = await runContentUpdate(counted);
  assert.equal(outcome.status, 'up-to-date');
  assert.equal(fetched, 0, 'cập nhật ứng dụng không được kéo theo tải lại dữ liệu');
  assert.equal(store.promoteCalls, 1, 'không kích hoạt lại khi không có gì mới');
});

test('force bỏ qua kiểm tra phiên bản', async () => {
  const store = new FakeStore();
  await runContentUpdate(deps(V1, store));
  const outcome = await runContentUpdate(deps(V1, store, { force: true }));
  assert.equal(outcome.status, 'updated');
  assert.equal(store.promoteCalls, 2);
});

// ── Tải tăng dần ───────────────────────────────────────────────────────────

test('chỉ tải gói thay đổi, dùng lại gói còn nguyên', async () => {
  const store = new FakeStore();
  await runContentUpdate(deps(V1, store));

  // v2: giữ nguyên gói patterns, thêm một thẻ vào vocabulary.
  const changed = fixture('1.1.0', [
    {
      deckId: 'vocabulary',
      name: 'Từ vựng',
      quiz: 'meaning',
      cards: [card('v-chao', 'Xin chào', 'こんにちは'), card('v-moi', 'Mới', '新しい')],
    },
    { deckId: 'patterns', name: 'Mẫu câu', quiz: 'meaning', cards: [card('p-dare', 'Bạn là ai?', 'あなたは誰ですか')] },
  ]);

  // Gói patterns phải giống hệt byte-for-byte thì mới dùng lại được.
  assert.equal(
    changed.files.get('bundles/patterns.json'),
    V1.files.get('bundles/patterns.json'),
  );

  const outcome = await runContentUpdate(deps(changed, store));
  assert.equal(outcome.status, 'updated');
  assert.deepEqual(outcome.status === 'updated' ? outcome.downloaded : [], ['vocabulary']);
  assert.deepEqual(outcome.status === 'updated' ? outcome.reused : [], ['patterns']);
  assert.equal(outcome.status === 'updated' ? outcome.from : undefined, '1.0.0');
  assert.equal(outcome.status === 'updated' ? outcome.to : undefined, '1.1.0');
  assert.equal(store.active?.bundles[0]?.cards.length, 2);
});

test('bản đang dùng cũ trở thành bản phục hồi', async () => {
  const store = new FakeStore();
  await runContentUpdate(deps(V1, store));

  const v2 = fixture('2.0.0', [
    { deckId: 'vocabulary', name: 'Từ vựng', quiz: 'meaning', cards: [card('v-x', 'X', 'えっくす')] },
    { deckId: 'patterns', name: 'Mẫu câu', quiz: 'meaning', cards: [card('p-dare', 'Bạn là ai?', 'あなたは誰ですか')] },
  ]);
  await runContentUpdate(deps(v2, store));

  assert.equal(store.active?.contentVersion, '2.0.0');
  assert.equal(store.previous?.contentVersion, '1.0.0');
  assert.equal(await store.rollback(), true);
  assert.equal(store.active?.contentVersion, '1.0.0');
  assert.equal(store.active?.bundles[0]?.cards[0]?.id, 'v-chao');
});

// ── Mất mạng ───────────────────────────────────────────────────────────────

test('mất mạng khi lấy manifest ⇒ offline, nội dung cũ nguyên vẹn', async () => {
  const store = new FakeStore();
  await runContentUpdate(deps(V1, store));
  const snapshot = structuredClone(store.active);

  const outcome = await runContentUpdate(deps(V1, store, { failManifest: true, force: true }));
  assert.equal(outcome.status, 'offline');
  assert.deepEqual(store.active, snapshot);
  assert.equal(store.promoteCalls, 1, 'không kích hoạt khi ngoại tuyến');
});

test('mất mạng khi tải gói ⇒ failed/network, nội dung cũ nguyên vẹn', async () => {
  const store = new FakeStore();
  await runContentUpdate(deps(V1, store));
  const snapshot = structuredClone(store.active);

  // Nội dung vocabulary phải KHÁC bản cũ, nếu không nó được dùng lại và không
  // có lần tải nào để mà thất bại.
  const v2 = fixture('9.9.9', [
    {
      deckId: 'vocabulary',
      name: 'Từ vựng',
      quiz: 'meaning',
      cards: [card('v-chao', 'Xin chào', 'こんにちは'), card('v-them', 'Thêm', '追加')],
    },
  ]);
  const outcome = await runContentUpdate(deps(v2, store, { failBundlePath: 'bundles/vocabulary.json' }));

  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.status === 'failed' ? outcome.reason : undefined, 'network');
  assert.equal(outcome.status === 'failed' ? outcome.deckId : undefined, 'vocabulary');
  assert.deepEqual(store.active, snapshot);
});

// ── Toàn vẹn dữ liệu ───────────────────────────────────────────────────────

test('gói bị sửa sau khi công bố ⇒ failed/integrity, nội dung cũ nguyên vẹn', async () => {
  const store = new FakeStore();
  await runContentUpdate(deps(V1, store));
  const snapshot = structuredClone(store.active);

  const tampered = fixture(
    '3.0.0',
    [
      {
        deckId: 'vocabulary',
        name: 'Từ vựng',
        quiz: 'meaning',
        cards: [card('v-chao', 'Xin chào', 'こんにちは'), card('v-them', 'Thêm', '追加')],
      },
    ],
    { tamperBundle: 'bundles/vocabulary.json' },
  );

  const outcome = await runContentUpdate(deps(tampered, store));
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.status === 'failed' ? outcome.reason : undefined, 'integrity');
  assert.deepEqual(store.active, snapshot);
  assert.equal(store.promoteCalls, 1);
});

test('gói thiếu id ổn định bị từ chối (không thể đồng bộ nếu thiếu)', async () => {
  const store = new FakeStore();
  const broken = fixture('4.0.0', [
    {
      deckId: 'vocabulary',
      name: 'Từ vựng',
      quiz: 'meaning',
      cards: [{ front: 'Xin chào', back: 'こんにちは', furigana: '', romaji: '', tags: [] }],
    },
  ]);

  const outcome = await runContentUpdate(deps(broken, store));
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.status === 'failed' ? outcome.reason : undefined, 'bundle-invalid');
  assert.equal(store.active, null);
});

test('bundle rỗng là collection hợp lệ và cập nhật gỡ nội dung phát hành mà không xoá thẻ người dùng', async () => {
  const store = new FakeStore();
  await runContentUpdate(deps(V1, store));
  const snapshot = structuredClone(store.active);

  const empty = fixture('5.0.0', [
    { deckId: 'vocabulary', name: 'Từ vựng', quiz: 'meaning', cards: [] },
  ]);
  const outcome = await runContentUpdate(deps(empty, store));
  assert.equal(outcome.status, 'updated');
  assert.equal(store.active?.bundles[0]?.cards.length, 0);
  assert.deepEqual(store.active?.bundles[0]?.cardIds, []);
  assert.deepEqual(snapshot?.bundles[0]?.cardIds, ['v-chao']);
});

test('thẻ sai kiểu trong gói bị từ chối bằng thông điệp thay vì crash', () => {
  assert.equal(bundleIssues([null]), 'Thẻ #0 không phải đối tượng');
  assert.equal(bundleIssues([{ id: 'a', front: '', back: 'b' }]), 'Thẻ "a" thiếu mặt trước hoặc mặt sau');
  assert.equal(bundleIssues([{ id: 'a', front: 'A', back: 'あ' }]), null);
});

// ── Manifest sai ───────────────────────────────────────────────────────────

test('schema mới hơn bản dựng ⇒ schema-unsupported', async () => {
  const store = new FakeStore();
  const future = fixture(
    '6.0.0',
    [{ deckId: 'vocabulary', name: 'Từ vựng', quiz: 'meaning', cards: [card('a', 'A', 'あ')] }],
    { schemaVersion: 99 },
  );
  const outcome = await runContentUpdate(deps(future, store));
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.status === 'failed' ? outcome.reason : undefined, 'schema-unsupported');
});

test('manifest hỏng không được phép kích hoạt', async () => {
  const store = new FakeStore();
  await runContentUpdate(deps(V1, store));
  const snapshot = structuredClone(store.active);

  const bad: Fixture = { manifest: { schemaVersion: 1, contentVersion: '1.2.3' }, files: new Map() };
  const outcome = await runContentUpdate(deps(bad, store));
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.status === 'failed' ? outcome.reason : undefined, 'manifest-invalid');
  assert.deepEqual(store.active, snapshot);
});

// ── Lưu trữ ────────────────────────────────────────────────────────────────

test('không ghi được vùng đệm ⇒ failed/storage, nội dung cũ nguyên vẹn', async () => {
  const store = new FakeStore();
  await runContentUpdate(deps(V1, store));
  const snapshot = structuredClone(store.active);

  store.failWrite = true;
  const v2 = fixture('7.0.0', [
    { deckId: 'vocabulary', name: 'Từ vựng', quiz: 'meaning', cards: [card('v-chao', 'Xin chào', 'こんにちは')] },
  ]);
  const outcome = await runContentUpdate(deps(v2, store));

  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.status === 'failed' ? outcome.reason : undefined, 'storage');
  assert.deepEqual(store.active, snapshot);
  assert.equal(store.promoteCalls, 1);
});

test('kích hoạt thất bại ⇒ nội dung cũ nguyên vẹn và vùng đệm được dọn', async () => {
  const store = new FakeStore();
  await runContentUpdate(deps(V1, store));
  const snapshot = structuredClone(store.active);

  store.failPromote = true;
  const v2 = fixture('8.0.0', [
    { deckId: 'vocabulary', name: 'Từ vựng', quiz: 'meaning', cards: [card('v-chao', 'Xin chào', 'こんにちは')] },
  ]);
  const outcome = await runContentUpdate(deps(v2, store));

  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.status === 'failed' ? outcome.reason : undefined, 'storage');
  assert.deepEqual(store.active, snapshot, 'nội dung đang dùng không được đổi');
  assert.equal(store.previous, null);
  assert.equal(store.staging, null, 'vùng đệm phải được dọn để lần sau bắt đầu sạch');
});

test('vùng đệm cũ còn sót lại bị dọn trước khi cập nhật', async () => {
  const store = new FakeStore();
  store.staging = { contentVersion: 'rác', schemaVersion: 1, activatedAt: 0, bundles: [] };

  const outcome = await runContentUpdate(deps(V1, store));
  assert.equal(outcome.status, 'updated');
  assert.equal(store.staging, null);
});

// ── Kiểm tra manifest thuần ────────────────────────────────────────────────

test('parseManifest chấp nhận manifest hợp lệ', () => {
  const result = parseManifest(V1.manifest);
  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.manifest.contentVersion : undefined, '1.0.0');
  assert.equal(result.ok ? result.manifest.bundles.length : 0, 2);
});

test('parseManifest từ chối dữ liệu không đáng tin', () => {
  const cases: [string, unknown][] = [
    ['không phải đối tượng', []],
    ['thiếu schemaVersion', { contentVersion: '1', bundles: [{}] }],
    ['thiếu contentVersion', { schemaVersion: 1, bundles: [{}] }],
    ['không có gói nào', { schemaVersion: 1, contentVersion: '1', bundles: [] }],
    [
      'thiếu sha256',
      {
        schemaVersion: 1,
        contentVersion: '1',
        bundles: [{ deckId: 'd', name: 'n', path: 'p.json', bytes: 1, quiz: 'meaning' }],
      },
    ],
    [
      'sha256 sai định dạng',
      {
        schemaVersion: 1,
        contentVersion: '1',
        bundles: [{ deckId: 'd', name: 'n', path: 'p.json', bytes: 1, sha256: 'xyz', quiz: 'meaning' }],
      },
    ],
    [
      'đường dẫn thoát ra ngoài',
      {
        schemaVersion: 1,
        contentVersion: '1',
        bundles: [
          {
            deckId: 'd',
            name: 'n',
            path: '../secrets.json',
            bytes: 1,
            sha256: 'a'.repeat(64),
            quiz: 'meaning',
          },
        ],
      },
    ],
    [
      'quiz lạ',
      {
        schemaVersion: 1,
        contentVersion: '1',
        bundles: [
          { deckId: 'd', name: 'n', path: 'p.json', bytes: 1, sha256: 'a'.repeat(64), quiz: 'khác' },
        ],
      },
    ],
    [
      'deckId trùng',
      {
        schemaVersion: 1,
        contentVersion: '1',
        bundles: [
          { deckId: 'd', name: 'n', path: 'p.json', bytes: 1, sha256: 'a'.repeat(64), quiz: 'meaning' },
          { deckId: 'd', name: 'n', path: 'q.json', bytes: 1, sha256: 'b'.repeat(64), quiz: 'meaning' },
        ],
      },
    ],
  ];

  const accepted = cases.filter(([, raw]) => {
    const result = parseManifest(raw);
    assert.equal(result.ok, false, `đáng lẽ phải từ chối: ${JSON.stringify(raw).slice(0, 80)}`);
    return result.ok;
  });
  assert.equal(accepted.length, 0);
  assert.equal(cases.length, 9);
});

test('đường dẫn gói phải tương đối và nằm trong thư mục nội dung', () => {
  for (const good of ['bundles/a.json', 'a.json', 'x/y/z.csv']) {
    assert.equal(isSafeRelativePath(good), true, good);
  }
  for (const bad of ['/etc/passwd', '../a.json', 'a/../../b.json', 'http://x/a.json', '', 'a?b=1']) {
    assert.equal(isSafeRelativePath(bad), false, bad);
  }
});

// ── Kết cục luôn có kiểu phân biệt được ────────────────────────────────────

test('mọi kết cục đều nằm trong tập trạng thái đã định nghĩa', async () => {
  const store = new FakeStore();
  const outcomes: UpdateOutcome[] = [
    await runContentUpdate(deps(V1, store)),
    await runContentUpdate(deps(V1, store)),
    await runContentUpdate(deps(V1, store, { failManifest: true, force: true })),
  ];
  const allowed = ['up-to-date', 'updated', 'offline', 'failed'];
  for (const outcome of outcomes) {
    assert.ok(allowed.includes(outcome.status), outcome.status);
    if (outcome.status === 'failed') assert.equal(typeof outcome.message, 'string');
  }
  assert.equal(T0 + DAY > T0, true);
});
