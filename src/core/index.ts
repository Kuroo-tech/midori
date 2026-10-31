/**
 * Mặt tiền có kiểu cho lõi nghiệp vụ Midori (Rust/WASM).
 *
 * # Quy ước chung
 *
 * - Hàm ở đây **nhận và trả về đối tượng JS có kiểu**, không phải chuỗi JSON.
 *   Việc đóng/mở phong bì diễn ra ở lớp này.
 * - Một lần gọi = một lần vượt biên WASM. Vì vậy mọi thao tác theo lô (nhập,
 *   xuất, thống kê, lọc, tạo nhiều thẻ) đều nhận cả mảng thay vì gọi từng thẻ.
 * - Mọi lỗi nghiệp vụ ném ra {@link CoreError} với `code` ổn định.
 * - Lõi là **hàm thuần**: nó không giữ trạng thái. Thư viện thẻ thuộc về
 *   IndexedDB, do lớp lưu trữ sở hữu. Nhờ vậy không có hai nguồn sự thật.
 *
 * @example
 * ```ts
 * const srs = await srsNew();
 * const next = await srsSchedule(srs, 'good');
 * ```
 */

import { unwrap } from './envelope.ts';
import { loadCore } from './wasm.ts';
import type {
  AnswerCheck,
  AnswerConfig,
  Card,
  CardDraft,
  CardFilter,
  DeckStats,
  ExportFile,
  FilterResult,
  ImportPlan,
  ImportResult,
  LessonInfo,
  NormalizedCards,
  Quiz,
  Rating,
  ReconcileResult,
  SessionRestore,
  SessionSnapshot,
  SrsPreview,
  SrsState,
  WeakReason,
} from './types.ts';

export * from './envelope.ts';
export * from './types.ts';
export { coreVersion, loadCore, loadCoreFrom } from './wasm.ts';
export type { CoreBindings, LoadOptions, WasmSource } from './wasm.ts';

/** Định dạng file bộ thẻ hỗ trợ xuất. */
export type ExportFormat = 'json' | 'csv';

const json = (value: unknown): string => JSON.stringify(value);

// ── SRS ────────────────────────────────────────────────────────────────────

/** Thẻ mới: chưa học lần nào, tới hạn ngay. */
export async function srsNew(now: number = Date.now()): Promise<SrsState> {
  const core = await loadCore();
  return unwrap<SrsState>(core.srs_new(now));
}

/** Lịch ôn mới sau khi người học chấm điểm. */
export async function srsSchedule(
  srs: SrsState,
  rating: Rating,
  now: number = Date.now(),
): Promise<SrsState> {
  const core = await loadCore();
  return unwrap<SrsState>(core.srs_schedule(json(srs), rating, now));
}

/** Thẻ đã tới hạn ôn chưa? */
export async function srsIsDue(srs: SrsState, now: number = Date.now()): Promise<boolean> {
  const core = await loadCore();
  return unwrap<boolean>(core.srs_is_due(json(srs), now));
}

/** Thẻ chưa từng được học? */
export async function srsIsNew(srs: SrsState): Promise<boolean> {
  const core = await loadCore();
  return unwrap<boolean>(core.srs_is_new(json(srs)));
}

/** Thẻ đã "chín" (khoảng ôn ≥ 21 ngày)? */
export async function srsIsMature(srs: SrsState): Promise<boolean> {
  const core = await loadCore();
  return unwrap<boolean>(core.srs_is_mature(json(srs)));
}

/** Vì sao thẻ bị coi là "chưa thuộc", hoặc `null`. */
export async function srsWeakReason(srs: SrsState): Promise<WeakReason | null> {
  const core = await loadCore();
  return unwrap<WeakReason | null>(core.srs_weak_reason(json(srs)));
}

/** Độ thành thạo dài hạn (0–1) — suy từ lịch ôn, không từ một lần trả lời. */
export async function srsMastery(srs: SrsState): Promise<number> {
  const core = await loadCore();
  return unwrap<number>(core.srs_mastery(json(srs)));
}

/** Thẻ đã đạt ngưỡng thành thạo chưa. */
export async function srsIsMastered(srs: SrsState): Promise<boolean> {
  const core = await loadCore();
  return unwrap<boolean>(core.srs_is_mastered(json(srs)));
}

/**
 * Khoảng ôn của cả BỐN mức tự chấm trong MỘT lần vượt biên WASM.
 *
 * Màn Học cần đủ bốn con số ngay khi lật thẻ. Gọi `srsSchedule` bốn lần tốn bốn
 * lần tuần tự hoá JSON và bốn lần qua lại biên; hàm này trả về cả bốn và — vì cả
 * bốn đều chạy cùng một `SrsState::schedule` — con số hiển thị không thể lệch với
 * kết quả khi bấm nút.
 */
