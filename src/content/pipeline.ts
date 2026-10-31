/**
 * Pipeline cập nhật **nội dung offline**.
 *
 * Trình tự (đặc tả §7.3) — và vì sao mỗi bước ở đúng vị trí đó:
 *
 * 1. Đọc nội dung đang dùng TRƯỚC TIÊN, để mọi nhánh trả về sau đó đều có mốc
 *    so sánh và để biết gói nào dùng lại được.
 * 2. Lấy manifest từ nguồn chính thức. Lỗi mạng ở đây ⇒ `offline`, **không phải**
 *    lỗi: ứng dụng phải tiếp tục chạy với nội dung sẵn có.
 * 3. Nếu cùng phiên bản nội dung ⇒ dừng. Cập nhật ứng dụng KHÔNG đồng nghĩa với
 *    tải lại toàn bộ dữ liệu (§7.2).
 * 4. Gói nào có `sha256` y hệt bản cũ thì dùng lại, không tải lại.
 * 5. Tải + kiểm tra toàn vẹn + kiểm tra định dạng **trước khi** ghi bất cứ thứ gì
 *    vào vùng đệm.
 * 6. Chỉ khi MỌI gói hợp lệ mới ghi vùng đệm. Đây là điểm DỪNG: người dùng còn
 *    phải xem trước số thẻ thay đổi rồi mới quyết định.
 * 7. Kích hoạt bằng một giao dịch nguyên tử — chỉ khi người dùng bấm "Kích hoạt".
 *
 * Vì vậy tệp này tách làm hai hàm: {@link stageContentUpdate} dừng ở bước 6,
 * {@link runContentUpdate} chạy nốt bước 7 cho những nơi không cần xem trước.
 *
 * Bất kỳ thất bại nào trong bước 2–7 đều để nội dung đang dùng nguyên vẹn.
 *
 * Hàm ở đây là hàm thuần theo nghĩa: mọi phụ thuộc vào mạng, lưu trữ, băm và
 * phân tích file đều được tiêm vào, nên toàn bộ luồng kiểm thử được trong Node
 * mà không cần trình duyệt (`tests/content-pipeline.test.ts`).
 */

import type { CardDraft, Quiz } from '../core/types.ts';
import { bundleIssues, parseManifest } from './manifest.ts';
import {
  FAILURE_LABELS,
  type ActiveContent,
  type BundleData,
  type ContentStore,
  type StageOutcome,
  type UpdateFailureReason,
  type UpdateOutcome,
} from './types.ts';

/** Tiến độ cập nhật, để giao diện hiển thị. */
export interface UpdateProgress {
  phase: 'manifest' | 'bundles' | 'stage' | 'activate';
  done: number;
  total: number;
  /** Gói đang xử lý, nếu có. */
  deckId?: string;
}

/** Mọi phụ thuộc bên ngoài của pipeline. */
export interface UpdateDeps {
  store: ContentStore;
  /** Lấy manifest đã phân tích thành JSON. Ném lỗi ⇒ coi như mất mạng. */
  fetchManifest: () => Promise<unknown>;
  /** Lấy bytes thô của một gói nội dung. Ném lỗi ⇒ coi như mất mạng. */
  fetchBundle: (path: string) => Promise<Uint8Array>;
  /** Phân tích nội dung gói thành nháp. Ném lỗi ⇒ gói sai định dạng. */
  parseBundleText: (text: string, path: string, quiz: Quiz) => Promise<CardDraft[]>;
  /** Băm SHA-256 dạng hex thường. */
  sha256: (bytes: Uint8Array) => Promise<string>;
  now: number;
  /** Bỏ qua kiểm tra "đã là bản mới nhất". */
  force?: boolean;
  onProgress?: (progress: UpdateProgress) => void;
}

