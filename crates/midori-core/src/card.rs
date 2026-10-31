//! Mô hình thẻ: thẻ đã lưu (`Card`) và bản nháp nội dung (`CardDraft`).
//!
//! Quy ước nội dung: mỗi bộ có mặt "tiếng Việt" và mặt "tiếng Nhật", thứ tự phụ
//! thuộc `Quiz`:
//!   - `meaning` → `front` = tiếng Việt, `back` = Kanji
//!   - `reading` → `front` = Kanji,      `back` = tiếng Việt

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{CoreError, CoreResult};
use crate::json;
use crate::srs::SrsState;
use crate::text;

/// Chế độ hỏi của một bộ thẻ.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Quiz {
    Meaning,
    Reading,
}

impl Quiz {
    pub fn parse(value: &str) -> CoreResult<Self> {
        match value {
            "meaning" => Ok(Quiz::Meaning),
            "reading" => Ok(Quiz::Reading),
            _ => Err(CoreError::invalid_argument("quiz")),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Quiz::Meaning => "meaning",
            Quiz::Reading => "reading",
        }
    }
}

/// Bộ thẻ mặc định khi bản ghi không khai báo.
pub const DEFAULT_DECK_ID: &str = "vocabulary";

/// Bốn trường nội dung + metadata của một thẻ đã lưu.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    pub id: String,
    pub deck_id: String,
    pub front: String,
    pub back: String,
    #[serde(default)]
    pub furigana: String,
    #[serde(default)]
    pub romaji: String,
    #[serde(default)]
    pub tags: Vec<String>,
    /// 1..=50 — chỉ áp dụng cho bộ Từ vựng (Minna no Nihongo).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lesson: Option<u32>,
    pub created_at: i64,
    pub srs: SrsState,
}

/// Nội dung thẻ không kèm trạng thái học — dùng cho nhập/xuất file.
///
/// `id` là **danh tính nội dung**: thẻ thuộc bộ xuất bản phải mang id do nhà
/// phát hành đặt, ổn định qua mọi lần cập nhật dữ liệu. Nhờ đó việc cập nhật nội
/// dung không làm mất lịch ôn của người học (xem `content::reconcile`).
/// Thẻ do người dùng tự tạo không cần id — lớp nền tảng sinh UUID khi tạo.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardDraft {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub front: String,
    pub back: String,
    #[serde(default)]
    pub furigana: String,
    #[serde(default)]
    pub romaji: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lesson: Option<u32>,
}

/// Khoá so trùng trong cùng một bộ: nội dung hiển thị, đã chuẩn hoá.
pub fn dedupe_key(front: &str, back: &str) -> String {
    format!("{}\u{0}{}", front.trim(), back.trim())
}

/// Tách trường `reading` cũ (Mitsuha) thành furigana hoặc romaji.
///
/// Quy tắc hợp nhất cho CẢ đường nhập file lẫn đường đọc IndexedDB (Mitsuha có
/// hai quy tắc khác nhau — xem `docs/decisions.md`):
///   - chỉ có kana       ⇒ furigana
///   - còn lại           ⇒ romaji
pub(crate) fn split_legacy_reading(legacy: &str) -> (Option<String>, Option<String>) {
    if legacy.is_empty() {
        return (None, None);
    }
    if text::has_kana(legacy) && !text::has_latin(legacy) {
        (Some(legacy.to_string()), None)
    } else {
        (None, Some(legacy.to_string()))
    }
}

