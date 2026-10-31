//! Hợp đồng chuỗi giữa Rust và JavaScript.
//!
//! # Một quy tắc duy nhất
//!
//! Mọi hàm trong module này trả về **một chuỗi JSON là phong bì**:
//!
//! ```json
//! { "ok": true,  "data": <giá trị> }
//! { "ok": false, "error": { "code": "…", "message": "…", "detail": "…" } }
//! ```
//!
//! Không có ngoại lệ. Nhờ vậy lớp JS chỉ cần MỘT hàm bóc phong bì, và mọi lỗi
//! đi qua biên đều có cùng hình dạng (`code` ổn định để lập trình, `message`
//! tiếng Việt để hiển thị).
//!
//! # Vì sao truyền chuỗi JSON thay vì đối tượng?
//!
//! - Một lần vượt biên cho cả một lô dữ liệu, thay vì gọi từng phần tử.
//! - Không cần `serde-wasm-bindgen` hay cấu hình `externref`, giữ lớp WASM mỏng.
//! - Hợp đồng kiểm thử được ngay trong `cargo test` (native), không cần trình
//!   duyệt — xem `docs/contract.md`.
//!
//! Hệ quả cần nhớ: các hàm nhận danh sách thẻ (`cards_*`, `deck_stats`,
//! `session_shuffle`, `quiz_*`) nhận **JSON của thẻ đã chuẩn hoá**; dữ liệu thô
//! từ IndexedDB/ file người dùng phải đi qua [`cards_normalize`] / [`deck_parse`]
//! trước.

use serde::Serialize;
use serde_json::Value;

use crate::card::{Card, CardDraft, Quiz};
use crate::content;
use crate::error::{CoreError, CoreResult};
use crate::json;
use crate::export::{self, ExportFormat};
use crate::import;
use crate::quiz;
use crate::session;
use crate::srs::{Rating, SrsState};
use crate::stats::{self, CardFilter};

/// Phiên bản lõi, dùng để JS kiểm tra tương thích khi nạp WASM.
pub const CORE_VERSION: &str = crate::VERSION;

#[derive(Serialize)]
struct OkEnvelope<T> {
    ok: bool,
    data: T,
}

#[derive(Serialize)]
struct ErrEnvelope {
    ok: bool,
    error: CoreError,
}

/// Bọc dữ liệu thành phong bì thành công.
pub fn ok<T: Serialize>(data: T) -> String {
    serde_json::to_string(&OkEnvelope { ok: true, data }).unwrap_or_else(|e| {
        fail(CoreError::invalid_argument("data").detail(e.to_string()))
    })
}

/// Bọc lỗi thành phong bì thất bại.
pub fn fail(error: CoreError) -> String {
    serde_json::to_string(&ErrEnvelope { ok: false, error }).unwrap_or_else(|_| {
        // Không thể xảy ra: CoreError luôn serialize được. Giữ nhánh này để
        // không bao giờ panic ở biên WASM.
        String::from(
            r#"{"ok":false,"error":{"code":"invalid_argument","message":"Không đóng gói được lỗi"}}"#,
        )
    })
}

/// Chạy một phép tính rồi đóng gói kết quả.
pub fn respond<T: Serialize>(result: CoreResult<T>) -> String {
    match result {
        Ok(data) => ok(data),
        Err(error) => fail(error),
    }
}

fn attempt<T: Serialize, F: FnOnce() -> CoreResult<T>>(f: F) -> String {
    respond(f())
}

// ── Đọc tham số ─────────────────────────────────────────────────────────

/// Đổi mốc thời gian (ms, từ JS) sang số nguyên 64 bit an toàn.
fn read_time(now: f64) -> CoreResult<i64> {
    if !now.is_finite() || now.abs() > 9.0e15 {
        return Err(CoreError::invalid_argument("now"));
    }
    Ok(now.round() as i64)
}

fn read_seed(seed: f64) -> CoreResult<u64> {
    if !seed.is_finite() || seed < 0.0 || seed > u64::MAX as f64 {
        return Err(CoreError::invalid_argument("seed"));
    }
    Ok(seed.round() as u64)
}

fn parse_srs(text: &str, default_due: i64) -> CoreResult<SrsState> {
    let value: Value = serde_json::from_str(text).map_err(|e| CoreError::invalid_json(e.to_string()))?;
    Ok(SrsState::from_json(&value, default_due))
}

fn parse_card(text: &str, now: i64) -> CoreResult<Card> {
    let value: Value = serde_json::from_str(text).map_err(|e| CoreError::invalid_json(e.to_string()))?;
    Card::from_json(&value, now)
}

/// Đọc danh sách thẻ đã chuẩn hoá. Lỗi ở phần tử nào thì báo rõ chỉ số đó —
/// không âm thầm bỏ qua, vì thống kê sai còn tệ hơn một lỗi rõ ràng.
fn parse_cards(text: &str, now: i64) -> CoreResult<Vec<Card>> {
    let values: Vec<Value> =
        serde_json::from_str(text).map_err(|e| CoreError::invalid_json(e.to_string()))?;
    let mut cards = Vec::with_capacity(values.len());
    for (index, value) in values.iter().enumerate() {
        cards.push(
            Card::from_json(value, now)
                .map_err(|e| e.detail(format!("phần tử #{index}")))?,
        );
    }
    Ok(cards)
}

