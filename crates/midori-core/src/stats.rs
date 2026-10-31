//! Tổng hợp thống kê, lọc/tìm kiếm thẻ, và tóm tắt 50 bài Minna.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::card::{Card, Quiz};
use crate::srs::WeakReason;
use crate::text::{LESSON_MAX, LESSON_MIN};

/// Số bài Minna no Nihongo được dựng khung.
pub const LESSON_COUNT: u32 = LESSON_MAX;

// ── Thống kê ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckCount {
    pub total: u32,
    #[serde(rename = "new")]
    pub new_cards: u32,
    pub due: u32,
    pub learning: u32,
    pub mature: u32,
    pub weak: u32,
    /// Trong `weak`: thẻ yếu vì lần tự chấm gần nhất là Again/Hard.
    pub weak_rating: u32,
    /// Trong `weak`: thẻ yếu vì làm sai ở chế độ Làm bài.
    pub weak_quiz: u32,
    /// Trung bình độ thành thạo dài hạn của các thẻ, 0.0–1.0.
    pub mastery: f64,
    /// Số thẻ đã đạt ngưỡng thành thạo.
    pub mastered: u32,
    /// Trung bình điểm của lần làm bài gần nhất, trên các thẻ ĐÃ làm bài.
    pub accuracy: f64,
    /// Số thẻ đã từng làm bài (mẫu số của `accuracy`). `0` nghĩa là chưa có
    /// dữ liệu — khi đó `accuracy` bằng 0 nhưng không có nghĩa là "kém".
    pub graded: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckStats {
    pub total: u32,
    #[serde(rename = "new")]
    pub new_cards: u32,
    pub due: u32,
    pub learning: u32,
    pub mature: u32,
    pub weak: u32,
    /// Trong `weak`: thẻ yếu vì tự chấm Again/Hard.
    pub weak_rating: u32,
    /// Trong `weak`: thẻ yếu vì làm sai bài kiểm tra.
    pub weak_quiz: u32,
    pub quizzable: u32,
    pub mastery: f64,
    pub mastered: u32,
    pub accuracy: f64,
    pub graded: u32,
    /// Thống kê theo từng bộ, sắp xếp theo tên bộ cho kết quả ổn định.
    pub by_deck: BTreeMap<String, DeckCount>,
}

/// Bộ đếm dùng chung cho cả tổng thể lẫn từng bộ.
///
/// Một nơi duy nhất định nghĩa "một thẻ thuộc nhóm nào" — trước đây vòng lặp
/// tổng thể và vòng lặp theo bộ viết lại cùng một chuỗi điều kiện, nên thêm một
/// nhóm mới phải sửa hai chỗ và rất dễ lệch.
#[derive(Default, Clone, Copy)]
struct Counters {
    total: u32,
    new_cards: u32,
    due: u32,
    learning: u32,
    mature: u32,
    weak: u32,
    weak_rating: u32,
    weak_quiz: u32,
    mastered: u32,
    graded: u32,
    mastery_sum: f64,
    score_sum: f64,
}

impl Counters {
    /// Phân loại MỘT thẻ vào các nhóm.
    ///
    /// `quizzable` không nằm ở đây: nó phụ thuộc chế độ hỏi của lõi chứ không
    /// thuộc trạng thái ôn của thẻ, nên được đếm riêng ở [`stats`] — nhờ vậy hàm
    /// này dùng chung được cho cả tổng thể, từng bộ, lẫn từng bài Minna.
    fn add(&mut self, card: &Card, now: i64) {
        self.total += 1;
        let mastery = card.srs.mastery();
        self.mastery_sum += mastery;
        if card.srs.is_mastered() {
            self.mastered += 1;
        }
        if let Some(score) = card.srs.last_score {
            self.graded += 1;
            self.score_sum += score;
        }
        if card.srs.is_due(now) {
            self.due += 1;
        }
        if card.srs.is_new() {
            self.new_cards += 1;
        }
        if card.srs.is_learning() {
            self.learning += 1;
        }
        if card.srs.is_mature() {
            self.mature += 1;
        }
        if let Some(reason) = card.srs.weak_reason() {
            self.weak += 1;
            match reason {
                WeakReason::Rating => self.weak_rating += 1,
                WeakReason::Quiz => self.weak_quiz += 1,
            }
        }
    }