/**
 * Kiểm tra rồi TẢI + ĐỆM nội dung mới, **không** kích hoạt.
 *
 * Kết cục `staged` nghĩa là vùng đệm đã sẵn sàng và nội dung đang dùng chưa bị
 * đụng tới. Bên gọi phải hoặc gọi `promote()`/`activateStaged()` để kích hoạt,
 * hoặc `clearStaging()` để bỏ đi.
 *
 * Không bao giờ ném lỗi vì lý do có thể dự đoán được: mọi kết cục đều được báo
 * qua {@link UpdateOutcome} để giao diện xử lý được mà không cần `try/catch`.
 */
export async function stageContentUpdate(deps: UpdateDeps): Promise<StageOutcome> {
  const { store, now } = deps;
  const report = deps.onProgress;

  // 1. Nội dung đang dùng.
  const active = await store.readActive();

  // Dọn vùng đệm còn sót lại từ lần chạy bị ngắt. Vô hại nếu trống.
  await clearStagingQuietly(store);

  // 2. Manifest.
  report?.({ phase: 'manifest', done: 0, total: 1 });
  let rawManifest: unknown;
  try {
    rawManifest = await deps.fetchManifest();
  } catch {
    return { status: 'offline' };
  }

  const parsed = parseManifest(rawManifest);
  if (!parsed.ok) {
    return { status: 'failed', reason: parsed.reason, message: parsed.message };
  }
  const manifest = parsed.manifest;
  report?.({ phase: 'manifest', done: 1, total: 1 });

  // 3. Đã mới nhất?
  if (!deps.force && active !== null && active.contentVersion === manifest.contentVersion) {
    return {
      status: 'up-to-date',
      contentVersion: manifest.contentVersion,
      bundles: manifest.bundles.length,
    };
  }

  // 4–5. Chuẩn bị từng gói: dùng lại hoặc tải mới rồi xác minh.
  const reusable = new Map<string, BundleData>();
  for (const bundle of active?.bundles ?? []) {
    reusable.set(bundle.deckId, bundle);
  }

  const bundles: BundleData[] = [];
  const downloaded: string[] = [];
  const reused: string[] = [];
  const total = manifest.bundles.length;

  for (const [index, descriptor] of manifest.bundles.entries()) {
    report?.({ phase: 'bundles', done: index, total, deckId: descriptor.deckId });

    const candidate = reusable.get(descriptor.deckId);
    if (candidate !== undefined && candidate.sha256 === descriptor.sha256) {
      bundles.push({ ...candidate, name: descriptor.name, quiz: descriptor.quiz });
      reused.push(descriptor.deckId);
      continue;
    }

    const fetched = await fetchVerifiedBundle(deps, descriptor.path);
    if (typeof fetched === 'string') {
      return failure(fetched, descriptor.deckId);
    }

    const { bytes, sha256 } = fetched;
    if (bytes.byteLength !== descriptor.bytes || sha256 !== descriptor.sha256) {
      return failure('integrity', descriptor.deckId);
    }

    let cards: CardDraft[];
    const bundleText = new TextDecoder().decode(bytes);
    try {
      // Collection rỗng là hợp lệ: nội dung do người dùng tự thêm, và bundle vẫn
      // cần tồn tại để giữ tên/bộ kiểm tra cập nhật. Import parser cố ý từ chối
      // file không có thẻ, nên nhận riêng schema JSON rỗng ở pipeline xuất bản.
      cards = isEmptyPublishedBundle(bundleText)
        ? []
        : await deps.parseBundleText(bundleText, descriptor.path, descriptor.quiz);
    } catch (cause) {
      return {
        status: 'failed',
        reason: 'bundle-invalid',
        message: describe(cause, FAILURE_LABELS['bundle-invalid']),
        deckId: descriptor.deckId,
      };
    }

    if (cards.length === 0) {
      bundles.push({
        deckId: descriptor.deckId,
        name: descriptor.name,
        quiz: descriptor.quiz,
        cards: [],
        cardIds: [],
        sha256,
      });
      downloaded.push(descriptor.deckId);
      continue;
    }

    const problem = bundleIssues(cards);
    if (problem !== null) {
      return {
        status: 'failed',
        reason: 'bundle-invalid',
        message: problem,
        deckId: descriptor.deckId,
      };
    }

    bundles.push({
      deckId: descriptor.deckId,
      name: descriptor.name,
      quiz: descriptor.quiz,
      cards,
      cardIds: cards.map((card) => card.id ?? ''),
      sha256,
    });
    downloaded.push(descriptor.deckId);
  }

  // 6. Ghi vùng đệm. Chưa kích hoạt — người dùng còn xem trước.
  const next: ActiveContent = {
    contentVersion: manifest.contentVersion,
    schemaVersion: manifest.schemaVersion,
    activatedAt: now,
    bundles,
  };

  report?.({ phase: 'stage', done: 0, total: 1 });
  try {
    await store.writeStaging(next);
  } catch (cause) {
    await clearStagingQuietly(store);
    return {
      status: 'failed',
      reason: 'storage',
      message: describe(cause, FAILURE_LABELS.storage),
    };
  }
  report?.({ phase: 'stage', done: 1, total: 1 });

  return {
    status: 'staged',
    from: active?.contentVersion ?? null,
    to: manifest.contentVersion,
    downloaded,
    reused,
  };
}

