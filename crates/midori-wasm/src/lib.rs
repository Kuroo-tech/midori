//! Biên WASM của Midori.
//!
//! # Trách nhiệm
//!
//! File này **chỉ** chuyển tiếp sang `midori_core::api`. Không có logic nghiệp
//! vụ, không có xử lý lỗi riêng, không có trạng thái. Mọi thứ đáng kiểm thử nằm
//! ở `midori-core` — nơi `cargo test` chạy native, nhanh, không cần trình duyệt.
//!
//! # Hợp đồng
//!
//! Mọi hàm trả về `String` là **phong bì JSON**:
//! `{"ok":true,"data":…}` hoặc `{"ok":false,"error":{"code","message","detail"}}`.
//!
//! Không hàm nào panic: lỗi luôn được đóng gói thành phong bì, vì một panic
//! trong WASM sẽ làm hỏng instance và JS chỉ nhận được `RuntimeError` vô nghĩa.

use wasm_bindgen::prelude::*;

// ── Metadata ────────────────────────────────────────────────────────────

/// Phiên bản lõi. JS dùng để xác nhận WASM khớp với lớp JS.
#[wasm_bindgen]
pub fn version() -> String {
    midori_core::api::version()
}

// ── SRS ─────────────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn srs_new(now: f64) -> String {
    midori_core::api::srs_new(now)
}

#[wasm_bindgen]
pub fn srs_schedule(srs: &str, rating: &str, now: f64) -> String {
    midori_core::api::srs_schedule(srs, rating, now)
}

#[wasm_bindgen]
pub fn srs_is_due(srs: &str, now: f64) -> String {
    midori_core::api::srs_is_due(srs, now)
}

#[wasm_bindgen]
pub fn srs_is_new(srs: &str) -> String {
    midori_core::api::srs_is_new(srs)
}

#[wasm_bindgen]
pub fn srs_is_mature(srs: &str) -> String {
    midori_core::api::srs_is_mature(srs)
}

#[wasm_bindgen]
pub fn srs_weak_reason(srs: &str) -> String {
    midori_core::api::srs_weak_reason(srs)
}

#[wasm_bindgen]
pub fn srs_is_mastered(srs: &str) -> String {
    midori_core::api::srs_is_mastered(srs)
}

#[wasm_bindgen]
pub fn srs_mastery(srs: &str) -> String {
    midori_core::api::srs_mastery(srs)
}

#[wasm_bindgen]
pub fn srs_preview(srs: &str, now: f64) -> String {
    midori_core::api::srs_preview(srs, now)
}

// ── Thẻ ─────────────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn card_normalize(raw: &str, now: f64) -> String {
    midori_core::api::card_normalize(raw, now)
}

#[wasm_bindgen]
pub fn cards_normalize(raw: &str, now: f64) -> String {
    midori_core::api::cards_normalize(raw, now)
}

#[wasm_bindgen]
pub fn card_make(draft: &str, id: &str, deck_id: &str, now: f64) -> String {
    midori_core::api::card_make(draft, id, deck_id, now)
}

#[wasm_bindgen]
pub fn cards_make(drafts: &str, ids: &str, deck_id: &str, now: f64) -> String {
    midori_core::api::cards_make(drafts, ids, deck_id, now)
}

#[wasm_bindgen]
pub fn card_apply_draft(card: &str, draft: &str) -> String {
    midori_core::api::card_apply_draft(card, draft)
}

#[wasm_bindgen]
pub fn card_mark_quiz(card: &str, correct: bool, now: f64) -> String {
    midori_core::api::card_mark_quiz(card, correct, now)
}

#[wasm_bindgen]
pub fn card_mark_attempt(card: &str, correct: bool, score: f64, now: f64) -> String {
    midori_core::api::card_mark_attempt(card, correct, score, now)
}

// ── Bộ thẻ ──────────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn deck_parse(text: &str, filename: &str, quiz: &str) -> String {
    midori_core::api::deck_parse(text, filename, quiz)
}

#[wasm_bindgen]
pub fn deck_export(cards: &str, format: &str, deck_name: &str, date_stamp: &str) -> String {
    midori_core::api::deck_export(cards, format, deck_name, date_stamp)
}

#[wasm_bindgen]
pub fn deck_plan_import(cards: &str, drafts: &str, deck_id: &str, ids: &str, now: f64) -> String {
    midori_core::api::deck_plan_import(cards, drafts, deck_id, ids, now)
}

#[wasm_bindgen]
pub fn content_reconcile(
    cards: &str,
    content: &str,
    previous_ids: &str,
    deck_id: &str,
    now: f64,
) -> String {
    midori_core::api::content_reconcile(cards, content, previous_ids, deck_id, now)
}

// ── Thống kê và lọc ─────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn deck_stats(cards: &str, now: f64, quiz: &str) -> String {
    midori_core::api::deck_stats(cards, now, quiz)
}

#[wasm_bindgen]
pub fn cards_filter(cards: &str, filter: &str, now: f64) -> String {
    midori_core::api::cards_filter(cards, filter, now)
}

#[wasm_bindgen]
pub fn lesson_summary(cards: &str, now: f64) -> String {
    midori_core::api::lesson_summary(cards, now)
}

// ── Phiên học ───────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn session_shuffle(ids: &str, seed: f64) -> String {
    midori_core::api::session_shuffle(ids, seed)
}

#[wasm_bindgen]
pub fn session_restore(snapshot: &str, available: &str) -> String {
    midori_core::api::session_restore(snapshot, available)
}

// ── Làm bài ─────────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn quiz_prompt(card: &str, quiz: &str) -> String {
    midori_core::api::quiz_prompt(card, quiz)
}

#[wasm_bindgen]
pub fn quiz_check(input: &str, card: &str, quiz: &str) -> String {
    midori_core::api::quiz_check(input, card, quiz)
}

#[wasm_bindgen]
pub fn quiz_score(input: &str, card: &str, quiz: &str, config: &str) -> String {
    midori_core::api::quiz_score(input, card, quiz, config)
}