impl CardDraft {
    /// Đọc nháp từ JSON với header/trường linh hoạt (JSON của Midori/Mitsuha,
    /// `vietnamese`/`kanji`/`hiragana`/`romaji` của japanese_tnai).
    /// Trả `None` khi thiếu mặt câu hỏi hoặc mặt đáp án.
    pub fn from_json(value: &Value, quiz: Quiz) -> Option<CardDraft> {
        let pick = |a: &str, b: &str| -> String {
            let first = json::string(value, a);
            if first.is_empty() {
                json::string(value, b)
            } else {
                first
            }
        };

        let (front, back) = match quiz {
            Quiz::Meaning => (pick("front", "vietnamese"), pick("back", "kanji")),
            Quiz::Reading => (pick("front", "kanji"), pick("back", "vietnamese")),
        };
        let back = if back.is_empty() && quiz == Quiz::Meaning {
            json::string(value, "hiragana")
        } else {
            back
        };
        if front.is_empty() || back.is_empty() {
            return None;
        }

        let legacy = json::string(value, "reading");
        let (legacy_furigana, legacy_romaji) = split_legacy_reading(&legacy);
        let furigana = or_else(json::string(value, "furigana"), || {
            or_else(json::string(value, "hiragana"), || legacy_furigana.clone())
        });
        let romaji = or_else(json::string(value, "romaji"), || legacy_romaji.clone());

        let tags = json::string_list(value, "tags");
        let lesson = json::opt_u32(value, "lesson").or_else(|| text::lesson_from_tags(&tags));

        Some(CardDraft {
            id: json::opt_string(value, "id"),
            front,
            back,
            furigana: furigana.unwrap_or_default(),
            romaji: romaji.unwrap_or_default(),
            tags,
            lesson,
        })
    }

    /// Bài hiệu dụng của nháp: ưu tiên trường `lesson`, thiếu thì suy từ tag
    /// ("bài 3", "lesson 7"… — xem `text::lesson_from_tags`).
    ///
    /// Mọi đường áp nháp (`Card::make`, `Card::apply_draft`, `content::apply_content`)
    /// dùng CHUNG quy tắc này. Nếu lệch nhau, cùng một gói nội dung cho kết quả
    /// khác nhau tùy thẻ đã có trong thư viện hay chưa — thẻ mới nhận bài từ tag
    /// còn thẻ đã có bị ghi đè thành không bài.
    pub fn resolved_lesson(&self) -> Option<u32> {
        self.lesson.or_else(|| text::lesson_from_tags(&self.tags))
    }
}

impl Card {
    /// Chuẩn hoá một bản ghi thô về schema hiện tại. Đọc được cả bản ghi cũ
    /// (chỉ có `reading`) mà không mất dữ liệu. Lỗi khi thiếu id/mặt nội dung.
    pub fn from_json(value: &Value, fallback_time: i64) -> CoreResult<Card> {
        if !value.is_object() {
            return Err(CoreError::invalid_record("Bản ghi thẻ không phải đối tượng JSON"));
        }

        let id = json::string(value, "id");
        let front = json::string(value, "front");
        let back = json::string(value, "back");
        if id.is_empty() || front.is_empty() || back.is_empty() {
            return Err(
                CoreError::invalid_record("Thẻ thiếu id, mặt trước hoặc mặt sau")
                    .detail(format!("id={id:?}")),
            );
        }

        let legacy = json::string(value, "reading");
        let (legacy_furigana, legacy_romaji) = split_legacy_reading(&legacy);

        let deck_id = or_else(json::string(value, "deckId"), || {
            Some(DEFAULT_DECK_ID.to_string())
        })
        .unwrap();

        let tags = json::string_list(value, "tags");
        let lesson = json::opt_u32(value, "lesson").or_else(|| text::lesson_from_tags(&tags));

        let srs_value = value.get("srs").cloned().unwrap_or(Value::Null);
        let srs = if srs_value.is_object() {
            SrsState::from_json(&srs_value, fallback_time)
        } else {
            SrsState::new(fallback_time)
        };

        Ok(Card {
            id,
            deck_id,
            front,
            back,
            furigana: or_else(json::string(value, "furigana"), || legacy_furigana)
                .unwrap_or_default(),
            romaji: or_else(json::string(value, "romaji"), || legacy_romaji).unwrap_or_default(),
            tags,
            lesson,
            created_at: json::i64_or(value, "createdAt", fallback_time),
            srs,
        })
    }