    fn mastery(&self) -> f64 {
        if self.total == 0 {
            return 0.0;
        }
        round4(self.mastery_sum / f64::from(self.total))
    }

    fn accuracy(&self) -> f64 {
        if self.graded == 0 {
            return 0.0;
        }
        round4(self.score_sum / f64::from(self.graded))
    }

    fn into_count(self) -> DeckCount {
        DeckCount {
            total: self.total,
            new_cards: self.new_cards,
            due: self.due,
            learning: self.learning,
            mature: self.mature,
            weak: self.weak,
            weak_rating: self.weak_rating,
            weak_quiz: self.weak_quiz,
            mastery: self.mastery(),
            mastered: self.mastered,
            accuracy: self.accuracy(),
            graded: self.graded,
        }
    }
}

fn round4(value: f64) -> f64 {
    if !value.is_finite() {
        return 0.0;
    }
    (value * 10_000.0).round() / 10_000.0
}

pub fn stats(cards: &[Card], now: i64, quiz: Quiz) -> DeckStats {
    let mut all = Counters::default();
    let mut by_deck: BTreeMap<String, Counters> = BTreeMap::new();
    let mut quizzable: u32 = 0;

    for card in cards {
        all.add(card, now);
        by_deck
            .entry(card.deck_id.clone())
            .or_default()
            .add(card, now);
        if crate::quiz::is_quizzable(card, quiz) {
            quizzable += 1;
        }
    }

    DeckStats {
        total: all.total,
        new_cards: all.new_cards,
        due: all.due,
        learning: all.learning,
        mature: all.mature,
        weak: all.weak,
        weak_rating: all.weak_rating,
        weak_quiz: all.weak_quiz,
        quizzable,
        mastery: all.mastery(),
        mastered: all.mastered,
        accuracy: all.accuracy(),
        graded: all.graded,
        by_deck: by_deck
            .into_iter()
            .map(|(deck_id, counters)| (deck_id, counters.into_count()))
            .collect(),
    }
}

// ── Lọc / tìm kiếm ──────────────────────────────────────────────────────

/// Điều kiện lọc thẻ. Mọi trường đều tuỳ chọn; mặc định = không lọc.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CardFilter {
    /// Chỉ lấy thẻ thuộc các bộ này (rỗng/None = mọi bộ).
    pub deck_ids: Option<Vec<String>>,
    /// Chỉ lấy thẻ của một bài Minna.
    pub lesson: Option<u32>,
    /// Tìm trong front/back/furigana/romaji/tags, không phân biệt hoa thường.
    pub query: Option<String>,
    /// Chỉ lấy thẻ tới hạn ôn.
    pub due_only: bool,
    /// Chỉ lấy thẻ "chưa thuộc".
    pub weak_only: bool,
    /// Giới hạn số thẻ MỚI khi `due_only` bật (thẻ đã học không bị giới hạn).
    pub new_limit: Option<u32>,
}

impl CardFilter {
    pub fn matches(&self, card: &Card, now: i64) -> bool {
        if let Some(decks) = &self.deck_ids {
            if !decks.is_empty() && !decks.iter().any(|d| d == &card.deck_id) {
                return false;
            }
        }
        if let Some(lesson) = self.lesson {
            if card.lesson != Some(lesson) {
                return false;
            }
        }
        if self.due_only && !card.srs.is_due(now) {
            return false;
        }
        if self.weak_only && !card.srs.is_weak() {
            return false;
        }
        if let Some(query) = &self.query {
            let needle = query.trim().to_lowercase();
            if !needle.is_empty() && !matches_query(card, &needle) {
                return false;
            }
        }
        true
    }
}

