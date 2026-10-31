/**
 * Kiểu dữ liệu của hợp đồng Rust ↔ JavaScript.
 *
 * NGUỒN SỰ THẬT LÀ RUST (`crates/midori-core`). File này chỉ là bản dịch sang
 * TypeScript; `docs/contract.md` mô tả cách hai bên được kiểm tra khớp nhau.
 * Đổi kiểu ở Rust mà không đổi ở đây sẽ bị `tests/wasm-contract.test.ts` bắt.
 */

// ── SRS ────────────────────────────────────────────────────────────────────

/** Bốn mức đánh giá của người học. */
export type Rating = 'again' | 'hard' | 'good' | 'easy';

/** Lý do một thẻ bị coi là "chưa thuộc". */
export type WeakReason = 'rating' | 'quiz';

/** Trạng thái ôn tập SM-2 của một thẻ. */
export interface SrsState {
  /** Hệ số dễ, tối thiểu 1.3. */
  ease: number;
  /** Số ngày tới lần ôn sau. */
  interval: number;
  /** Số lần liên tiếp nhớ đúng. */
  repetitions: number;
  /** Số lần quên. */
  lapses: number;
  /** Thời điểm tới hạn ôn, ms kể từ epoch. */
  due: number;
  /** Mức đánh giá gần nhất. Thẻ chưa chấm thì không có trường này. */
  lastRating?: Rating;
  /** Thời điểm làm sai gần nhất ở chế độ Làm bài. */
  lastWrongAt?: number;
  /**
   * Điểm của lần trả lời gần nhất ở chế độ Làm bài (0–1).
   *
   * Trường MỚI: bản ghi cũ không có nó là chuyện bình thường, và khi đó nó
   * vắng mặt — KHÔNG được coi là 0 điểm. Xem {@link DeckStats.graded}.
   */
  lastScore?: number;
}

// ── Thẻ ────────────────────────────────────────────────────────────────────

/** Chế độ hỏi của một bộ thẻ. */
export type Quiz = 'meaning' | 'reading';

/** Bộ thẻ mặc định khi bản ghi không khai báo. */
export const DEFAULT_DECK_ID = 'vocabulary';

/**
 * Thẻ đã lưu trong thư viện người dùng.
 *
 * Quy ước nội dung theo `Quiz`:
 * - `meaning` → `front` = tiếng Việt, `back` = Kanji
 * - `reading` → `front` = Kanji, `back` = tiếng Việt
 */
export interface Card {
  id: string;
  deckId: string;
  front: string;
  back: string;
  furigana: string;
  romaji: string;
  tags: string[];
  /** 1..=50 — chỉ áp dụng cho bộ Từ vựng (Minna no Nihongo). */
  lesson?: number;
  createdAt: number;
  srs: SrsState;
}

/**
 * Nội dung thẻ, không kèm trạng thái học — dùng cho tệp bộ thẻ.
 * `id` là danh tính nội dung do nhà phát hành đặt; thẻ người dùng tự tạo để trống.
 */
export interface CardDraft {
  id?: string;
  front: string;
  back: string;
  furigana: string;
  romaji: string;
  tags: string[];
  lesson?: number;
}

// ── Bộ thẻ ─────────────────────────────────────────────────────────────────

export interface ImportResult {
  name: string;
  cards: CardDraft[];
  /**
   * Số bản ghi có trong file nhưng không đọc thành thẻ được (thiếu mặt thẻ hoặc
   * mặt nghĩa, phần tử không phải đối tượng…).
   *
   * Do lõi đếm trong lúc đọc file — lớp giao diện dùng nó để nói trước khi ghi
   * "bao nhiêu bản ghi sẽ bị bỏ qua" mà không phải đoán lại luật đọc của từng
   * định dạng. Backup cá nhân KHÔNG đi qua đường này.
   */
  skipped: number;
}

export interface ImportPlan {
  fresh: Card[];
  skipped: number;
}

export interface ExportFile {
  filename: string;
  mime: string;
  text: string;
}

export interface RejectedRecord {
  index: number;
  code: string;
  message: string;
}

export interface NormalizedCards {
  cards: Card[];
  rejected: RejectedRecord[];
}

export interface ReconcileResult {
  /** Thẻ đang có được cập nhật nội dung — lịch SRS giữ nguyên. */
  updated: Card[];
  /** Thẻ mới xuất hiện trong nội dung. */
  fresh: Card[];
  /** Id thẻ do nội dung quản lý nay đã biến mất — KHÔNG bị xoá. */
  orphaned: string[];
  /** Số thẻ không có gì thay đổi. */
  unchanged: number;
}

// ── Thống kê, lọc, bài học ─────────────────────────────────────────────────

export interface DeckCount {
  total: number;
  new: number;
  due: number;
  learning: number;
  mature: number;
  weak: number;
  /** Trong `weak`: thẻ yếu vì lần tự chấm gần nhất là Again/Hard. */
  weakRating: number;
  /** Trong `weak`: thẻ yếu vì làm sai ở chế độ Làm bài. */
  weakQuiz: number;
  /** Trung bình độ thành thạo dài hạn (0–1). */
  mastery: number;
  /** Số thẻ đã đạt ngưỡng thành thạo (mastery ≥ 0.5). */
  mastered: number;
  /** Trung bình điểm làm bài gần nhất, tính trên `graded` thẻ. */
  accuracy: number;
  /** Số thẻ đã từng làm bài — mẫu số của `accuracy`. `0` = chưa có dữ liệu. */
  graded: number;
}

