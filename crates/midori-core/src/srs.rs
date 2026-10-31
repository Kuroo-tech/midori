//! Lịch ôn tập SM-2 — logic thuần, không side-effect, không phụ thuộc nền tảng.
//!
//! Giữ nguyên hành vi của Mitsuha (`src/lib/srs.ts`) vì dữ liệu SRS đã lưu trong
//! IndexedDB phải tiếp tục được diễn giải y như trước. Hai điểm tinh tế được
//! khoá bằng test:
//!   1. `interval` mới được tính bằng `ease` CŨ, `ease` chỉ cập nhật sau đó.
//!   2. `ease` được làm tròn 2 chữ số thập phân.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::CoreError;
use crate::json;

/// Hệ số dễ tối thiểu (chặn dưới của SM-2).
pub const MIN_EASE: f64 = 1.3;
/// Hệ số dễ mặc định cho thẻ mới.
pub const DEFAULT_EASE: f64 = 2.5;
/// Một ngày, đơn vị mili-giây.
pub const DAY_MS: i64 = 86_400_000;
/// Ngưỡng "thẻ chín" theo Anki.
pub const MATURE_INTERVAL_DAYS: u32 = 21;
/// Số ngày mà tại đó độ thành thạo đạt 0.5 (khi chưa quên lần nào).
pub const MASTERY_HALF_AT_DAYS: f64 = 21.0;
/// Ngưỡng được coi là "đã thành thạo" trong các bản tổng hợp.
pub const MASTERED_AT: f64 = 0.5;

/// Bốn mức đánh giá của người học.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Rating {
    Again,
    Hard,
    Good,
    Easy,
}

impl Rating {
    pub const ALL: [Rating; 4] = [Rating::Again, Rating::Hard, Rating::Good, Rating::Easy];

    pub fn parse(value: &str) -> Result<Self, CoreError> {
        match value {
            "again" => Ok(Rating::Again),
            "hard" => Ok(Rating::Hard),
            "good" => Ok(Rating::Good),
            "easy" => Ok(Rating::Easy),
            _ => Err(CoreError::invalid_argument("rating")),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Rating::Again => "again",
            Rating::Hard => "hard",
            Rating::Good => "good",
            Rating::Easy => "easy",
        }
    }

    /// Chất lượng `q` của SM-2 (0–5).
    pub fn quality(self) -> u32 {
        match self {
            Rating::Again => 1,
            Rating::Hard => 3,
            Rating::Good => 4,
            Rating::Easy => 5,
        }
    }
}

/// Lý do một thẻ bị coi là "chưa thuộc".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WeakReason {
    /// Mức đánh giá SRS gần nhất là Again/Hard.
    Rating,
    /// Từng làm sai ở chế độ Làm bài.
    Quiz,
}

/// Trạng thái ôn tập của một thẻ.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SrsState {
    pub ease: f64,
    /// Số ngày tới lần ôn sau.
    pub interval: u32,
    /// Số lần liên tiếp nhớ đúng.
    pub repetitions: u32,
    /// Số lần quên.
    pub lapses: u32,
    /// Thời điểm tới hạn ôn (ms kể từ epoch).
    pub due: i64,
    /// Mức đánh giá gần nhất trong phiên SRS — bộ lọc "Chưa thuộc" dùng.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_rating: Option<Rating>,
    /// Thời điểm làm sai gần nhất ở chế độ Làm bài. Chưa sai = không có.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_wrong_at: Option<i64>,
    /// Điểm của lần trả lời gần nhất ở chế độ Làm bài (0.0–1.0).
    ///
    /// Trường MỚI, có `default`: bản ghi cũ không có nó vẫn đọc được nguyên vẹn
    /// và `last_wrong_at` giữ nguyên ý nghĩa cũ. Nhờ vậy không cần di trú dữ
    /// liệu, và điểm cũ không bị diễn giải lại theo thuật toán mới.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_score: Option<f64>,
}

impl SrsState {
    /// Thẻ mới: chưa học lần nào, tới hạn ngay.
    pub fn new(now: i64) -> Self {
        Self {
            ease: DEFAULT_EASE,
            interval: 0,
            repetitions: 0,
            lapses: 0,
            due: now,
            last_rating: None,
            last_wrong_at: None,
            last_score: None,
        }
    }