export async function srsPreview(srs: SrsState, now: number = Date.now()): Promise<SrsPreview> {
  const core = await loadCore();
  return unwrap<SrsPreview>(core.srs_preview(json(srs), now));
}

// ── Thẻ ────────────────────────────────────────────────────────────────────

/**
 * Chuẩn hoá một bản ghi thô về schema hiện tại.
 * Đọc được cả bản ghi cũ chỉ có `reading`.
 *
 * @throws {CoreError} `invalid_record` khi thiếu id / mặt trước / mặt sau
 */
export async function cardNormalize(raw: unknown, now: number = Date.now()): Promise<Card> {
  const core = await loadCore();
  return unwrap<Card>(core.card_normalize(json(raw), now));
}

/**
 * Chuẩn hoá cả một lô bản ghi thô, tách phần dùng được khỏi phần hỏng.
 * Dùng khi nạp thư viện từ IndexedDB — dữ liệu cũ có thể không đồng nhất.
 */
export async function cardsNormalize(
  raw: unknown[],
  now: number = Date.now(),
): Promise<NormalizedCards> {
  const core = await loadCore();
  return unwrap<NormalizedCards>(core.cards_normalize(json(raw), now));
}

/**
 * Tạo thẻ mới từ nháp.
 *
 * @param id fallback do lớp nền tảng sinh (`crypto.randomUUID()`).
 *   Nháp có `id` riêng (thẻ nội dung xuất bản) thì `id` đó được ưu tiên.
 */
export async function cardMake(
  draft: CardDraft,
  id: string,
  deckId: string,
  now: number = Date.now(),
): Promise<Card> {
  const core = await loadCore();
  return unwrap<Card>(core.card_make(json(draft), id, deckId, now));
}

/** Tạo nhiều thẻ trong MỘT lần vượt biên. */
export async function cardsMake(
  drafts: CardDraft[],
  ids: string[],
  deckId: string,
  now: number = Date.now(),
): Promise<Card[]> {
  const core = await loadCore();
  return unwrap<Card[]>(core.cards_make(json(drafts), json(ids), deckId, now));
}

/** Áp nội dung đã sửa vào thẻ, giữ nguyên id / bộ / lịch SRS / ngày tạo. */
export async function cardApplyDraft(card: Card, draft: CardDraft): Promise<Card> {
  const core = await loadCore();
  return unwrap<Card>(core.card_apply_draft(json(card), json(draft)));
}

/**
 * Ghi dấu kết quả chế độ Làm bài.
 *
 * Chỉ đụng dấu vết học tập, KHÔNG đổi lịch SRS — nhờ vậy bộ lọc "Chưa thuộc"
 * phân biệt được thất bại ở bài kiểm tra với việc tự chấm Again/Hard.
 */
export async function cardMarkQuiz(
  card: Card,
  correct: boolean,
  now: number = Date.now(),
): Promise<Card> {
  const core = await loadCore();
  return unwrap<Card>(core.card_mark_quiz(json(card), correct, now));
}

/**
 * Ghi dấu một lần trả lời KÈM điểm của lần đó.
 *
 * Như {@link cardMarkQuiz}, hàm này không đụng lịch SRS. Điểm được kẹp về [0,1]
 * ở lõi, nên dữ liệu bất thường không làm hỏng bước ghi.
 */
export async function cardMarkAttempt(
  card: Card,
  correct: boolean,
  score: number,
  now: number = Date.now(),
): Promise<Card> {
  const core = await loadCore();
  return unwrap<Card>(core.card_mark_attempt(json(card), correct, score, now));
}

// ── Bộ thẻ ─────────────────────────────────────────────────────────────────

/** Đọc nội dung file bộ thẻ (JSON/CSV/TSV) thành danh sách nháp. */
export async function deckParse(
  text: string,
  filename: string,
  quiz: Quiz,
): Promise<ImportResult> {
  const core = await loadCore();
  return unwrap<ImportResult>(core.deck_parse(text, filename, quiz));
}

/** Dựng nội dung file xuất. Chỉ dựng chuỗi; việc tải về là của trình duyệt. */
export async function deckExport(
  cards: Card[],
  format: ExportFormat,
  deckName: string,
  dateStamp: string,
): Promise<ExportFile> {
  const core = await loadCore();
  return unwrap<ExportFile>(core.deck_export(json(cards), format, deckName, dateStamp));
}

/** Bỏ trùng khi nhập thẻ: trả về thẻ mới cần thêm, không ghi đè thẻ đã có. */
export async function deckPlanImport(
  cards: Card[],
  drafts: CardDraft[],
  deckId: string,
  ids: string[],
  now: number = Date.now(),
): Promise<ImportPlan> {
  const core = await loadCore();
  return unwrap<ImportPlan>(core.deck_plan_import(json(cards), json(drafts), deckId, json(ids), now));
}