fn parse_drafts(text: &str) -> CoreResult<Vec<CardDraft>> {
    serde_json::from_str(text).map_err(|e| CoreError::invalid_json(e.to_string()))
}

fn parse_ids(text: &str) -> CoreResult<Vec<String>> {
    serde_json::from_str(text).map_err(|e| CoreError::invalid_json(e.to_string()))
}

fn parse_quiz(value: &str) -> CoreResult<Quiz> {
    Quiz::parse(value)
}

// ── Metadata ────────────────────────────────────────────────────────────

/// `data`: `"0.1.0"`
pub fn version() -> String {
    ok(CORE_VERSION)
}

// ── SRS ─────────────────────────────────────────────────────────────────

/// `data`: `SrsState` mới cho một thẻ chưa học.
pub fn srs_new(now: f64) -> String {
    attempt(|| Ok(SrsState::new(read_time(now)?)))
}

/// `data`: `SrsState` sau khi chấm điểm.
pub fn srs_schedule(srs: &str, rating: &str, now: f64) -> String {
    attempt(|| {
        let now = read_time(now)?;
        let state = parse_srs(srs, now)?;
        let rating = Rating::parse(rating)?;
        Ok(state.schedule(rating, now))
    })
}

/// `data`: `bool`
pub fn srs_is_due(srs: &str, now: f64) -> String {
    attempt(|| {
        let now = read_time(now)?;
        Ok(parse_srs(srs, now)?.is_due(now))
    })
}

/// `data`: `bool`
pub fn srs_is_new(srs: &str) -> String {
    attempt(|| Ok(parse_srs(srs, 0)?.is_new()))
}

/// `data`: `bool`
pub fn srs_is_mature(srs: &str) -> String {
    attempt(|| Ok(parse_srs(srs, 0)?.is_mature()))
}

/// `data`: `"rating"` | `"quiz"` | `null`
pub fn srs_weak_reason(srs: &str) -> String {
    attempt(|| Ok(parse_srs(srs, 0)?.weak_reason()))
}

/// `data`: `bool` — thẻ đã đạt ngưỡng thành thạo chưa.
pub fn srs_is_mastered(srs: &str) -> String {
    attempt(|| Ok(parse_srs(srs, 0)?.is_mastered()))
}

/// `data`: `number` — độ thành thạo dài hạn 0.0–1.0.
pub fn srs_mastery(srs: &str) -> String {
    attempt(|| Ok(parse_srs(srs, 0)?.mastery()))
}

/// Khoảng ôn của CẢ BỐN mức đánh giá, trong MỘT lần vượt biên.
///
/// Màn Học cần đủ bốn con số ngay khi lật thẻ để hiển thị "dễ là bao lâu".
/// Trước đây việc đó là bốn lần gọi `srs_schedule` riêng biệt — bốn lần qua lại
/// WASM, bốn lần dựng và phân tích JSON cho cùng một thẻ. Gộp lại không chỉ
/// nhanh hơn mà còn khiến bốn con số và nút bấm không thể lệch nguồn: tất cả
/// đều chạy `SrsState::schedule` như nhau, chỉ khác mức đánh giá.
pub fn srs_preview(srs: &str, now: f64) -> String {
    attempt(|| {
        let now = read_time(now)?;
        let state = parse_srs(srs, now)?;
        let mut out = SrsPreview::default();
        for rating in Rating::ALL {
            let next = state.schedule(rating, now);
            let slot = match rating {
                Rating::Again => &mut out.again,
                Rating::Hard => &mut out.hard,
                Rating::Good => &mut out.good,
                Rating::Easy => &mut out.easy,
            };
            *slot = next.interval;
        }
        Ok(out)
    })
}

/// Khoảng ôn (số ngày) sau mỗi mức đánh giá.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct SrsPreview {
    again: u32,
    hard: u32,
    good: u32,
    easy: u32,
}

// ── Thẻ ─────────────────────────────────────────────────────────────────