    /// Đọc khoan dung từ JSON: thiếu/sai kiểu ⇒ mặc định, không làm hỏng thẻ.
    pub fn from_json(value: &Value, default_due: i64) -> Self {
        let ease = json::f64_or(value, "ease", DEFAULT_EASE);
        let last_rating = value
            .get("lastRating")
            .and_then(Value::as_str)
            .and_then(|s| Rating::parse(s).ok());
        let last_wrong_at = match value.get("lastWrongAt").and_then(Value::as_f64) {
            Some(t) if t > 0.0 && t.is_finite() => Some(t.round() as i64),
            _ => None,
        };
        // Điểm ngoài khoảng [0,1] hoặc không hữu hạn bị coi là không có: dữ liệu
        // lạ không được kéo lệch bất kỳ bản tổng hợp nào.
        let last_score = match value.get("lastScore").and_then(Value::as_f64) {
            Some(score) if score.is_finite() && (0.0..=1.0).contains(&score) => Some(score),
            _ => None,
        };

        Self {
            ease: if ease.is_finite() && ease > 0.0 {
                ease
            } else {
                DEFAULT_EASE
            },
            interval: json::u32_or(value, "interval", 0),
            repetitions: json::u32_or(value, "repetitions", 0),
            lapses: json::u32_or(value, "lapses", 0),
            due: json::i64_or(value, "due", default_due),
            last_rating,
            last_wrong_at,
            last_score,
        }
    }

    /// Trả về lịch mới sau khi người học chấm điểm.
    pub fn schedule(&self, rating: Rating, now: i64) -> Self {
        let q = rating.quality();
        let mut ease = self.ease;
        let mut interval = self.interval;
        let mut repetitions = self.repetitions;
        let mut lapses = self.lapses;

        if q < 3 {
            // Quên — học lại từ đầu.
            repetitions = 0;
            lapses += 1;
            interval = 0;
        } else {
            repetitions += 1;
            interval = match repetitions {
                1 => 1,
                2 => 6,
                // `ease` ở đây vẫn là giá trị CŨ (SM-2 cập nhật ease sau).
                _ => ((interval as f64 * ease).round() as i64).max(1) as u32,
            };
        }

        let q = q as f64;
        ease = (ease + 0.1 - (5.0 - q) * (0.08 + (5.0 - q) * 0.02)).max(MIN_EASE);
        ease = (ease * 100.0).round() / 100.0;

        Self {
            ease,
            interval,
            repetitions,
            lapses,
            due: now + interval as i64 * DAY_MS,
            last_rating: Some(rating),
            // Hai dấu vết của chế độ Làm bài không bị phiên SRS xoá: chúng mô tả
            // một kênh tín hiệu KHÁC với lịch ôn.
            last_wrong_at: self.last_wrong_at,
            last_score: self.last_score,
        }
    }

    /// Độ thành thạo dài hạn, 0.0–1.0 — suy từ CHÍNH LỊCH ÔN, không từ một lần
    /// trả lời.
    ///
    /// Công thức được chọn để giải thích được bằng lời và không có hàm siêu việt
    /// (kết quả không phụ thuộc thư viện toán của nền tảng):
    ///
    /// ```text
    /// nền tảng = khoảng_ôn / (khoảng_ôn + 21)      // 0 ngày ⇒ 0, 21 ngày ⇒ 0.5
    /// phạt     = 1 - 0.5 * số_lần_quên / (số_lần_quên + 3)
    /// mastery  = nền tảng * phạt
    /// ```
    ///
    /// Vì sao KHÔNG dùng tốc độ trả lời hay một lần làm bài: một lần trả lời đúng
    /// nhanh không chứng minh đã nhớ dài hạn, còn một lần gõ nhầm không xoá đi
    /// khoảng ôn đã tích luỹ. Hai đại lượng đó được báo riêng (xem `stats`), và ở
    /// đây chỉ lịch ôn được dùng.
    pub fn mastery(&self) -> f64 {
        let interval = self.interval as f64;
        let base = interval / (interval + MASTERY_HALF_AT_DAYS);
        let lapses = self.lapses as f64;
        let penalty = 1.0 - 0.5 * (lapses / (lapses + 3.0));
        round4(base * penalty)
    }

    /// Đã đạt ngưỡng thành thạo chưa.
    pub fn is_mastered(&self) -> bool {
        self.mastery() >= MASTERED_AT
    }

    pub fn is_due(&self, now: i64) -> bool {
        self.due <= now
    }

    pub fn is_new(&self) -> bool {
        self.repetitions == 0 && self.lapses == 0
    }