fn matches_query(card: &Card, needle: &str) -> bool {
    let haystacks = [
        card.front.as_str(),
        card.back.as_str(),
        card.furigana.as_str(),
        card.romaji.as_str(),
    ];
    if haystacks
        .iter()
        .any(|h| h.to_lowercase().contains(needle))
    {
        return true;
    }
    card.tags.iter().any(|t| t.to_lowercase().contains(needle))
}

/// Trả về id của các thẻ khớp, GIỮ NGUYÊN thứ tự đầu vào.
///
/// Khi `due_only` + `new_limit`, chỉ `new_limit` thẻ mới đầu tiên được lấy —
/// đúng hành vi giới hạn thẻ mới mỗi ngày của bản gốc.
pub fn filter_ids(cards: &[Card], filter: &CardFilter, now: i64) -> Vec<String> {
    let mut out = Vec::new();
    let mut new_taken: u32 = 0;
    let limit = filter.new_limit.unwrap_or(u32::MAX);

    for card in cards {
        if !filter.matches(card, now) {
            continue;
        }
        if filter.due_only && filter.new_limit.is_some() && card.srs.is_new() {
            if new_taken >= limit {
                continue;
            }
            new_taken += 1;
        }
        out.push(card.id.clone());
    }
    out
}

// ── Tóm tắt bài Minna ───────────────────────────────────────────────────

/// Tóm tắt MỘT bài Minna.
///
/// Mang đủ các nhóm như [`DeckCount`] để màn Thống kê hiển thị tiến độ từng bài
/// mà không phải tự đếm ở lớp giao diện. `count` giữ nguyên tên cũ để bản ghi
/// và mã đã có không phải đổi; các trường còn lại là phần thêm vào.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonInfo {
    pub n: u32,
    pub label: String,
    /// Tổng số thẻ của bài.
    pub count: u32,
    pub due: u32,
    #[serde(rename = "new")]
    pub new_cards: u32,
    pub learning: u32,
    pub mature: u32,
    pub weak: u32,
    /// Trong `weak`: thẻ yếu vì tự chấm Again/Hard.
    pub weak_rating: u32,
    /// Trong `weak`: thẻ yếu vì làm sai bài kiểm tra.
    pub weak_quiz: u32,
    /// Trung bình độ thành thạo dài hạn của các thẻ trong bài, 0.0–1.0.
    pub mastery: f64,
    /// Số thẻ của bài đã đạt ngưỡng thành thạo.
    pub mastered: u32,
    /// Trung bình điểm làm bài gần nhất của các thẻ đã làm bài.
    pub accuracy: f64,
    /// Số thẻ đã từng làm bài; `0` = chưa có dữ liệu.
    pub graded: u32,
}

impl LessonInfo {
    fn from_counters(n: u32, counters: Counters) -> Self {
        Self {
            n,
            label: format!("Bài {n}"),
            count: counters.total,
            due: counters.due,
            new_cards: counters.new_cards,
            learning: counters.learning,
            mature: counters.mature,
            weak: counters.weak,
            weak_rating: counters.weak_rating,
            weak_quiz: counters.weak_quiz,
            mastery: counters.mastery(),
            mastered: counters.mastered,
            accuracy: counters.accuracy(),
            graded: counters.graded,
        }
    }
}

