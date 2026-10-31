/**
 * Mô hình **nội dung xuất bản** — phần dữ liệu Midori tải từ nguồn web chính
 * thức để dùng ngoại tuyến.
 *
 * Phân biệt với **dữ liệu người dùng** (`src/storage/`): thẻ do người dùng tạo,
 * lịch SRS, cài đặt. Hai loại nằm ở hai IndexedDB KHÁC NHAU để việc cập nhật nội
 * dung không thể vô tình chạm vào dữ liệu người học — đó là bảo đảm bằng cấu
 * trúc, không phải bằng kỷ luật lập trình.
 */

import type { CardDraft, Quiz } from '../core/types.ts';

/** Phiên bản schema manifest mà bản dựng này hiểu được. */
export const SUPPORTED_SCHEMA_VERSION = 1;

/** Một gói nội dung được khai báo trong manifest. */
export interface BundleDescriptor {
  /** Bộ thẻ mà gói này chứa, ví dụ `vocabulary`. */
  deckId: string;
  /** Tên hiển thị của bộ. */
  name: string;
  /** Đường dẫn tương đối, ví dụ `bundles/vocabulary.json`. */
  path: string;
  /** Số byte mong đợi — kiểm tra nhanh trước khi băm. */
  bytes: number;
  /** SHA-256 dạng hex của nội dung gói. */
  sha256: string;
  /** Chế độ hỏi của bộ thẻ. */
  quiz: Quiz;
}

/** Nội dung của `public/data/content/manifest.json`. */
export interface PublishedManifest {
  schemaVersion: number;
  /** Phiên bản nội dung, ví dụ `2026.10.12.1`. */
  contentVersion: string;
  generatedAt?: string;
  bundles: BundleDescriptor[];
}

/** Một gói nội dung đã được tải, xác minh và phân tích. */
export interface BundleData {
  deckId: string;
  name: string;
  quiz: Quiz;
  cards: CardDraft[];
  /**
   * SHA-256 của gói lúc kích hoạt. Lần cập nhật sau so giá trị này với manifest
   * để biết gói nào **không cần tải lại** — đặc tả §7.2.
   */
  sha256: string;
  /**
   * Id thẻ của gói theo đúng thứ tự trong `cards`.
   * Lưu lại để lần cập nhật sau biết thẻ nào do nội dung quản lý.
   */
  cardIds: string[];
}

/** Nội dung đã kích hoạt, đang được dùng để học. */
export interface ActiveContent {
  contentVersion: string;
  schemaVersion: number;
  /** Thời điểm kích hoạt, ms kể từ epoch. */
  activatedAt: number;
  bundles: BundleData[];
}

/**
 * Nơi lưu nội dung. Tách thành giao diện để pipeline kiểm thử được mà không cần
 * trình duyệt (xem `tests/content-pipeline.test.ts`).
 *
 * Hợp đồng quan trọng nhất: {@link ContentStore.promote} phải **nguyên tử**.
 * Nếu nó thất bại, nội dung đang dùng phải còn nguyên vẹn.
 */
export interface ContentStore {
  readActive(): Promise<ActiveContent | null>;
  /** Bản đang dùng trước lần kích hoạt gần nhất — đường phục hồi. */
  readPrevious(): Promise<ActiveContent | null>;
  readStaging(): Promise<ActiveContent | null>;
  writeStaging(content: ActiveContent): Promise<void>;
  /**
   * Chuyển vùng đệm đã xác minh thành nội dung đang dùng, trong MỘT giao dịch
   * nguyên tử: `staging → active`, `active cũ → previous`, xoá `staging`.
   *
   * @returns `true` nếu có chuyển đổi, `false` nếu không có gì trong vùng đệm
   */
  promote(): Promise<boolean>;
  /** Xoá vùng đệm sau thất bại. Không đụng tới nội dung đang dùng. */
  clearStaging(): Promise<void>;
  /** Khôi phục bản `previous` làm nội dung đang dùng. */
  rollback(): Promise<boolean>;
}