/// `data`: `Card` — chuẩn hoá một bản ghi thô (kể cả bản ghi cũ có `reading`).
pub fn card_normalize(raw: &str, now: f64) -> String {
    attempt(|| {
        let now = read_time(now)?;
        parse_card(raw, now)
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RejectedRecord {
    index: usize,
    code: &'static str,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NormalizedCards {
    cards: Vec<Card>,
    rejected: Vec<RejectedRecord>,
}

/// `data`: `{ cards, rejected }` — làm sạch cả một lô, giữ lại phần dùng được.
pub fn cards_normalize(raw: &str, now: f64) -> String {
    attempt(|| {
        let now = read_time(now)?;
        let values: Vec<Value> =
            serde_json::from_str(raw).map_err(|e| CoreError::invalid_json(e.to_string()))?;

        let mut cards = Vec::with_capacity(values.len());
        let mut rejected = Vec::new();
        for (index, value) in values.iter().enumerate() {
            match Card::from_json(value, now) {
                Ok(card) => cards.push(card),
                Err(error) => rejected.push(RejectedRecord {
                    index,
                    code: error.code,
                    message: error.message,
                }),
            }
        }
        Ok(NormalizedCards { cards, rejected })
    })
}

/// `data`: `Card` — tạo thẻ mới. `id` do lớp nền tảng sinh.
pub fn card_make(draft: &str, id: &str, deck_id: &str, now: f64) -> String {
    attempt(|| {
        let now = read_time(now)?;
        let draft = draft_from(draft)?;
        if id.trim().is_empty() {
            return Err(CoreError::invalid_argument("id"));
        }
        let deck_id = if deck_id.trim().is_empty() {
            crate::card::DEFAULT_DECK_ID
        } else {
            deck_id
        };
        Ok(Card::make(&draft, id, deck_id, now))
    })
}

/// `data`: `Card[]` — tạo nhiều thẻ trong MỘT lần vượt biên.
pub fn cards_make(drafts: &str, ids: &str, deck_id: &str, now: f64) -> String {
    attempt(|| {
        let now = read_time(now)?;
        let drafts = parse_drafts(drafts)?;
        let ids = parse_ids(ids)?;
        if ids.len() != drafts.len() {
            return Err(CoreError::invalid_argument("ids").detail(format!(
                "cần {} id, nhận {}",
                drafts.len(),
                ids.len()
            )));
        }
        // Cùng luật với `card_make`: id rỗng tạo ra thẻ mà `cards_normalize` phải
        // cách ly ngay lần nạp sau, nên chặn tại đây thay vì ghi rồi mới phát hiện.
        if ids.iter().any(|id| id.trim().is_empty()) {
            return Err(CoreError::invalid_argument("ids").detail("id thẻ không được rỗng"));
        }
        let deck_id = if deck_id.trim().is_empty() {
            crate::card::DEFAULT_DECK_ID
        } else {
            deck_id
        };
        let cards = drafts
            .iter()
            .zip(ids)
            .map(|(draft, id)| Card::make(draft, id, deck_id, now))
            .collect::<Vec<_>>();
        Ok(cards)
    })
}

/// `data`: `Card` — áp nội dung đã sửa, giữ nguyên id/bộ/lịch SRS.
pub fn card_apply_draft(card: &str, draft: &str) -> String {
    attempt(|| {
        let card = parse_card(card, 0)?;
        let draft = draft_from(draft)?;
        Ok(card.apply_draft(&draft))
    })
}

/// `data`: `Card` — ghi dấu kết quả chế độ Làm bài.
///
/// Chỉ đụng hai trường dấu vết học tập, KHÔNG đổi lịch SRS. Nhờ vậy
/// `srs_weak_reason` phân biệt được "chưa thuộc vì làm sai bài kiểm tra" với
/// "chưa thuộc vì tự chấm Again/Hard".
pub fn card_mark_quiz(card: &str, correct: bool, now: f64) -> String {
    attempt(|| {
        let now = read_time(now)?;
        let card = parse_card(card, now)?;
        Ok(card.with_quiz_result(correct, now))
    })
}

/// `data`: `Card` — ghi dấu một lần trả lời KÈM điểm của lần đó.
///
/// Như `card_mark_quiz`, hàm này không đụng lịch SRS. Điểm nằm ngoài [0,1] hoặc
/// không hữu hạn bị kẹp về khoảng hợp lệ thay vì từ chối: đây là dữ liệu phụ,
/// hỏng nó không được phép làm hỏng bước ghi thẻ.
pub fn card_mark_attempt(card: &str, correct: bool, score: f64, now: f64) -> String {
    attempt(|| {
        let now = read_time(now)?;
        let card = parse_card(card, now)?;
        Ok(card.with_attempt(correct, score, now))
    })
}

fn draft_from(text: &str) -> CoreResult<CardDraft> {
    serde_json::from_str(text).map_err(|e| CoreError::invalid_json(e.to_string()))
}

// ── Bộ thẻ ──────────────────────────────────────────────────────────────

/// `data`: `{ name, cards }` — đọc file bộ thẻ.
pub fn deck_parse(text: &str, filename: &str, quiz: &str) -> String {
    attempt(|| {
        let quiz = parse_quiz(quiz)?;
        import::parse_deck(text, filename, quiz)
    })
}

/// `data`: `{ filename, mime, text }` — dựng nội dung file xuất.
pub fn deck_export(cards: &str, format: &str, deck_name: &str, date_stamp: &str) -> String {
    attempt(|| {
        let format = ExportFormat::parse(format)?;
        let cards = parse_cards(cards, 0)?;
        Ok(export::export(&cards, format, deck_name, date_stamp))
    })
}

/// `data`: `{ fresh, skipped }` — thẻ mới cần thêm, không ghi đè thẻ đã có.
pub fn deck_plan_import(
    cards: &str,
    drafts: &str,
    deck_id: &str,
    ids: &str,
    now: f64,
) -> String {
    attempt(|| {
        let now = read_time(now)?;
        let cards = parse_cards(cards, now)?;
        let drafts = parse_drafts(drafts)?;
        let ids = parse_ids(ids)?;
        import::plan_import(&cards, &drafts, deck_id, &ids, now)
    })
}

/// `data`: `ReconcileResult` — đồng bộ nội dung xuất bản với thẻ người học.
///
/// Không bao giờ trả về hành vi xoá: thẻ biến mất khỏi nội dung chỉ được báo
/// trong `orphaned` để giao diện quyết định.
///
/// `previous_ids` là id thẻ của phiên bản nội dung ĐANG dùng (lớp nền tảng lưu
/// khi kích hoạt nội dung) — cần thiết để không gán nhầm nhãn "mồ côi" cho thẻ
/// người dùng tự tạo trong cùng bộ.
pub fn content_reconcile(
    cards: &str,
    content: &str,
    previous_ids: &str,
    deck_id: &str,
    now: f64,
) -> String {
    attempt(|| {
        let now = read_time(now)?;
        let cards = parse_cards(cards, now)?;
        let drafts = parse_drafts(content)?;
        let previous_ids = parse_ids(previous_ids)?;
        let deck_id = if deck_id.trim().is_empty() {
            crate::card::DEFAULT_DECK_ID
        } else {
            deck_id
        };
        content::reconcile(&cards, &drafts, &previous_ids, deck_id, now)
    })
}

// ── Thống kê và lọc ─────────────────────────────────────────────────────

/// `data`: `DeckStats`
pub fn deck_stats(cards: &str, now: f64, quiz: &str) -> String {
    attempt(|| {
        let now = read_time(now)?;
        let cards = parse_cards(cards, now)?;
        let quiz = parse_quiz(quiz)?;
        Ok(stats::stats(&cards, now, quiz))
    })
}

/// `data`: `{ ids, lessons }` — id các thẻ khớp, luôn kèm tóm tắt 50 bài.
pub fn cards_filter(cards: &str, filter: &str, now: f64) -> String {
    attempt(|| {
        let now = read_time(now)?;
        let cards = parse_cards(cards, now)?;
        let filter: CardFilter =
            serde_json::from_str(filter).map_err(|e| CoreError::invalid_json(e.to_string()))?;
        Ok(FilterResult {
            ids: stats::filter_ids(&cards, &filter, now),
            lessons: stats::lesson_summary(&cards, now),
        })
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FilterResult {
    ids: Vec<String>,
    lessons: Vec<stats::LessonInfo>,
}

/// `data`: `LessonInfo[]` — khung 50 bài kèm tiến độ từng bài (số thẻ, tới hạn,
/// mới/đang học/chín, chưa thuộc theo lý do, thành thạo và điểm làm bài).
pub fn lesson_summary(cards: &str, now: f64) -> String {
    attempt(|| {
        let now = read_time(now)?;
        let cards = parse_cards(cards, now)?;
        Ok(stats::lesson_summary(&cards, now))
    })
}

// ── Phiên học ───────────────────────────────────────────────────────────

/// `data`: `string[]` — thứ tự mới sau khi trộn (cùng `seed` ⇒ cùng kết quả).
pub fn session_shuffle(ids: &str, seed: f64) -> String {
    attempt(|| {
        let seed = read_seed(seed)?;
        let ids = parse_ids(ids)?;
        Ok(session::shuffle_ids(&ids, seed))
    })
}

/// `data`: `{ queue, index, dropped }` — phiên học đã khôi phục.
///
/// `snapshot`: `{ queue: [id…], index: N }` là bản lưu của phiên đang dở.
/// `available`: `[id…]` là id thẻ hiện có trong thư viện.
///
/// Cố ý KHOAN DUNG với `snapshot`: bản lưu là dữ liệu phụ, hỏng nó không được
/// phép làm ứng dụng không mở được. Thiếu trường hoặc sai kiểu ⇒ coi như phiên
/// rỗng, và giao diện chỉ đơn giản là không có gì để khôi phục. Lỗi duy nhất
/// còn lại là JSON không phân tích được.
pub fn session_restore(snapshot: &str, available: &str) -> String {
    attempt(|| {
        let value: Value =
            serde_json::from_str(snapshot).map_err(|e| CoreError::invalid_json(e.to_string()))?;
        let queue = json::string_list(&value, "queue");
        let index = json::u32_or(&value, "index", 0) as usize;
        let available = parse_ids(available)?;
        Ok(session::restore(&queue, index, &available))
    })
}

// ── Làm bài ─────────────────────────────────────────────────────────────

/// `data`: `string` — câu hỏi của thẻ (luôn là mặt tiếng Việt).
pub fn quiz_prompt(card: &str, quiz: &str) -> String {
    attempt(|| {
        let card = parse_card(card, 0)?;
        let quiz = parse_quiz(quiz)?;
        Ok(quiz::prompt_of(&card, quiz))
    })
}

/// `data`: `{ correct, matched?, reference, score, verdict }`
pub fn quiz_check(input: &str, card: &str, quiz: &str) -> String {
    attempt(|| {
        let card = parse_card(card, 0)?;
        let quiz = parse_quiz(quiz)?;
        Ok(quiz::check_answer(input, &card, quiz))
    })
}

/// Như `quiz_check` nhưng nhận cấu hình chấm điểm.
///
/// Cấu hình là đầu vào của thuật toán: cùng câu trả lời + cùng cấu hình ⇒ cùng
/// kết quả. Thiếu trường trong JSON thì dùng mặc định (xem `AnswerConfig`).
pub fn quiz_score(input: &str, card: &str, quiz: &str, config: &str) -> String {
    attempt(|| {
        let card = parse_card(card, 0)?;
        let quiz = parse_quiz(quiz)?;
        let raw = if config.trim().is_empty() { "{}" } else { config };
        let config: quiz::AnswerConfig =
            serde_json::from_str(raw).map_err(|e| CoreError::invalid_json(e.to_string()))?;
        Ok(quiz::score_answer(input, &card, quiz, config))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const T0: f64 = 1_700_000_000_000.0;

    fn data(envelope: &str) -> Value {
        let value: Value = serde_json::from_str(envelope).expect("phong bì phải là JSON");
        assert_eq!(value["ok"], json!(true), "phong bì lỗi: {envelope}");
        value["data"].clone()
    }

    fn error_code(envelope: &str) -> String {
        let value: Value = serde_json::from_str(envelope).expect("phong bì phải là JSON");
        assert_eq!(value["ok"], json!(false), "đáng lẽ phải lỗi: {envelope}");
        value["error"]["code"].as_str().unwrap().to_string()
    }

    fn card_json() -> String {
        json!({
            "id": "c1", "deckId": "vocabulary", "front": "Xin chào", "back": "こんにちは",
            "furigana": "こんにちは", "romaji": "konnichiwa", "tags": ["bài 1"],
            "createdAt": T0, "srs": { "due": T0 }
        })
        .to_string()
    }

    #[test]
    fn every_error_has_the_same_shape() {
        let envelope = srs_schedule("{}", "nope", T0);
        let value: Value = serde_json::from_str(&envelope).unwrap();
        assert_eq!(value["ok"], json!(false));
        assert_eq!(value["error"]["code"], json!("invalid_argument"));
        assert!(!value["error"]["message"].as_str().unwrap().is_empty());
        assert!(value.get("data").is_none());
    }

    #[test]
    fn version_is_reported_inside_an_envelope() {
        assert_eq!(data(&version()), json!(CORE_VERSION));
    }

    #[test]
    fn session_restore_returns_the_restored_queue() {
        let snapshot = json!({ "queue": ["a", "b", "c", "d"], "index": 2 }).to_string();
        let available = json!(["a", "c", "d"]).to_string();
        let out = data(&session_restore(&snapshot, &available));
        assert_eq!(out["queue"], json!(["a", "c", "d"]));
        // "b" bị bỏ và nó nằm TRƯỚC vị trí 2 ⇒ vị trí mới là 1.
        assert_eq!(out["index"], json!(1));
        assert_eq!(out["dropped"], json!(1));
    }

    #[test]
    fn session_restore_is_tolerant_about_a_damaged_snapshot() {
        let available = json!(["a"]).to_string();
        // Bản lưu là dữ liệu phụ — thiếu trường hoặc sai kiểu không được làm lỗi.
        for snapshot in ["{}", r#"{"queue":42}"#, r#"{"index":"x"}"#] {
            let out = data(&session_restore(snapshot, &available));
            assert_eq!(out["queue"], json!([]), "snapshot: {snapshot}");
            assert_eq!(out["index"], json!(0));
        }
        // Nhưng JSON không phân tích được thì phải báo lỗi rõ ràng.
        assert_eq!(
            error_code(&session_restore("{không phải json", &available)),
            "invalid_json"
        );
    }

    #[test]
    fn srs_functions_round_trip_through_strings() {
        let fresh = data(&srs_new(T0));
        assert_eq!(fresh["ease"], json!(2.5));
        assert_eq!(fresh["lastRating"], Value::Null);

        let scheduled = data(&srs_schedule(&fresh.to_string(), "good", T0));
        assert_eq!(scheduled["interval"], json!(1));
        assert_eq!(scheduled["lastRating"], json!("good"));
        assert_eq!(scheduled["due"], json!(T0 as i64 + 86_400_000));

        assert_eq!(data(&srs_is_due(&scheduled.to_string(), T0)), json!(false));
        assert_eq!(data(&srs_is_due(&scheduled.to_string(), T0 + 86_400_001.0)), json!(true));
        assert_eq!(data(&srs_is_new(&fresh.to_string())), json!(true));
        assert_eq!(data(&srs_is_mature(&fresh.to_string())), json!(false));
        assert_eq!(data(&srs_weak_reason(&fresh.to_string())), Value::Null);
        assert_eq!(
            data(&srs_weak_reason(&scheduled.to_string())),
            Value::Null
        );
    }

    #[test]
    fn rejects_out_of_range_timestamps() {
        assert_eq!(error_code(&srs_new(f64::NAN)), "invalid_argument");
        assert_eq!(error_code(&srs_new(f64::INFINITY)), "invalid_argument");
        assert_eq!(error_code(&srs_new(1.0e18)), "invalid_argument");
    }

    #[test]
    fn card_normalize_migrates_legacy_records() {
        let raw = json!({ "id": "c1", "front": "a", "back": "b", "reading": "konnichiwa" }).to_string();
        let card = data(&card_normalize(&raw, T0));
        assert_eq!(card["romaji"], json!("konnichiwa"));
        assert_eq!(card["deckId"], json!("vocabulary"));
        assert_eq!(card["srs"]["ease"], json!(2.5));
    }

    #[test]
    fn card_normalize_reports_bad_records() {
        assert_eq!(
            error_code(&card_normalize(&json!({ "front": "a" }).to_string(), T0)),
            "invalid_record"
        );
        assert_eq!(error_code(&card_normalize("{not json", T0)), "invalid_json");
    }

    #[test]
    fn cards_normalize_keeps_the_good_and_reports_the_bad() {
        let raw = json!([
            { "id": "a", "front": "a", "back": "b" },
            { "front": "thiếu id" },
            { "id": "c", "front": "c", "back": "d" }
        ])
        .to_string();

        let out = data(&cards_normalize(&raw, T0));
        assert_eq!(out["cards"].as_array().unwrap().len(), 2);
        assert_eq!(out["rejected"].as_array().unwrap().len(), 1);
        assert_eq!(out["rejected"][0]["index"], json!(1));
        assert_eq!(out["rejected"][0]["code"], json!("invalid_record"));
    }

    #[test]
    fn cards_make_and_apply_draft_keep_identity() {
        let draft = json!({ "front": "Xin chào", "back": "こんにちは", "romaji": "konnichiwa" });
        let made = data(&cards_make(
            &json!([draft]).to_string(),
            &json!(["id-1"]).to_string(),
            "vocabulary",
            T0,
        ));
        let card = &made[0];
        assert_eq!(card["id"], json!("id-1"));
        assert_eq!(card["srs"]["interval"], json!(0));

        let edited = data(&card_apply_draft(
            &card.to_string(),
            &json!({ "front": "Tạm biệt", "back": "さようなら" }).to_string(),
        ));
        assert_eq!(edited["id"], json!("id-1"));
        assert_eq!(edited["front"], json!("Tạm biệt"));
        assert_eq!(edited["srs"], card["srs"]);
    }

    #[test]
    fn cards_make_rejects_an_empty_id_like_card_make() {
        // Hai đường tạo thẻ phải cùng một luật: `card_make` đã từ chối id rỗng,
        // còn `cards_make` thì âm thầm tạo thẻ không đọc lại được.
        let drafts = json!([{ "front": "a", "back": "b" }]).to_string();
        for ids in [json!([""]), json!(["   "])] {
            assert_eq!(
                error_code(&cards_make(&drafts, &ids.to_string(), "vocabulary", T0)),
                "invalid_argument"
            );
        }
    }

    #[test]
    fn cards_make_rejects_a_mismatched_id_count() {
        let drafts = json!([{ "front": "a", "back": "b" }]).to_string();
        assert_eq!(
            error_code(&cards_make(&drafts, "[]", "vocabulary", T0)),
            "invalid_argument"
        );
    }

    #[test]
    fn deck_parse_dispatches_and_reports_errors() {
        // Đuôi .json nhưng nội dung là CSV ⇒ báo lỗi JSON rõ ràng, không đoán.
        assert_eq!(
            error_code(&deck_parse("front,back\nXin chào,こんにちは\n", "tu.json", "meaning")),
            "invalid_json"
        );
        assert_eq!(error_code(&deck_parse("a,b", "x.xlsx", "meaning")), "unsupported_format");
        assert_eq!(error_code(&deck_parse("a,b", "x.json", "nope")), "invalid_argument");

        let parsed = data(&deck_parse(
            "front,back\nXin chào,こんにちは\n",
            "tu.csv",
            "meaning",
        ));
        assert_eq!(parsed["cards"][0]["back"], json!("こんにちは"));
        assert_eq!(parsed["name"], json!("Đã import"));
    }

    #[test]
    fn deck_export_returns_a_downloadable_file() {
        let out = data(&deck_export(
            &json!([serde_json::from_str::<Value>(&card_json()).unwrap()]).to_string(),
            "csv",
            "Bộ của tôi",
            "2026-10-12",
        ));
        assert_eq!(out["filename"], json!("midori-2026-10-12.csv"));
        assert_eq!(out["mime"], json!("text/csv"));
        assert!(out["text"].as_str().unwrap().starts_with("front,back"));
    }

    #[test]
    fn stats_and_filter_agree_on_the_same_library() {
        let library = json!([
            serde_json::from_str::<Value>(&card_json()).unwrap(),
            json!({ "id": "c2", "deckId": "patterns", "front": "Bạn là ai?", "back": "だれですか",
                    "createdAt": T0, "srs": { "due": T0, "repetitions": 3, "interval": 30 } })
        ])
        .to_string();

        let stats = data(&deck_stats(&library, T0, "meaning"));
        assert_eq!(stats["total"], json!(2));
        assert_eq!(stats["new"], json!(1));
        assert_eq!(stats["due"], json!(2));
        assert_eq!(stats["mature"], json!(1));
        assert_eq!(stats["byDeck"]["vocabulary"]["total"], json!(1));

        let filtered = data(&cards_filter(
            &library,
            &json!({ "deckIds": ["patterns"] }).to_string(),
            T0,
        ));
        assert_eq!(filtered["ids"], json!(["c2"]));
        assert_eq!(filtered["lessons"].as_array().unwrap().len(), 50);

        assert_eq!(
            error_code(&cards_filter("{}", "{}", T0)),
            "invalid_json"
        );
    }

    #[test]
    fn stats_reports_which_element_is_broken() {
        let library = json!([{ "front": "thiếu id" }]).to_string();
        let envelope = deck_stats(&library, T0, "meaning");
        let value: Value = serde_json::from_str(&envelope).unwrap();
        assert_eq!(value["error"]["detail"], json!("phần tử #0"));
    }

    #[test]
    fn shuffle_is_deterministic_and_validates_the_seed() {
        let ids = json!(["a", "b", "c", "d", "e"]).to_string();
        assert_eq!(data(&session_shuffle(&ids, 3.0)), data(&session_shuffle(&ids, 3.0)));
        assert_eq!(error_code(&session_shuffle(&ids, -1.0)), "invalid_argument");
        assert_eq!(error_code(&session_shuffle(&ids, f64::NAN)), "invalid_argument");
        assert_eq!(error_code(&session_shuffle("{}", 1.0)), "invalid_json");
    }

    #[test]
    fn import_plan_never_touches_existing_cards() {
        let library = json!([serde_json::from_str::<Value>(&card_json()).unwrap()]).to_string();
        let drafts = json!([
            { "front": "Xin chào", "back": "こんにちは" },
            { "front": "Tạm biệt", "back": "さようなら" }
        ])
        .to_string();

        let plan = data(&deck_plan_import(
            &library,
            &drafts,
            "vocabulary",
            &json!(["n1", "n2"]).to_string(),
            T0,
        ));
        assert_eq!(plan["skipped"], json!(1));
        assert_eq!(plan["fresh"].as_array().unwrap().len(), 1);
        assert_eq!(plan["fresh"][0]["id"], json!("n2"));
        assert_eq!(plan["fresh"][0]["srs"]["due"], json!(T0 as i64));
    }

    #[test]
    fn quiz_helpers_use_the_declared_answers_only() {
        let card = card_json();
        assert_eq!(data(&quiz_prompt(&card, "meaning")), json!("Xin chào"));
        assert_eq!(data(&quiz_prompt(&card, "reading")), json!("こんにちは"));

        let right = data(&quiz_check("KONNICHIWA", &card, "meaning"));
        assert_eq!(right["correct"], json!(true));
        assert_eq!(right["matched"], json!("konnichiwa"));

        let wrong = data(&quiz_check("sai rồi", &card, "meaning"));
        assert_eq!(wrong["correct"], json!(false));
        assert!(wrong.get("matched").is_none());
        // Đáp án tham khảo giữ đúng thứ tự khai báo, kể cả khi mặt chữ trùng nhau.
        assert_eq!(
            wrong["reference"],
            json!(["こんにちは", "こんにちは", "konnichiwa"])
        );
    }

    #[test]
    fn srs_preview_returns_all_four_intervals_in_one_call() {
        let fresh = data(&srs_new(T0));
        let preview = data(&srs_preview(&fresh.to_string(), T0));
        assert_eq!(preview["again"], json!(0));
        assert_eq!(preview["hard"], json!(1));
        assert_eq!(preview["good"], json!(1));
        assert_eq!(preview["easy"], json!(1));

        // Thẻ đã học: bốn mức phải khác nhau, và khớp với `srs_schedule` từng mức.
        let learned = data(&srs_schedule(&fresh.to_string(), "good", T0));
        let learned = data(&srs_schedule(&learned.to_string(), "good", T0));
        let preview = data(&srs_preview(&learned.to_string(), T0));
        for (key, rating) in [
            ("again", "again"),
            ("hard", "hard"),
            ("good", "good"),
            ("easy", "easy"),
        ] {
            let one = data(&srs_schedule(&learned.to_string(), rating, T0));
            assert_eq!(preview[key], one["interval"], "mức {rating}");
        }

        assert_eq!(error_code(&srs_preview("{", T0)), "invalid_json");
        assert_eq!(error_code(&srs_preview(&fresh.to_string(), f64::NAN)), "invalid_argument");
    }

    #[test]
    fn quiz_score_reports_a_verdict_and_a_score() {
        let card = json!({
            "id": "c1", "deckId": "vocabulary", "front": "nghĩa", "back": "意味",
            "createdAt": T0, "srs": { "due": T0 }
        })
        .to_string();

        let exact = data(&quiz_score("nghĩa", &card, "reading", "{}"));
        assert_eq!(exact["verdict"], json!("exact"));
        assert_eq!(exact["score"], json!(1.0));
        assert_eq!(exact["correct"], json!(true));

        let missing_accents = data(&quiz_score("nghia", &card, "reading", "{}"));
        assert_eq!(missing_accents["verdict"], json!("accepted"));
        assert_eq!(missing_accents["score"], json!(0.9));
        assert_eq!(missing_accents["correct"], json!(true));

        let strict = data(&quiz_score(
            "nghia",
            &card,
            "reading",
            &json!({ "accentTolerant": false }).to_string(),
        ));
        assert_eq!(strict["verdict"], json!("wrong"));
        assert_eq!(strict["score"], json!(0.0));

        let blank = data(&quiz_score("  ", &card, "reading", "{}"));
        assert_eq!(blank["verdict"], json!("empty"));
        assert_eq!(blank["score"], json!(0.0));

        assert_eq!(
            error_code(&quiz_score("x", &card, "reading", "{not json")),
            "invalid_json"
        );
        assert_eq!(
            error_code(&quiz_score("x", "{", "reading", "{}")),
            "invalid_json"
        );
    }

    #[test]
    fn marking_an_attempt_stores_the_score_without_moving_the_schedule() {
        let card = card_json();
        let before: Value = serde_json::from_str(&card).unwrap();

        let marked = data(&card_mark_attempt(&card, false, 0.5, T0 + 500.0));
        assert_eq!(marked["srs"]["lastScore"], json!(0.5));
        assert_eq!(marked["srs"]["lastWrongAt"], json!(T0 as i64 + 500));
        assert_eq!(
            marked["srs"]["due"].as_f64(),
            before["srs"]["due"].as_f64()
        );
        assert_eq!(marked["srs"]["interval"], json!(0));

        // Điểm rác bị kẹp, không làm hỏng bước ghi.
        let clamped = data(&card_mark_attempt(&card, true, 9.0, T0));
        assert_eq!(clamped["srs"]["lastScore"], json!(1.0));
        assert!(clamped["srs"].get("lastWrongAt").is_none());
    }

    #[test]
    fn stats_expose_mastery_and_accuracy_together() {
        let library = json!([
            serde_json::from_str::<Value>(&card_json()).unwrap(),
            json!({ "id": "c2", "deckId": "vocabulary", "front": "Tạm biệt", "back": "さようなら",
                    "createdAt": T0,
                    "srs": { "due": T0, "repetitions": 3, "interval": 30, "lastScore": 0.5 } })
        ])
        .to_string();

        let stats = data(&deck_stats(&library, T0, "meaning"));
        assert_eq!(stats["graded"], json!(1));
        assert_eq!(stats["accuracy"], json!(0.5));
        assert_eq!(stats["mastered"], json!(1));
        assert!(stats["mastery"].as_f64().unwrap() > 0.0);
        // Hai đại lượng khác nhau và KHÔNG được gộp thành một con số.
        assert_ne!(stats["mastery"], stats["accuracy"]);
        assert_eq!(stats["byDeck"]["vocabulary"]["accuracy"], json!(0.5));
        assert!(stats["byDeck"]["vocabulary"]["mastery"].as_f64().unwrap() > 0.0);
    }

    #[test]
    fn quiz_marks_are_recorded_without_touching_the_schedule() {
        let card = card_json();
        let before: Value = serde_json::from_str(&card).unwrap();

        let wrong = data(&card_mark_quiz(&card, false, T0 + 1000.0));
        assert_eq!(wrong["srs"]["lastWrongAt"], json!(T0 as i64 + 1000));
        // So bằng `as_f64`: `serde_json` phân biệt số nguyên và số thực, còn hai
        // bên đi qua đường khác nhau nên có thể lệch cách biểu diễn.
        assert_eq!(
            wrong["srs"]["due"].as_f64(),
            before["srs"]["due"].as_f64()
        );
        // Thẻ trong fixture chưa có `interval` ⇒ mặc định 0, và phải giữ nguyên 0.
        assert_eq!(wrong["srs"]["interval"], json!(0));
        // `srs_weak_reason` nhận TRẠNG THÁI SRS, không phải cả thẻ.
        assert_eq!(data(&srs_weak_reason(&wrong["srs"].to_string())), json!("quiz"));

        let right = data(&card_mark_quiz(&wrong.to_string(), true, T0 + 2000.0));
        assert!(right["srs"].get("lastWrongAt").is_none());
        assert_eq!(data(&srs_weak_reason(&right["srs"].to_string())), Value::Null);

        assert_eq!(error_code(&card_mark_quiz("{", false, T0)), "invalid_json");
    }

    #[test]
    fn content_reconcile_preserves_learning_progress() {
        let library = json!([serde_json::from_str::<Value>(&card_json()).unwrap()]).to_string();
        // Phiên bản nội dung mới: sửa nội dung thẻ cũ và thêm một thẻ.
        let content = json!([
            { "id": "c1", "front": "Xin chào (v2)", "back": "こんにちは", "tags": ["bài 1"] },
            { "id": "c2", "front": "Tạm biệt", "back": "さようなら" }
        ])
        .to_string();

        let out = data(&content_reconcile(
            &library,
            &content,
            &json!(["c1"]).to_string(),
            "vocabulary",
            T0,
        ));

        assert_eq!(out["updated"].as_array().unwrap().len(), 1);
        assert_eq!(out["updated"][0]["id"], json!("c1"));
        assert_eq!(out["updated"][0]["front"], json!("Xin chào (v2)"));
        assert_eq!(out["updated"][0]["srs"]["due"], json!(T0 as i64));
        assert_eq!(out["fresh"].as_array().unwrap().len(), 1);
        assert_eq!(out["fresh"][0]["id"], json!("c2"));
        assert_eq!(out["orphaned"], json!([]));
        assert_eq!(out["unchanged"], json!(0));
    }

    #[test]
    fn content_reconcile_reports_removals_without_deleting() {
        let library = json!([serde_json::from_str::<Value>(&card_json()).unwrap()]).to_string();
        let out = data(&content_reconcile(
            &library,
            "[]",
            &json!(["c1"]).to_string(),
            "vocabulary",
            T0,
        ));
        assert_eq!(out["orphaned"], json!(["c1"]));
        assert!(out["updated"].as_array().unwrap().is_empty());
    }

    #[test]
    fn content_reconcile_requires_stable_ids() {
        let content = json!([{ "front": "a", "back": "b" }]).to_string();
        assert_eq!(
            error_code(&content_reconcile("[]", &content, "[]", "vocabulary", T0)),
            "invalid_record"
        );
    }

    #[test]
    fn lesson_summary_is_available_before_any_cards_exist() {
        let out = data(&lesson_summary("[]", T0));
        assert_eq!(out.as_array().unwrap().len(), 50);
        assert_eq!(out[0]["label"], json!("Bài 1"));
        assert_eq!(out[0]["count"], json!(0));
    }

    #[test]
    fn helpers_reject_unreadable_json() {
        assert_eq!(error_code(&srs_is_new("{")), "invalid_json");
        assert_eq!(error_code(&deck_export("{}", "json", "x", "2026-01-01")), "invalid_json");
        assert_eq!(error_code(&cards_make("{}", "[]", "d", T0)), "invalid_json");
    }
}