export interface DeckStats {
  total: number;
  new: number;
  due: number;
  learning: number;
  mature: number;
  weak: number;
  /** Trong `weak`: thẻ yếu vì tự chấm Again/Hard. */
  weakRating: number;
  /** Trong `weak`: thẻ yếu vì làm sai bài kiểm tra. */
  weakQuiz: number;
  quizzable: number;
  /**
   * Độ thành thạo dài hạn trung bình (0–1), suy từ LỊCH ÔN.
   *
   * Khác hẳn {@link accuracy}: `mastery` là kết quả tích luỹ nhiều phiên, còn
   * `accuracy` chỉ là điểm của lần làm bài gần nhất. Không được gộp hai con số
   * này làm một — một lần trả lời nhanh không chứng minh đã nhớ dài hạn.
   */
  mastery: number;
  mastered: number;
  accuracy: number;
  graded: number;
  byDeck: Record<string, DeckCount>;
}

/**
 * Tiến độ của MỘT bài Minna.
 *
 * `count` là tổng số thẻ của bài (tên giữ từ hợp đồng cũ); mọi nhóm còn lại
 * dùng CHUNG quy tắc với {@link DeckCount} — lõi Rust đếm, giao diện không tự
 * tính, nên con số theo bài không thể lệch khỏi con số toàn thư viện.
 */
export interface LessonInfo {
  n: number;
  label: string;
  count: number;
  due: number;
  new: number;
  learning: number;
  mature: number;
  weak: number;
  weakRating: number;
  weakQuiz: number;
  mastery: number;
  mastered: number;
  accuracy: number;
  graded: number;
}

export interface FilterResult {
  ids: string[];
  lessons: LessonInfo[];
}

/** Điều kiện lọc thẻ. Mọi trường đều tuỳ chọn. */
export interface CardFilter {
  deckIds?: string[];
  lesson?: number;
  query?: string;
  dueOnly?: boolean;
  weakOnly?: boolean;
  /** Giới hạn số thẻ MỚI khi `dueOnly` bật. */
  newLimit?: number;
}

// ── Phiên học đang dở ──────────────────────────────────────────────────────

/**
 * Ảnh chụp phiên học đang dở, ở dạng **tham chiếu** tới thư viện.
 *
 * Chỉ chứa id thẻ, không chứa nội dung thẻ: bản lưu nhờ vậy không bao giờ cũ,
 * kể cả sau khi cập nhật nội dung. Xem `docs/data-model.md`.
 */
export interface SessionSnapshot {
  /** Id thẻ theo đúng thứ tự hàng đợi. */
  queue: string[];
  /** Vị trí thẻ đang học trong `queue`. */
  index: number;
}

/**
 * Phiên học đã đối chiếu với thư viện hiện tại.
 *
 * `index` đã được **tính lại**: nếu thẻ đang học nằm ở vị trí 5 mà hai thẻ trước
 * nó đã biến mất, vị trí mới là 3. Nhờ vậy người học trở lại đúng thẻ đang làm dở.
 */
export interface SessionRestore {
  queue: string[];
  index: number;
  /** Số id bị bỏ vì không còn trong thư viện hoặc bị trùng lặp. */
  dropped: number;
}

// ── Làm bài ────────────────────────────────────────────────────────────────

export type AnswerKind = 'kanji' | 'furigana' | 'romaji';

export interface AnswerCandidate {
  value: string;
  kind: AnswerKind;
}

export interface AnswerCheck {
  /** Tương đương `score >= 0.9`. Giữ nguyên nghĩa cũ để mã đã có không phải đổi. */
  correct: boolean;
  matched?: string;
  /** Đáp án tham khảo, hiển thị khi người học trả lời sai. */
  reference: string[];
  /** Điểm của lần trả lời này: 1.0 · 0.9 · 0.5 · 0.0. */
  score: number;
  /** Kết luận đã cho ra `score`. */
  verdict: AnswerVerdict;
}

/**
 * Năm kết luận của một lần trả lời.
 *
 * - `exact` — đúng chính xác (khác hoa/thường không tính là khác).
 * - `accepted` — đúng sau khi bỏ dấu tiếng Việt (“nghia” cho “nghĩa”).
 * - `near` — sai chính tả trong ngưỡng. KHÔNG tính là đúng.
 * - `wrong` — không khớp đáp án nào.
 * - `empty` — người học bỏ trống.
 */
export type AnswerVerdict = 'exact' | 'accepted' | 'near' | 'wrong' | 'empty';

/**
 * Cấu hình chấm điểm — đầu vào của thuật toán.
 *
 * Cùng câu trả lời + cùng cấu hình ⇒ cùng kết quả. Bỏ trống trường nào thì dùng
 * mặc định của lõi Rust.
 */
export interface AnswerConfig {
  /** Chấp nhận đáp án tiếng Việt gõ thiếu dấu. Mặc định: bật. */
  accentTolerant?: boolean;
  /** Nhận ra sai chính tả trong ngưỡng (kết luận `near`). Mặc định: bật. */
  allowTypos?: boolean;
}

/** Khoảng ôn (số ngày) sau mỗi mức tự chấm — một lần gọi cho cả bốn mức. */
export interface SrsPreview {
  again: number;
  hard: number;
  good: number;
  easy: number;
}