/**
 * Một thẻ trong danh sách xem trước — đủ để người dùng nhận ra thẻ, không mang
 * theo lịch SRS hay trạng thái gì khác.
 */
export interface PreviewCard {
  id: string;
  deckId: string;
  front: string;
  back: string;
}

/**
 * Thay đổi mà việc kích hoạt sẽ gây ra cho **thư viện người học**.
 *
 * Được tính bằng chính `content_reconcile` trên bản đã đệm, nên là lời hứa thật
 * chứ không phải ước lượng: cùng một hàm chạy lúc xem trước và lúc kích hoạt.
 */
export interface ContentPreview {
  /** Thẻ đã có, nội dung đổi; giữ nguyên lịch SRS. */
  updated: number;
  /** Thẻ mới, tạo ở trạng thái chưa học. */
  added: number;
  /** Thẻ biến mất khỏi nội dung; KHÔNG bị xoá, chỉ ra khỏi danh sách quản lý. */
  orphaned: number;
  /** Chi tiết từng nhóm, cùng thứ tự và cùng nguồn với các con số trên. */
  updatedCards: PreviewCard[];
  addedCards: PreviewCard[];
  orphanedCards: PreviewCard[];
}

/**
 * Kết cục của bước **tải + đệm** — bước duy nhất chạy trước khi người dùng quyết
 * định. Không có trạng thái "đã cập nhật" ở đây: kích hoạt là việc riêng.
 */
export type StageOutcome =
  /** Đang là bản mới nhất. */
  | { status: 'up-to-date'; contentVersion: string; bundles: number }
  /**
   * Đã tải, xác minh và ghi vào ngăn `staging` — **chưa** kích hoạt.
   *
   * Đây là điểm dừng để người dùng xem trước thay đổi trước khi nó chạm vào thư
   * viện. Nội dung đang dùng chưa bị đụng tới ở trạng thái này.
   */
  | {
      status: 'staged';
      from: string | null;
      to: string;
      /** Gói phải tải mới. */
      downloaded: string[];
      /** Gói dùng lại nguyên vẹn từ bản cũ. */
      reused: string[];
    }
  /** Không có mạng. Nội dung đang dùng vẫn nguyên vẹn. */
  | { status: 'offline' }
  /** Thất bại — nội dung đang dùng vẫn nguyên vẹn. */
  | {
      status: 'failed';
      reason: UpdateFailureReason;
      message: string;
      deckId?: string;
    };

/** Kết quả một lần kiểm tra cập nhật nội dung. */
export type UpdateOutcome =
  | StageOutcome
  /** Đã kích hoạt bản mới. */
  | {
      status: 'updated';
      from: string | null;
      to: string;
      /** Gói phải tải mới. */
      downloaded: string[];
      /** Gói dùng lại nguyên vẹn từ bản cũ. */
      reused: string[];
    }
  /** Nội dung đã kích hoạt nhưng thư viện người học chưa đồng bộ; có thể thử lại. */
  | { status: 'sync-failed'; contentVersion: string; message: string };

export type UpdateFailureReason =
  | 'manifest-invalid'
  | 'schema-unsupported'
  | 'network'
  | 'integrity'
  | 'bundle-invalid'
  | 'storage';

/** Lý do cập nhật thất bại, kèm nhãn tiếng Việt cho giao diện. */
export const FAILURE_LABELS: Record<UpdateFailureReason, string> = {
  'manifest-invalid': 'Dữ liệu phiên bản không hợp lệ',
  'schema-unsupported': 'Bản dựng này không hỗ trợ schema nội dung mới',
  network: 'Không tải được nội dung',
  integrity: 'Nội dung tải về không toàn vẹn',
  'bundle-invalid': 'Nội dung tải về sai định dạng',
  storage: 'Thiết bị không lưu được nội dung',
};