    pub fn is_mature(&self) -> bool {
        self.interval >= MATURE_INTERVAL_DAYS
    }

    /// Thẻ đã đi qua ít nhất một lần học nhưng chưa "chín".
    pub fn is_learning(&self) -> bool {
        !self.is_new() && !self.is_mature()
    }

    /// Lý do "chưa thuộc" dựa trên dữ liệu học tập THẬT, không suy đoán.
    pub fn weak_reason(&self) -> Option<WeakReason> {
        match self.last_rating {
            Some(Rating::Again) | Some(Rating::Hard) => return Some(WeakReason::Rating),
            _ => {}
        }
        if self.last_wrong_at.is_some() {
            return Some(WeakReason::Quiz);
        }
        None
    }

    pub fn is_weak(&self) -> bool {
        self.weak_reason().is_some()
    }

    /// Ghi dấu kết quả chế độ Làm bài. Chỉ đụng dấu vết học tập, không đổi lịch SRS.
    pub fn with_quiz_result(&self, correct: bool, now: i64) -> Self {
        self.with_attempt(correct, if correct { 1.0 } else { 0.0 }, now)
    }

    /// Ghi dấu MỘT lần trả lời ở chế độ Làm bài, kèm điểm của lần đó.
    ///
    /// Lịch SRS không đổi: đây là kênh tín hiệu thứ hai, độc lập với việc tự chấm
    /// `Again/Hard/Good/Easy`. Điểm được kẹp về [0,1] và làm tròn 4 chữ số để dữ
    /// liệu lưu xuống đĩa ổn định giữa các lần ghi.
    pub fn with_attempt(&self, correct: bool, score: f64, now: i64) -> Self {
        let mut next = self.clone();
        next.last_wrong_at = if correct { None } else { Some(now) };
        next.last_score = Some(round4(score.clamp(0.0, 1.0)));
        next
    }
}