/// Khung 50 bài kèm tiến độ của từng bài.
///
/// Dùng chung [`Counters`] với [`stats`] — một nơi duy nhất định nghĩa "một thẻ
/// thuộc nhóm nào", nên con số theo bài không thể lệch khỏi con số toàn thư viện.
pub fn lesson_summary(cards: &[Card], now: i64) -> Vec<LessonInfo> {
    let mut counts: BTreeMap<u32, Counters> = BTreeMap::new();
    for card in cards {
        let Some(lesson) = card.lesson else { continue };
        if !(LESSON_MIN..=LESSON_MAX).contains(&lesson) {
            continue;
        }
        counts.entry(lesson).or_default().add(card, now);
    }

    (LESSON_MIN..=LESSON_COUNT)
        .map(|n| LessonInfo::from_counters(n, counts.get(&n).copied().unwrap_or_default()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const T0: i64 = 1_700_000_000_000;
    const DAY: i64 = 86_400_000;

    fn card(id: &str, deck: &str, front: &str, back: &str, due: i64, reps: u32) -> Card {
        // Thẻ đã học (reps > 0) được đặt interval 30 ngày ⇒ thuộc nhóm "chín".
        let interval = if reps > 0 { 30 } else { 0 };
        Card::from_json(
            &json!({
                "id": id, "deckId": deck, "front": front, "back": back,
                "romaji": "romaji-",
                "createdAt": T0,
                "srs": { "due": due, "repetitions": reps, "interval": interval }
            }),
            T0,
        )
        .unwrap()
    }

    fn library() -> Vec<Card> {
        vec![
            card("a", "vocabulary", "Xin chào", "こんにちは", T0 - DAY, 0),
            card("b", "vocabulary", "Tạm biệt", "さようなら", T0 + DAY, 2),
            card("c", "patterns", "Bạn là ai?", "だれですか", T0 - DAY, 0),
        ]
    }

    #[test]
    fn counts_each_bucket() {
        let s = stats(&library(), T0, Quiz::Meaning);
        assert_eq!(s.total, 3);
        assert_eq!(s.new_cards, 2);
        assert_eq!(s.due, 2);
        assert_eq!(s.mature, 1);
        assert_eq!(s.learning, 0);
        assert_eq!(s.weak, 0);
        assert_eq!(s.quizzable, 3);
    }

    #[test]
    fn groups_by_deck_in_stable_order() {
        let s = stats(&library(), T0, Quiz::Meaning);
        let decks: Vec<&str> = s.by_deck.keys().map(String::as_str).collect();
        assert_eq!(decks, vec!["patterns", "vocabulary"]);
        assert_eq!(s.by_deck["vocabulary"].total, 2);
        assert_eq!(s.by_deck["vocabulary"].due, 1);
        assert_eq!(s.by_deck["patterns"].new_cards, 1);
    }

    #[test]
    fn filter_by_deck_and_lesson() {
        let mut cards = library();
        cards[0].lesson = Some(1);
        cards[1].lesson = Some(2);

        let f = CardFilter {
            deck_ids: Some(vec!["vocabulary".into()]),
            ..Default::default()
        };
        assert_eq!(filter_ids(&cards, &f, T0), vec!["a", "b"]);

        let f = CardFilter {
            lesson: Some(2),
            ..Default::default()
        };
        assert_eq!(filter_ids(&cards, &f, T0), vec!["b"]);
    }

    #[test]
    fn filter_due_only_limits_only_new_cards() {
        let cards = library();
        let f = CardFilter {
            due_only: true,
            new_limit: Some(1),
            ..Default::default()
        };
        // có 2 thẻ mới tới hạn nhưng giới hạn 1; thẻ đã học tới hạn vẫn được lấy
        let ids = filter_ids(&cards, &f, T0);
        assert_eq!(ids, vec!["a"]);
        assert!(!ids.contains(&"b".to_string())); // b chưa tới hạn
    }

    #[test]
    fn new_limit_does_not_drop_due_learning_cards() {
        let cards = vec![
            card("new", "vocabulary", "n", "n", T0 - 1, 0),
            card("learned", "vocabulary", "l", "l", T0 - 1, 3),
        ];
        let f = CardFilter {
            due_only: true,
            new_limit: Some(0),
            ..Default::default()
        };
        assert_eq!(filter_ids(&cards, &f, T0), vec!["learned"]);
    }

    #[test]
    fn search_matches_all_text_fields_and_tags() {
        let mut cards = library();
        cards[0].tags = vec!["nhóm chào hỏi".into()];

        let search = |q: &str| {
            filter_ids(
                &cards,
                &CardFilter {
                    query: Some(q.into()),
                    ..Default::default()
                },
                T0,
            )
        };
        assert_eq!(search("xin"), vec!["a"]); // front, không phân biệt hoa thường
        assert_eq!(search("XIN CHÀO"), vec!["a"]);
        assert_eq!(search("こんにちは"), vec!["a"]); // back
        assert_eq!(search("romaji-"), vec!["a", "b", "c"]); // trường romaji
        assert_eq!(search("chào hỏi"), vec!["a"]); // tag
        assert!(search("không tồn tại").is_empty());
        assert_eq!(search("   ").len(), 3); // truy vấn rỗng = không lọc
    }

    #[test]
    fn weak_filter_uses_srs_marks() {
        let mut cards = library();
        cards[0].srs.last_rating = Some(crate::srs::Rating::Again);
        cards[1].srs.last_wrong_at = Some(T0);
        let f = CardFilter {
            weak_only: true,
            ..Default::default()
        };
        assert_eq!(filter_ids(&cards, &f, T0), vec!["a", "b"]);
    }

    #[test]
    fn weak_cards_are_split_by_reason_everywhere() {
        let mut cards = library();
        cards[0].srs.last_rating = Some(crate::srs::Rating::Again);
        cards[1].srs.last_wrong_at = Some(T0);

        let s = stats(&cards, T0, Quiz::Meaning);
        assert_eq!(s.weak, 2);
        assert_eq!(s.weak_rating, 1);
        assert_eq!(s.weak_quiz, 1);
        assert_eq!(s.weak_rating + s.weak_quiz, s.weak);

        let by_deck = &s.by_deck["vocabulary"];
        assert_eq!(by_deck.weak, 2);
        assert_eq!(by_deck.weak_rating, 1);
        assert_eq!(by_deck.weak_quiz, 1);
    }

    #[test]
    fn a_card_weak_for_both_reasons_is_counted_once_as_rating() {
        // `weak_reason` ưu tiên `rating`; tổng hai nhóm luôn bằng `weak`.
        let mut cards = library();
        cards[0].srs.last_rating = Some(crate::srs::Rating::Hard);
        cards[0].srs.last_wrong_at = Some(T0);

        let s = stats(&cards, T0, Quiz::Meaning);
        assert_eq!(s.weak, 1);
        assert_eq!(s.weak_rating, 1);
        assert_eq!(s.weak_quiz, 0);
    }

    #[test]
    fn lesson_summary_always_has_all_50_lessons() {
        let mut cards = library();
        cards[0].lesson = Some(1);
        cards[1].lesson = Some(1);
        cards[2].lesson = Some(50);

        let summary = lesson_summary(&cards, T0);
        assert_eq!(summary.len(), 50);
        assert_eq!(summary[0].n, 1);
        assert_eq!(summary[0].label, "Bài 1");
        assert_eq!(summary[0].count, 2);
        assert_eq!(summary[0].due, 1);
        assert_eq!(summary[49].count, 1);
        assert_eq!(summary[10].count, 0); // bài trống vẫn có mặt
    }

    #[test]
    fn mastery_and_accuracy_are_reported_separately() {
        let mut cards = library();
        // "b" đã học (interval 30 ⇒ mastery ~0.588) và vừa trả lời đúng.
        cards[1].srs.last_score = Some(1.0);
        // "a" là thẻ mới, chưa từng làm bài.
        let s = stats(&cards, T0, Quiz::Meaning);

        assert_eq!(s.graded, 1);
        assert_eq!(s.accuracy, 1.0);
        // Trung bình cộng trên CẢ thư viện, không chỉ thẻ đã học.
        let expected_mastery = cards.iter().map(|c| c.srs.mastery()).sum::<f64>() / 3.0;
        assert!((s.mastery - round4(expected_mastery)).abs() < 1e-9);
        assert_eq!(s.mastered, 1);
    }

    #[test]
    fn accuracy_is_zero_without_data_and_says_so() {
        let s = stats(&library(), T0, Quiz::Meaning);
        assert_eq!(s.graded, 0);
        assert_eq!(s.accuracy, 0.0);
        // Không có mẫu không được biến thành "kém": giao diện đọc `graded`.
    }

    #[test]
    fn per_deck_aggregates_match_the_whole_library() {
        let mut cards = library();
        cards[1].srs.last_score = Some(0.5);
        let s = stats(&cards, T0, Quiz::Meaning);

        let decks: Vec<&DeckCount> = s.by_deck.values().collect();
        assert_eq!(decks.iter().map(|d| d.total).sum::<u32>(), s.total);
        assert_eq!(decks.iter().map(|d| d.graded).sum::<u32>(), s.graded);
        assert_eq!(decks.iter().map(|d| d.mastered).sum::<u32>(), s.mastered);
        // mastery là trung bình, nên phải được tính lại theo tổng số thẻ.
        let weighted =
            decks.iter().map(|d| d.mastery * f64::from(d.total)).sum::<f64>() / f64::from(s.total);
        assert!((s.mastery - round4(weighted)).abs() < 1e-9);
    }

    #[test]
    fn a_new_card_has_zero_mastery_and_a_studied_one_has_more() {
        let s = stats(&library(), T0, Quiz::Meaning);
        assert_eq!(s.by_deck["patterns"].mastery, 0.0); // thẻ mới
        assert!(s.by_deck["vocabulary"].mastery > 0.0); // có một thẻ đã học
    }

    #[test]
    fn empty_library_reports_zero_without_dividing_by_zero() {
        let s = stats(&[], T0, Quiz::Meaning);
        assert_eq!(s.total, 0);
        assert_eq!(s.mastery, 0.0);
        assert_eq!(s.accuracy, 0.0);
        assert_eq!(s.graded, 0);
        assert!(s.by_deck.is_empty());
    }

    #[test]
    fn lesson_summary_ignores_cards_outside_the_range() {
        let mut cards = library();
        cards[0].lesson = Some(99);
        let summary = lesson_summary(&cards, T0);
        assert!(summary.iter().all(|l| l.count == 0));
    }

    #[test]
    fn lesson_summary_reports_progress_with_the_same_rules_as_the_library() {
        let mut cards = library();
        cards[0].lesson = Some(1); // thẻ mới, tới hạn
        cards[1].lesson = Some(1); // đã học (chín), tới hạn tương lai, vừa làm bài
        cards[2].lesson = Some(2); // thẻ mới, tới hạn
        cards[1].srs.last_score = Some(0.5);
        cards[1].srs.last_rating = Some(crate::srs::Rating::Again);

        let summary = lesson_summary(&cards, T0);
        let lesson1 = &summary[0];

        assert_eq!(lesson1.count, 2);
        assert_eq!(lesson1.due, 1);
        assert_eq!(lesson1.new_cards, 1);
        assert_eq!(lesson1.mature, 1);
        assert_eq!(lesson1.learning, 0);
        assert_eq!(lesson1.weak, 1);
        assert_eq!(lesson1.weak_rating, 1);
        assert_eq!(lesson1.weak_quiz, 0);
        assert_eq!(lesson1.mastered, 1);
        assert!(lesson1.mastery > 0.0);
        assert_eq!(lesson1.graded, 1);
        assert_eq!(lesson1.accuracy, 0.5);

        // Cùng quy tắc với `stats`: tổng theo bài khớp con số toàn thư viện.
        let s = stats(&cards, T0, Quiz::Meaning);
        let summed: u32 = summary.iter().map(|l| l.count).sum();
        assert_eq!(summed, s.total);
        let due: u32 = summary.iter().map(|l| l.due).sum();
        assert_eq!(due, s.due);
        let weak: u32 = summary.iter().map(|l| l.weak).sum();
        assert_eq!(weak, s.weak);
        let graded: u32 = summary.iter().map(|l| l.graded).sum();
        assert_eq!(graded, s.graded);

        // Bài 2 chỉ có thẻ mới: chưa thành thạo, chưa có dữ liệu làm bài.
        let lesson2 = &summary[1];
        assert_eq!(lesson2.count, 1);
        assert_eq!(lesson2.new_cards, 1);
        assert_eq!(lesson2.mastery, 0.0);
        assert_eq!(lesson2.graded, 0);
        assert_eq!(lesson2.accuracy, 0.0);
    }
}