    /// Tạo thẻ mới từ nháp.
    ///
    /// Danh tính ưu tiên `draft.id` (thẻ do nhà phát hành đặt — ổn định qua các
    /// lần cập nhật). Nháp không có id thì dùng `fallback_id`, do lớp nền tảng
    /// sinh bằng `crypto.randomUUID()` — Rust không tự sinh id.
    pub fn make(draft: &CardDraft, fallback_id: impl Into<String>, deck_id: &str, now: i64) -> Card {
        let tags = draft.tags.clone();
        let lesson = draft.resolved_lesson();
        Card {
            id: draft.id.clone().unwrap_or_else(|| fallback_id.into()),
            deck_id: deck_id.to_string(),
            front: draft.front.trim().to_string(),
            back: draft.back.trim().to_string(),
            furigana: draft.furigana.trim().to_string(),
            romaji: draft.romaji.trim().to_string(),
            tags,
            lesson,
            created_at: now,
            srs: SrsState::new(now),
        }
    }

    /// Áp nội dung đã sửa vào thẻ, GIỮ NGUYÊN id, bộ, lịch SRS và thời điểm tạo.
    pub fn apply_draft(&self, draft: &CardDraft) -> Card {
        let tags = draft.tags.clone();
        let lesson = draft.resolved_lesson();
        Card {
            id: self.id.clone(),
            deck_id: self.deck_id.clone(),
            front: draft.front.trim().to_string(),
            back: draft.back.trim().to_string(),
            furigana: draft.furigana.trim().to_string(),
            romaji: draft.romaji.trim().to_string(),
            tags,
            lesson,
            created_at: self.created_at,
            srs: self.srs.clone(),
        }
    }

    /// Ghi dấu kết quả chế độ Làm bài, không đổi lịch SRS.
    pub fn with_quiz_result(&self, correct: bool, now: i64) -> Card {
        Card {
            srs: self.srs.with_quiz_result(correct, now),
            ..self.clone()
        }
    }

    /// Ghi dấu một lần trả lời kèm điểm của lần đó, không đổi lịch SRS.
    pub fn with_attempt(&self, correct: bool, score: f64, now: i64) -> Card {
        Card {
            srs: self.srs.with_attempt(correct, score, now),
            ..self.clone()
        }
    }

    pub fn key(&self) -> String {
        dedupe_key(&self.front, &self.back)
    }

    pub fn draft(&self) -> CardDraft {
        CardDraft {
            id: Some(self.id.clone()),
            front: self.front.clone(),
            back: self.back.clone(),
            furigana: self.furigana.clone(),
            romaji: self.romaji.clone(),
            tags: self.tags.clone(),
            lesson: self.lesson,
        }
    }
}