/**
 * Đồng bộ nội dung xuất bản với thư viện người học.
 *
 * Không bao giờ xoá dữ liệu: thẻ biến mất khỏi nội dung chỉ được báo trong
 * `orphaned`. Lịch SRS của thẻ được cập nhật nội dung luôn giữ nguyên.
 *
 * @param previousIds id thẻ của phiên bản nội dung đang dùng — cần để phân biệt
 *   thẻ do nội dung quản lý với thẻ người dùng tự tạo trong cùng bộ.
 */
export async function contentReconcile(
  cards: Card[],
  content: CardDraft[],
  previousIds: string[],
  deckId: string,
  now: number = Date.now(),
): Promise<ReconcileResult> {
  const core = await loadCore();
  return unwrap<ReconcileResult>(
    core.content_reconcile(json(cards), json(content), json(previousIds), deckId, now),
  );
}

// ── Thống kê, lọc, bài học ─────────────────────────────────────────────────

export async function deckStats(
  cards: Card[],
  quiz: Quiz,
  now: number = Date.now(),
): Promise<DeckStats> {
  const core = await loadCore();
  return unwrap<DeckStats>(core.deck_stats(json(cards), now, quiz));
}

/** Lọc thẻ: trả về id khớp điều kiện, kèm tóm tắt 50 bài Minna. */
export async function cardsFilter(
  cards: Card[],
  filter: CardFilter,
  now: number = Date.now(),
): Promise<FilterResult> {
  const core = await loadCore();
  return unwrap<FilterResult>(core.cards_filter(json(cards), json(filter), now));
}

/** Khung 50 bài Minna kèm số thẻ hiện có và số thẻ tới hạn của từng bài. */
export async function lessonSummary(
  cards: Card[],
  now: number = Date.now(),
): Promise<LessonInfo[]> {
  const core = await loadCore();
  return unwrap<LessonInfo[]>(core.lesson_summary(json(cards), now));
}

// ── Phiên học ──────────────────────────────────────────────────────────────

/**
 * Trộn thứ tự hàng đợi theo Fisher–Yates.
 *
 * `seed` do lớp gọi quyết định: truyền giá trị ngẫu nhiên để trộn thật, truyền
 * giá trị cố định để tái lập được (kiểm thử, hoặc khôi phục phiên đang học).
 */
export async function sessionShuffle(ids: string[], seed: number): Promise<string[]> {
  const core = await loadCore();
  return unwrap<string[]>(core.session_shuffle(json(ids), seed));
}

/**
 * Khôi phục một phiên học đang dở, đối chiếu với thư viện hiện tại.
 *
 * Bỏ id không còn trong thư viện hoặc bị trùng lặp, và **tính lại `index`** trên
 * hàng đợi đã lọc — nếu không, người học sẽ bị đưa tới nhầm thẻ sau khi có thẻ bị
 * bỏ ở phía trước. Quy tắc nằm ở Rust (`session::restore`) để chỉ tồn tại một chỗ.
 *
 * @param snapshot bản lưu của phiên đang dở. Dữ liệu hỏng được coi như phiên
 *   rỗng thay vì gây lỗi: bản lưu là dữ liệu phụ, không được chặn ứng dụng.
 * @param available id thẻ hiện có trong thư viện.
 */
export async function sessionRestore(
  snapshot: SessionSnapshot,
  available: string[],
): Promise<SessionRestore> {
  const core = await loadCore();
  return unwrap<SessionRestore>(core.session_restore(json(snapshot), json(available)));
}

// ── Làm bài ────────────────────────────────────────────────────────────────

/** Câu hỏi của thẻ — luôn là mặt tiếng Việt. */
export async function quizPrompt(card: Card, quiz: Quiz): Promise<string> {
  const core = await loadCore();
  return unwrap<string>(core.quiz_prompt(json(card), quiz));
}

/** Chấm câu trả lời dựa trên các đáp án thẻ đã khai báo. */
export async function quizCheck(
  input: string,
  card: Card,
  quiz: Quiz,
): Promise<AnswerCheck> {
  const core = await loadCore();
  return unwrap<AnswerCheck>(core.quiz_check(input, json(card), quiz));
}

/**
 * Chấm câu trả lời với cấu hình chấm điểm tường minh.
 *
 * Dùng khi cần kết quả KHÁC mặc định (ví dụ bài kiểm tra yêu cầu đúng cả dấu).
 * Cùng đầu vào + cùng cấu hình ⇒ cùng kết quả.
 */
export async function quizScore(
  input: string,
  card: Card,
  quiz: Quiz,
  config: AnswerConfig = {},
): Promise<AnswerCheck> {
  const core = await loadCore();
  return unwrap<AnswerCheck>(core.quiz_score(input, json(card), quiz, json(config)));
}