/// Làm tròn 4 chữ số thập phân — đủ mịn cho điểm 0–1, đủ thô để JSON ổn định.
fn round4(value: f64) -> f64 {
    if !value.is_finite() {
        return 0.0;
    }
    (value * 10_000.0).round() / 10_000.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const T0: i64 = 1_700_000_000_000;

    #[test]
    fn new_card_is_due_now_and_has_defaults() {
        let s = SrsState::new(T0);
        assert_eq!(s.ease, DEFAULT_EASE);
        assert_eq!(s.interval, 0);
        assert!(s.is_new());
        assert!(!s.is_mature());
        assert!(s.is_due(T0));
        assert_eq!(s.weak_reason(), None);
    }

    #[test]
    fn interval_ladder_is_1_then_6_then_ease_scaled() {
        let s = SrsState::new(T0);
        let s = s.schedule(Rating::Good, T0);
        assert_eq!(s.interval, 1);
        assert_eq!(s.due, T0 + DAY_MS);

        let s = s.schedule(Rating::Good, T0);
        assert_eq!(s.interval, 6);

        // Bước 3 dùng ease CŨ: ease sau bước 1 và 2 là 2.5 (Good ⇒ q=4 ⇒ delta 0)
        let s = s.schedule(Rating::Good, T0);
        assert_eq!(s.ease, 2.5);
        assert_eq!(s.interval, 15); // round(6 * 2.5)
        assert_eq!(s.repetitions, 3);
    }

    #[test]
    fn ease_is_updated_after_interval_is_computed() {
        // Hard ⇒ q=3 ⇒ ease giảm; interval bước 3 phải dùng ease TRƯỚC khi giảm.
        let s = SrsState::new(T0);
        let s = s.schedule(Rating::Hard, T0); // ease 2.5 -> 2.36, interval 1
        let s = s.schedule(Rating::Hard, T0); // ease 2.36 -> 2.22, interval 6
        assert_eq!(s.ease, 2.22);
        let s = s.schedule(Rating::Hard, T0);
        // 6 * 2.22 (ease cũ) = 13.32 -> 13, KHÔNG phải 6 * 2.08 (ease mới)
        assert_eq!(s.interval, 13);
    }

    #[test]
    fn again_resets_progress_and_counts_a_lapse() {
        let s = SrsState::new(T0).schedule(Rating::Good, T0).schedule(Rating::Good, T0);
        let forgotten = s.schedule(Rating::Again, T0);
        assert_eq!(forgotten.repetitions, 0);
        assert_eq!(forgotten.interval, 0);
        assert_eq!(forgotten.due, T0);
        assert_eq!(forgotten.lapses, 1);
        assert!(!forgotten.is_new()); // đã từng học
        assert_eq!(forgotten.weak_reason(), Some(WeakReason::Rating));
    }

    #[test]
    fn ease_never_drops_below_minimum() {
        let mut s = SrsState::new(T0);
        for _ in 0..40 {
            s = s.schedule(Rating::Again, T0);
        }
        assert_eq!(s.ease, MIN_EASE);
    }

    #[test]
    fn ease_is_rounded_to_two_decimals() {
        let s = SrsState::new(T0).schedule(Rating::Hard, T0);
        assert_eq!(s.ease, 2.36); // 2.5 - 0.14
        let s = s.schedule(Rating::Easy, T0);
        assert_eq!(s.ease, 2.46); // 2.36 + 0.1
    }

    #[test]
    fn mature_threshold_follows_anki() {
        let s = SrsState {
            interval: 20,
            repetitions: 5,
            ..SrsState::new(T0)
        };
        assert!(!s.is_mature());
        assert!(s.is_learning());
        let s = SrsState { interval: 21, ..s };
        assert!(s.is_mature());
        assert!(!s.is_learning());
    }

    #[test]
    fn weak_reason_prefers_rating_then_quiz_marker() {
        let mut s = SrsState::new(T0);
        s.last_rating = Some(Rating::Easy);
        assert_eq!(s.weak_reason(), None);
        s = s.with_quiz_result(false, T0);
        assert_eq!(s.weak_reason(), Some(WeakReason::Quiz));
        s = s.schedule(Rating::Hard, T0);
        assert_eq!(s.weak_reason(), Some(WeakReason::Rating));
        // Trả lời đúng trở lại thì xoá dấu quiz, nhưng 'hard' vẫn giữ
        s = s.with_quiz_result(true, T0);
        assert_eq!(s.last_wrong_at, None);
        assert_eq!(s.weak_reason(), Some(WeakReason::Rating));
    }

    #[test]
    fn srs_round_trip_keeps_optional_marks() {
        let s = SrsState::new(T0)
            .schedule(Rating::Again, T0)
            .with_quiz_result(false, T0 + 5);
        let text = serde_json::to_string(&s).unwrap();
        let back: SrsState = serde_json::from_str(&text).unwrap();
        assert_eq!(s, back);
        assert_eq!(back.last_rating, Some(Rating::Again));
        assert_eq!(back.last_wrong_at, Some(T0 + 5));
    }

    #[test]
    fn from_json_is_tolerant_of_legacy_records() {
        // Bản ghi cũ: thiếu hết, chỉ có ease/interval
        let v = json!({ "ease": 2.1, "interval": 6 });
        let s = SrsState::from_json(&v, T0);
        assert_eq!(s.ease, 2.1);
        assert_eq!(s.interval, 6);
        assert_eq!(s.due, T0);
        assert_eq!(s.last_rating, None);

        // Sai kiểu / giá trị rác không được làm hỏng bản ghi
        let junk = json!({ "ease": "abc", "interval": -3, "due": "x", "lastRating": "nope", "lastWrongAt": -1 });
        let s = SrsState::from_json(&junk, T0);
        assert_eq!(s.ease, DEFAULT_EASE);
        assert_eq!(s.interval, 0);
        assert_eq!(s.due, T0);
        assert_eq!(s.last_rating, None);
        assert_eq!(s.last_wrong_at, None);
    }

    #[test]
    fn rating_parse_rejects_unknown_values() {
        assert_eq!(Rating::parse("good").unwrap(), Rating::Good);
        assert!(Rating::parse("Good").is_err());
        assert!(Rating::parse("").is_err());
    }

    // ── Độ thành thạo ────────────────────────────────────────────────────

    #[test]
    fn mastery_starts_at_zero_and_reaches_half_at_the_half_point() {
        let fresh = SrsState::new(T0);
        assert_eq!(fresh.mastery(), 0.0);
        assert!(!fresh.is_mastered());

        let half = SrsState {
            interval: 21,
            ..fresh.clone()
        };
        assert_eq!(half.mastery(), 0.5);
        assert!(half.is_mastered());
    }

    #[test]
    fn mastery_rises_with_interval_and_penalises_lapses() {
        let base = SrsState {
            interval: 60,
            repetitions: 4,
            ..SrsState::new(T0)
        };
        let clean = base.mastery();
        assert!(clean > 0.7 && clean < 1.0, "{clean}");

        let lapsed = SrsState {
            lapses: 3,
            ..base.clone()
        };
        assert!(lapsed.mastery() < clean);
        // Cùng khoảng ôn, càng nhiều lần quên càng thấp — nhưng không bao giờ âm.
        let many = SrsState {
            lapses: 100,
            ..base
        };
        assert!(many.mastery() > 0.0);
        assert!(many.mastery() < lapsed.mastery());
    }

    #[test]
    fn mastery_is_monotonic_in_interval() {
        let mut previous = -1.0;
        for interval in [0u32, 1, 6, 15, 21, 40, 100, 365] {
            let value = SrsState {
                interval,
                ..SrsState::new(T0)
            }
            .mastery();
            assert!(value > previous, "interval {interval}: {value} vs {previous}");
            previous = value;
        }
    }

    #[test]
    fn mastery_ignores_a_single_quiz_attempt() {
        // Một lần trả lời đúng không được làm tăng độ thành thạo dài hạn.
        let fresh = SrsState::new(T0);
        let after_quiz = fresh.with_attempt(true, 1.0, T0 + 1);
        assert_eq!(after_quiz.mastery(), fresh.mastery());
        assert_eq!(after_quiz.interval, fresh.interval);
        assert_eq!(after_quiz.due, fresh.due);
    }

    // ── Điểm lần trả lời ────────────────────────────────────────────────

    #[test]
    fn attempt_records_score_without_touching_the_schedule() {
        let learned = SrsState::new(T0).schedule(Rating::Good, T0);
        let near = learned.with_attempt(false, 0.5, T0 + 50);
        assert_eq!(near.last_score, Some(0.5));
        assert_eq!(near.last_wrong_at, Some(T0 + 50));
        assert_eq!(near.interval, learned.interval);
        assert_eq!(near.due, learned.due);
        assert_eq!(near.ease, learned.ease);

        let right = near.with_attempt(true, 0.9, T0 + 60);
        assert_eq!(right.last_score, Some(0.9));
        assert_eq!(right.last_wrong_at, None);
    }

    #[test]
    fn quiz_result_keeps_the_legacy_scoring() {
        let s = SrsState::new(T0).with_quiz_result(false, T0 + 1);
        assert_eq!(s.last_score, Some(0.0));
        let s = s.with_quiz_result(true, T0 + 2);
        assert_eq!(s.last_score, Some(1.0));
    }

    #[test]
    fn scores_outside_the_range_are_clamped_not_stored() {
        let s = SrsState::new(T0);
        assert_eq!(s.with_attempt(true, 1.7, T0).last_score, Some(1.0));
        assert_eq!(s.with_attempt(false, -3.0, T0).last_score, Some(0.0));
        assert_eq!(s.with_attempt(true, f64::NAN, T0).last_score, Some(0.0));
    }

    #[test]
    fn last_score_survives_scheduling() {
        let s = SrsState::new(T0)
            .with_attempt(false, 0.5, T0)
            .schedule(Rating::Good, T0);
        assert_eq!(s.last_score, Some(0.5));
    }

    #[test]
    fn legacy_records_have_no_score_without_being_rewritten() {
        // Bản ghi cũ chưa từng có `lastScore`: đọc ra `None`, và các trường cũ
        // giữ nguyên nghĩa. Đây là toàn bộ chiến lược tương thích của trường mới.
        let legacy = json!({
            "ease": 2.36, "interval": 6, "repetitions": 2, "lapses": 1,
            "due": T0, "lastRating": "hard", "lastWrongAt": T0
        });
        let s = SrsState::from_json(&legacy, T0);
        assert_eq!(s.last_score, None);
        assert_eq!(s.last_wrong_at, Some(T0));
        assert_eq!(s.last_rating, Some(Rating::Hard));
        // Ghi lại bản ghi đó KHÔNG sinh thêm trường nào.
        let text = serde_json::to_string(&s).unwrap();
        assert!(!text.contains("lastScore"), "{text}");
    }

    #[test]
    fn a_corrupt_score_is_treated_as_absent() {
        for bad in ["\"x\"", "-0.5", "2", "null"] {
            let raw: Value = serde_json::from_str(&format!("{{\"lastScore\":{bad}}}")).unwrap();
            assert_eq!(SrsState::from_json(&raw, T0).last_score, None, "raw: {bad}");
        }
    }
}