fn or_else(value: String, fallback: impl FnOnce() -> Option<String>) -> Option<String> {
    if value.is_empty() {
        fallback()
    } else {
        Some(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const T0: i64 = 1_700_000_000_000;

    #[test]
    fn reads_a_modern_record_unchanged() {
        let raw = json!({
            "id": "c1", "deckId": "patterns", "front": "Xin chào", "back": "こんにちは",
            "furigana": "こんにちは", "romaji": "konnichiwa", "tags": ["bài 1"],
            "createdAt": T0, "srs": { "ease": 2.5, "interval": 1, "repetitions": 1, "lapses": 0, "due": T0 }
        });
        let card = Card::from_json(&raw, T0).unwrap();
        assert_eq!(card.deck_id, "patterns");
        assert_eq!(card.lesson, Some(1));
        assert_eq!(card.romaji, "konnichiwa");
        assert_eq!(card.srs.interval, 1);
    }

    #[test]
    fn migrates_legacy_reading_by_script() {
        let kana = json!({ "id": "c1", "front": "a", "back": "b", "reading": "こんにちは" });
        let card = Card::from_json(&kana, T0).unwrap();
        assert_eq!(card.furigana, "こんにちは");
        assert_eq!(card.romaji, "");

        let latin = json!({ "id": "c2", "front": "a", "back": "b", "reading": "konnichiwa" });
        let card = Card::from_json(&latin, T0).unwrap();
        assert_eq!(card.romaji, "konnichiwa");
        assert_eq!(card.furigana, "");

        // Hiragana lẫn romaji ⇒ coi là romaji (không phải "kana thuần")
        let mixed = json!({ "id": "c3", "front": "a", "back": "b", "reading": "こんにちは konnichiwa" });
        let card = Card::from_json(&mixed, T0).unwrap();
        assert_eq!(card.romaji, "こんにちは konnichiwa");
        assert_eq!(card.furigana, "");
    }

    #[test]
    fn explicit_fields_win_over_legacy() {
        let raw = json!({
            "id": "c1", "front": "a", "back": "b",
            "furigana": "かな", "romaji": "kana", "reading": "legacy"
        });
        let card = Card::from_json(&raw, T0).unwrap();
        assert_eq!(card.furigana, "かな");
        assert_eq!(card.romaji, "kana");
    }

    #[test]
    fn rejects_records_missing_required_content() {
        assert!(Card::from_json(&json!({ "front": "a", "back": "b" }), T0).is_err());
        assert!(Card::from_json(&json!({ "id": "c", "back": "b" }), T0).is_err());
        assert!(Card::from_json(&json!("not an object"), T0).is_err());
        assert!(Card::from_json(&json!({ "id": "c", "front": "a", "back": "b" }), T0).is_ok());
    }

    #[test]
    fn defaults_are_applied_to_sparse_records() {
        let raw = json!({ "id": "c", "front": "a", "back": "b" });
        let card = Card::from_json(&raw, T0).unwrap();
        assert_eq!(card.deck_id, DEFAULT_DECK_ID);
        assert_eq!(card.created_at, T0);
        assert!(card.srs.is_new());
        assert_eq!(card.lesson, None);
    }

    #[test]
    fn lesson_comes_from_tags_when_not_declared() {
        let raw = json!({ "id": "c", "front": "a", "back": "b", "tags": ["bài 4"] });
        assert_eq!(Card::from_json(&raw, T0).unwrap().lesson, Some(4));
        let explicit = json!({ "id": "c", "front": "a", "back": "b", "tags": ["bài 4"], "lesson": 9 });
        assert_eq!(Card::from_json(&explicit, T0).unwrap().lesson, Some(9));
    }

    #[test]
    fn draft_reads_flexible_headers() {
        let tnai = json!({ "vietnamese": "Xin chào", "kanji": "こんにちは", "hiragana": "こんにちは", "romaji": "konnichiwa", "lesson": 2 });
        let d = CardDraft::from_json(&tnai, Quiz::Meaning).unwrap();
        assert_eq!(d.front, "Xin chào");
        assert_eq!(d.back, "こんにちは");
        assert_eq!(d.furigana, "こんにちは");
        assert_eq!(d.romaji, "konnichiwa");
        assert_eq!(d.lesson, Some(2));

        // reading: mặt hỏi là Kanji, mặt đáp án là tiếng Việt
        let d = CardDraft::from_json(&tnai, Quiz::Reading).unwrap();
        assert_eq!(d.front, "こんにちは");
        assert_eq!(d.back, "Xin chào");
    }

    #[test]
    fn draft_requires_both_faces() {
        assert!(CardDraft::from_json(&json!({ "front": "a" }), Quiz::Meaning).is_none());
        assert!(CardDraft::from_json(&json!({ "back": "b" }), Quiz::Meaning).is_none());
    }

    #[test]
    fn make_and_apply_draft_preserve_identity_and_schedule() {
        let draft = CardDraft {
            id: None,
            front: " xin chào ".into(),
            back: " こんにちは ".into(),
            furigana: String::new(),
            romaji: "konnichiwa".into(),
            tags: vec!["bài 7".into()],
            lesson: None,
        };
        let card = Card::make(&draft, "id-1", "vocabulary", T0);
        assert_eq!(card.id, "id-1");
        assert_eq!(card.front, "xin chào");
        assert_eq!(card.lesson, Some(7));
        assert!(card.srs.is_new());

        let learned = Card {
            srs: card.srs.schedule(crate::srs::Rating::Good, T0),
            ..card.clone()
        };
        let edited = learned.apply_draft(&CardDraft {
            back: "さようなら".into(),
            ..draft.clone()
        });
        assert_eq!(edited.id, "id-1");
        assert_eq!(edited.deck_id, "vocabulary");
        assert_eq!(edited.created_at, T0);
        assert_eq!(edited.srs, learned.srs); // lịch học không bị sửa nội dung làm mất
        assert_eq!(edited.back, "さようなら");
    }

    #[test]
    fn quiz_result_only_touches_learning_marks() {
        let raw = json!({ "id": "c", "front": "a", "back": "b" });
        let card = Card::from_json(&raw, T0).unwrap();
        let wrong = card.with_quiz_result(false, T0 + 10);
        assert_eq!(wrong.srs.last_wrong_at, Some(T0 + 10));
        assert_eq!(wrong.srs.due, card.srs.due);
        assert_eq!(wrong.srs.interval, card.srs.interval);
        let right = wrong.with_quiz_result(true, T0 + 20);
        assert_eq!(right.srs.last_wrong_at, None);
    }

    #[test]
    fn attempt_records_a_score_and_leaves_the_schedule_alone() {
        let raw = json!({ "id": "c", "front": "a", "back": "b" });
        let card = Card::from_json(&raw, T0).unwrap();
        let marked = card.with_attempt(false, 0.5, T0 + 10);
        assert_eq!(marked.srs.last_score, Some(0.5));
        assert_eq!(marked.srs.last_wrong_at, Some(T0 + 10));
        assert_eq!(marked.srs.interval, card.srs.interval);
        assert_eq!(marked.srs.due, card.srs.due);
        assert_eq!(marked.srs.mastery(), card.srs.mastery());
    }

    #[test]
    fn dedupe_key_ignores_surrounding_space() {
        assert_eq!(dedupe_key(" a ", "b "), dedupe_key("a", "b"));
        assert_ne!(dedupe_key("a", "b"), dedupe_key("b", "a"));
    }

    #[test]
    fn draft_id_takes_priority_over_the_generated_id() {
        let sourced = CardDraft {
            id: Some("vocabulary::xin-chao".into()),
            front: "Xin chào".into(),
            back: "こんにちは".into(),
            furigana: String::new(),
            romaji: String::new(),
            tags: Vec::new(),
            lesson: None,
        };
        let card = Card::make(&sourced, "uuid-sẽ-bị-bỏ-qua", "vocabulary", T0);
        assert_eq!(card.id, "vocabulary::xin-chao");

        let unsourced = CardDraft {
            id: None,
            ..sourced.clone()
        };
        let card = Card::make(&unsourced, "uuid-1", "vocabulary", T0);
        assert_eq!(card.id, "uuid-1");
    }

    #[test]
    fn draft_round_trip_keeps_the_id() {
        let raw = json!({ "id": "c1", "front": "a", "back": "b" });
        let card = Card::from_json(&raw, T0).unwrap();
        let draft = card.draft();
        assert_eq!(draft.id.as_deref(), Some("c1"));
        let text = serde_json::to_string(&draft).unwrap();
        let back: CardDraft = serde_json::from_str(&text).unwrap();
        assert_eq!(back, draft);
    }

    #[test]
    fn draft_id_is_optional_in_json() {
        let draft: CardDraft =
            serde_json::from_str(r#"{"front":"a","back":"b"}"#).unwrap();
        assert_eq!(draft.id, None);
        assert_eq!(serde_json::to_string(&draft).unwrap(), r#"{"front":"a","back":"b","furigana":"","romaji":"","tags":[]}"#);
    }
}