/**
 * Chạy trọn một lần cập nhật: tải, đệm rồi kích hoạt ngay.
 *
 * Dùng cho nơi không cần bước xem trước (kiểm thử, hoặc lệnh chạy không giao
 * diện). Ứng dụng dùng {@link stageContentUpdate} rồi mới kích hoạt sau khi người
 * dùng xác nhận.
 */
export async function runContentUpdate(deps: UpdateDeps): Promise<UpdateOutcome> {
  const outcome = await stageContentUpdate(deps);
  if (outcome.status !== 'staged') return outcome;

  const { store, onProgress: report } = deps;
  report?.({ phase: 'activate', done: 0, total: 1 });
  try {
    const promoted = await store.promote();
    if (!promoted) {
      await clearStagingQuietly(store);
      return failure('storage');
    }
  } catch (cause) {
    await clearStagingQuietly(store);
    return {
      status: 'failed',
      reason: 'storage',
      message: describe(cause, FAILURE_LABELS.storage),
    };
  }
  report?.({ phase: 'activate', done: 1, total: 1 });

  return {
    status: 'updated',
    from: outcome.from,
    to: outcome.to,
    downloaded: outcome.downloaded,
    reused: outcome.reused,
  };
}

type VerifiedBundle = { bytes: Uint8Array; sha256: string };

async function fetchVerifiedBundle(
  deps: UpdateDeps,
  path: string,
): Promise<VerifiedBundle | UpdateFailureReason> {
  try {
    const bytes = await deps.fetchBundle(path);
    const sha256 = await deps.sha256(bytes);
    return { bytes, sha256 };
  } catch {
    return 'network';
  }
}

function isEmptyPublishedBundle(text: string): boolean {
  try {
    const value: unknown = JSON.parse(text);
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      'cards' in value &&
      Array.isArray(value.cards) &&
      value.cards.length === 0
    );
  } catch {
    return false;
  }
}

function failure(reason: UpdateFailureReason, deckId?: string): StageOutcome {
  return {
    status: 'failed',
    reason,
    message: FAILURE_LABELS[reason],
    ...(deckId === undefined ? {} : { deckId }),
  };
}

async function clearStagingQuietly(store: ContentStore): Promise<void> {
  try {
    await store.clearStaging();
  } catch {
    // Không dọn được vùng đệm không phải lý do để chặn cập nhật: lần chạy sau
    // sẽ ghi đè nó.
  }
}

function describe(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message !== '') return cause.message;
  return fallback;
}
