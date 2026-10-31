/**
 * Dịch vụ nội dung — nối pipeline thuần với môi trường thật (mạng, WASM, lưu trữ).
 *
 * Pipeline ở `pipeline.ts` cố tình không biết gì về trình duyệt. Ở đây mọi phụ
 * thuộc được tiêm vào, nên chính dịch vụ này cũng kiểm thử được bằng cách truyền
 * `fetchImpl` giả.
 *
 * # Vì sao có "nội dung hạt giống"
 *
 * Khi lần chạy đầu tiên ngoại tuyến, ứng dụng vẫn mở được với các collection
 * rỗng. Bản dựng mang theo cấu trúc hạt giống (`src/generated/content-seed.json`,
 * sinh bởi `scripts/build-content.mjs`), không chứa thẻ mặc định và được cài vào
 * ngăn `active` qua đúng đường kích hoạt nguyên tử của pipeline.
 */

import { deckParse, type CardDraft, type Quiz } from '../core/index.ts';
import { sha256Hex } from '../platform/crypto.ts';
import seedContent from '../generated/content-seed.json' with { type: 'json' };
import { bundleUrl, manifestUrl } from './manifest.ts';
import { stageContentUpdate, type UpdateProgress } from './pipeline.ts';
import { createContentStore } from './store.ts';
import type { ActiveContent, ContentStore, StageOutcome } from './types.ts';

/**
 * Nội dung hạt giống đi kèm bản dựng.
 *
 * `activatedAt` do script sinh ra luôn là 0; thời điểm thật được đóng dấu lúc
 * cài đặt, vì thời điểm đó chỉ biết được khi chạy.
 */
export function readSeedContent(now: number = Date.now()): ActiveContent {
  return { ...(seedContent as ActiveContent), activatedAt: now };
}

export interface ContentServiceOptions {
  store?: ContentStore;
  fetchImpl?: typeof fetch;
  now?: () => number;
  onProgress?: (progress: UpdateProgress) => void;
}

export interface ContentService {
  /** Nội dung đang dùng; cài cấu trúc collection rỗng nếu chưa có gì. */
  ensureActive(): Promise<ActiveContent>;
  readActive(): Promise<ActiveContent | null>;
  readPrevious(): Promise<ActiveContent | null>;
  /** Tải và đệm bản nội dung mới — chưa kích hoạt, chưa chạm thư viện. */
  stage(options?: { force?: boolean }): Promise<StageOutcome>;
  /** Bản đã đệm, đang chờ kích hoạt. */
  readStaged(): Promise<ActiveContent | null>;
  /**
   * Kích hoạt bản đã đệm bằng giao dịch nguyên tử: `staging → active`,
   * `active cũ → previous`, xoá `staging`.
   *
   * @returns `false` nếu không có gì trong vùng đệm
   */
  activateStaged(): Promise<boolean>;
  /** Bỏ bản đã đệm. Nội dung đang dùng không đổi. */
  discardStaged(): Promise<void>;
  /** Khôi phục nội dung đang dùng trước lần kích hoạt gần nhất. */
  rollback(): Promise<boolean>;
  /** Cài lại cấu trúc collection mặc định rỗng (đường thoát khi nội dung hỏng). */
  reinstallSeed(): Promise<ActiveContent>;
}

export function createContentService(options: ContentServiceOptions = {}): ContentService {
  const store = options.store ?? createContentStore();
  const doFetch = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = options.now ?? (() => Date.now());

  async function fetchJson(url: string): Promise<unknown> {
    const response = await doFetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function fetchBytes(url: string): Promise<Uint8Array> {
    const response = await doFetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async function activate(content: ActiveContent): Promise<void> {
    await store.writeStaging(content);
    const promoted = await store.promote();
    if (!promoted) throw new Error('Không kích hoạt được nội dung');
  }

  return {
    async ensureActive(): Promise<ActiveContent> {
      const active = await store.readActive();
      if (active !== null) return active;
      const seed = readSeedContent(now());
      await activate(seed);
      return seed;
    },

    readActive: () => store.readActive(),

    readPrevious: () => store.readPrevious(),

    readStaged: () => store.readStaging(),

    async stage(stageOptions = {}): Promise<StageOutcome> {
      return stageContentUpdate({
        store,
        fetchManifest: () => fetchJson(manifestUrl()),
        fetchBundle: (path) => fetchBytes(bundleUrl(path)),
        // Một lần vượt biên WASM cho cả gói: phân tích CSV/JSON là việc của lõi.
        parseBundleText: async (text: string, path: string, quiz: Quiz): Promise<CardDraft[]> => {
          const parsed = await deckParse(text, path, quiz);
          return parsed.cards;
        },
        sha256: sha256Hex,
        now: now(),
        ...(stageOptions.force === undefined ? {} : { force: stageOptions.force }),
        ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
      });
    },

    activateStaged: () => store.promote(),

    discardStaged: () => store.clearStaging(),

    rollback: () => store.rollback(),

    async reinstallSeed(): Promise<ActiveContent> {
      const seed = readSeedContent(now());
      await activate(seed);
      return seed;
    },
  };
}
