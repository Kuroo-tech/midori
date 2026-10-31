//! Chế độ Làm bài: dựng câu hỏi, liệt kê đáp án hợp lệ, chấm câu trả lời.
//!
//! Không suy diễn đáp án ngoài dữ liệu thẻ đã khai báo. Một thẻ có thể khai
//! nhiều cách viết hợp lệ bằng `/` hoặc `|`.

use serde::{Deserialize, Serialize};

use crate::card::{Card, Quiz};
use crate::text::{collapse_whitespace, compat_normalize, fold_vietnamese, has_kana};

/// Nguồn của một đáp án hợp lệ.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AnswerKind {
    Kanji,
    Furigana,
    Romaji,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Candidate {
    pub value: String,
    pub kind: AnswerKind,
}

/// Kết luận của MỘT lần trả lời.
///
/// Năm mức, không phải hai: "đúng/sai" là thông tin quá thô để phản hồi cho
/// người học và cũng quá thô để làm số liệu. Mỗi mức gắn với một mức điểm cố
/// định, nên điểm luôn giải thích được bằng chính kết luận.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Verdict {
    /// Người học bỏ trống.
    Empty,
    /// Trả lời nhưng không khớp đáp án nào.
    Wrong,
    /// Gần đúng: sai chính tả trong ngưỡng cho phép. KHÔNG tính là đúng.
    Near,
    /// Đúng sau khi bỏ dấu tiếng Việt (`nghia` cho `nghĩa`). Tính là đúng, điểm
    /// thấp hơn chính xác: người học nhớ đúng từ, chỉ không gõ dấu.
    Accepted,
    /// Đúng chính xác (romaji không phân biệt hoa/thường).
    Exact,
}

impl Verdict {
    /// Điểm của một lần trả lời, theo đúng kết luận.
    ///
    /// 1.0 đúng chính xác · 0.9 đúng nhưng thiếu dấu · 0.5 gần đúng (sai chính
    /// tả) · 0.0 bỏ trống hoặc sai. Điểm nằm TRONG đáp án, không phụ thuộc thời
    /// gian trả lời — tốc độ không được đánh đồng với kiến thức.
    pub fn score(self) -> f64 {
        match self {
            Verdict::Exact => 1.0,
            Verdict::Accepted => 0.9,
            Verdict::Near => 0.5,
            Verdict::Wrong | Verdict::Empty => 0.0,
        }
    }

    /// Được tính là trả lời đúng hay không.
    ///
    /// Chỉ `Exact` và `Accepted` — "gần đúng" cố ý KHÔNG được tính là đúng,
    /// vì mục đích của chế độ Làm bài là kiểm tra khả năng nhớ lại, không phải
    /// đánh giá tay gõ.
    pub fn is_correct(self) -> bool {
        matches!(self, Verdict::Exact | Verdict::Accepted)
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Verdict::Empty => "empty",
            Verdict::Wrong => "wrong",
            Verdict::Near => "near",
            Verdict::Accepted => "accepted",
            Verdict::Exact => "exact",
        }
    }
}

/// Cấu hình chấm điểm. Mọi thay đổi hành vi đều phải đi qua đây để kết quả vẫn
/// xác định: cùng dữ liệu + cùng cấu hình ⇒ cùng kết quả.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AnswerConfig {
    /// Chấp nhận đáp án tiếng Việt gõ thiếu dấu (`nghia` cho `nghĩa`).
    pub accent_tolerant: bool,
    /// Chấp nhận sai chính tả trong ngưỡng (kết luận `near`, nửa điểm).
    pub allow_typos: bool,
}

impl Default for AnswerConfig {
    fn default() -> Self {
        Self {
            accent_tolerant: true,
            allow_typos: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerCheck {
    /// Trả lời đúng — tương đương `score >= 0.9`. Giữ lại để mã cũ và hợp đồng
    /// đã công bố không phải đổi nghĩa.
    pub correct: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matched: Option<String>,
    /// Đáp án tham khảo, hiển thị khi người học trả lời sai.
    pub reference: Vec<String>,
    /// Điểm của lần trả lời này, 0.0–1.0.
    pub score: f64,
    /// Kết luận đã cho ra `score`.
    pub verdict: Verdict,
}

/// Chuẩn hoá so khớp: quy full-width về ASCII + gộp khoảng trắng + cắt hai đầu.
/// KHÔNG bỏ dấu ở bước này — dấu là thông tin; việc bỏ dấu chỉ diễn ra ở nhánh
/// chấp nhận thiếu dấu, và khi đó kết luận được ghi rõ là `Accepted`.
fn collapse(s: &str) -> String {
    collapse_whitespace(&compat_normalize(s))
}

/// Mặt được hỏi, tuỳ chế độ hỏi của bộ thẻ:
/// - `Meaning` — hỏi nghĩa tiếng Việt (`front`), trả lời bằng chữ Nhật.
/// - `Reading` — hỏi chữ Nhật (`back`), trả lời bằng nghĩa tiếng Việt.
pub fn prompt_of(card: &Card, quiz: Quiz) -> String {
    let raw = match quiz {
        Quiz::Reading => &card.back,
        Quiz::Meaning => &card.front,
    };
    raw.trim().to_string()
}

/// Các đáp án được KHAI BÁO cho thẻ, theo thứ tự ưu tiên.
pub fn answers_for(card: &Card, quiz: Quiz) -> Vec<Candidate> {
    let main = match quiz {
        Quiz::Reading => &card.front,
        Quiz::Meaning => &card.back,
    };

    let mut out = Vec::new();
    push_candidates(&mut out, main, AnswerKind::Kanji);
    push_candidates(&mut out, &card.furigana, AnswerKind::Furigana);
    push_candidates(&mut out, &card.romaji, AnswerKind::Romaji);
    out
}

fn push_candidates(out: &mut Vec<Candidate>, value: &str, kind: AnswerKind) {
    for part in value.split(['/', '|']) {
        let v = part.trim();
        if !v.is_empty() {
            out.push(Candidate {
                value: v.to_string(),
                kind,
            });
        }
    }
}

/// Thẻ đủ dữ liệu để chấm (có câu hỏi và ít nhất một đáp án).
pub fn is_quizzable(card: &Card, quiz: Quiz) -> bool {
    !prompt_of(card, quiz).is_empty() && !answers_for(card, quiz).is_empty()
}

/// So khớp câu trả lời theo cấu hình mặc định.
pub fn check_answer(input: &str, card: &Card, quiz: Quiz) -> AnswerCheck {
    score_answer(input, card, quiz, AnswerConfig::default())
}

/// Chấm một câu trả lời: kết luận + điểm, xác định và giải thích được.
///
/// Thứ tự xét (dừng ở nhánh đầu tiên khớp):
/// 1. bỏ trống ⇒ `Empty`, 0 điểm;
/// 2. khớp chính xác một đáp án đã khai báo ⇒ `Exact`, 1.0;
/// 3. khớp sau khi BỎ DẤU tiếng Việt (chỉ với đáp án hệ Latin, và chỉ khi bật
///    `accent_tolerant`) ⇒ `Accepted`, 0.9;
/// 4. sai chính tả trong ngưỡng (chỉ khi bật `allow_typos`) ⇒ `Near`, 0.5;
/// 5. còn lại ⇒ `Wrong`, 0 điểm.
///
/// Đáp án trùng nhau được xét theo thứ tự khai báo (Kanji → furigana → romaji),
/// nên khi một thẻ có nhiều cách viết đúng thì kết quả vẫn xác định.
pub fn score_answer(
    input: &str,
    card: &Card,
    quiz: Quiz,
    config: AnswerConfig,
) -> AnswerCheck {
    let given = collapse(input);
    let candidates = answers_for(card, quiz);
    let reference = candidates.iter().map(|c| c.value.clone()).collect();

    let finish = |verdict: Verdict, matched: Option<String>| AnswerCheck {
        correct: verdict.is_correct(),
        matched,
        reference,
        score: verdict.score(),
        verdict,
    };

    if given.is_empty() {
        return finish(Verdict::Empty, None);
    }

    let folded_given = fold_vietnamese(&given);
    let mut near: Option<String> = None;

    for candidate in &candidates {
        let target = collapse(&candidate.value);
        if target.is_empty() {
            continue;
        }

        if matches_candidate(&given, &target, candidate.kind) {
            return finish(Verdict::Exact, Some(candidate.value.clone()));
        }

        // Chữ Nhật (có kana) không đi qua hai nhánh khoan dung dưới đây: bỏ dấu và
        // hoa/thường đều không có nghĩa với kana. Nhánh "gần đúng" vẫn áp dụng —
        // `こんにちわ` cho `こんにちは` là lỗi rất thật của người học.
        if !has_kana(&target) {
            // Hệ chữ Latin: khác hoa/thường không phải là câu trả lời khác.
            if given.to_lowercase() == target.to_lowercase() {
                return finish(Verdict::Exact, Some(candidate.value.clone()));
            }
            if config.accent_tolerant && fold_vietnamese(&given) == fold_vietnamese(&target) {
                return finish(Verdict::Accepted, Some(candidate.value.clone()));
            }
        }

        if config.allow_typos && near.is_none() && is_near_miss(&folded_given, &target) {
            near = Some(candidate.value.clone());
        }
    }

    match near {
        Some(matched) => finish(Verdict::Near, Some(matched)),
        None => finish(Verdict::Wrong, None),
    }
}

fn matches_candidate(given: &str, target: &str, kind: AnswerKind) -> bool {
    match kind {
        AnswerKind::Romaji => given.to_lowercase() == target.to_lowercase(),
        _ => given == target,
    }
}

/// Ngưỡng sửa lỗi gõ phụ thuộc độ dài: chuỗi ngắn không được phép sai ký tự nào
/// (khác một ký tự ở từ 3 chữ cái thường là từ KHÁC, không phải gõ nhầm).
fn typo_budget(len: usize) -> usize {
    if len <= 3 {
        0
    } else if len <= 7 {
        1
    } else {
        2
    }
}

/// Sai chính tả trong ngưỡng. Khoảng cách tính trên chuỗi đã bỏ dấu và viết
/// thường, nên thiếu dấu không bao giờ bị coi là "sai chính tả".
///
/// Hai chuỗi chỉ khác nhau ở dấu (khoảng cách 0 sau khi bỏ dấu) CỐ Ý không phải
/// "gần đúng": đó là trường hợp của nhánh chấp nhận thiếu dấu, và nó phải giữ
/// nguyên kết luận dù `accent_tolerant` bật hay tắt — nếu không, tắt chấp nhận
/// thiếu dấu mà vẫn cho nửa điểm vì "gần đúng" thì cấu hình vô nghĩa.
fn is_near_miss(folded_given: &str, target: &str) -> bool {
    let folded_target = fold_vietnamese(target);
    if folded_given.is_empty() || folded_given == folded_target {
        return false;
    }
    let budget = typo_budget(folded_target.chars().count().max(folded_given.chars().count()));
    if budget == 0 {
        return false;
    }
    edit_distance_within(folded_given, &folded_target, budget)
}

/// Khoảng cách Levenshtein có chặn trên: dừng sớm khi đã vượt `budget`.
fn edit_distance_within(left: &str, right: &str, budget: usize) -> bool {
    let a: Vec<char> = left.chars().collect();
    let b: Vec<char> = right.chars().collect();
    if a.len().abs_diff(b.len()) > budget {
        return false;
    }
    let mut previous: Vec<usize> = (0..=b.len()).collect();
    let mut current = vec![0usize; b.len() + 1];

    for (i, ca) in a.iter().enumerate() {
        current[0] = i + 1;
        let mut row_min = current[0];
        for (j, cb) in b.iter().enumerate() {
            let cost = usize::from(ca != cb);
            current[j + 1] = (previous[j] + cost)
                .min(previous[j + 1] + 1)
                .min(current[j] + 1);
            row_min = row_min.min(current[j + 1]);
        }
        if row_min > budget {
            return false;
        }
        std::mem::swap(&mut previous, &mut current);
    }

    previous[b.len()] <= budget
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::card::Card;
    use serde_json::json;

    const T0: i64 = 1_700_000_000_000;

    fn card(front: &str, back: &str, furigana: &str, romaji: &str) -> Card {
        Card::from_json(
            &json!({ "id": "c", "front": front, "back": back, "furigana": furigana, "romaji": romaji }),
            T0,
        )
        .unwrap()
    }

    #[test]
    fn prompt_is_the_vietnamese_face() {
        let c = card("Xin chào", "こんにちは", "こんにちは", "konnichiwa");
        assert_eq!(prompt_of(&c, Quiz::Meaning), "Xin chào");
        assert_eq!(prompt_of(&c, Quiz::Reading), "こんにちは");
    }

    #[test]
    fn answers_cover_kanji_furigana_and_romaji() {
        let c = card("Xin chào", "こんにちは", "こんにちは", "konnichiwa");
        let kinds: Vec<AnswerKind> = answers_for(&c, Quiz::Meaning).iter().map(|a| a.kind).collect();
        assert_eq!(kinds, vec![AnswerKind::Kanji, AnswerKind::Furigana, AnswerKind::Romaji]);
    }

    #[test]
    fn accepts_romaji_case_insensitively() {
        let c = card("Xin chào", "こんにちは", "", "konnichiwa");
        assert!(check_answer("KONNICHIWA", &c, Quiz::Meaning).correct);
        assert!(check_answer("  konnichiwa ", &c, Quiz::Meaning).correct);
    }

    #[test]
    fn japanese_answers_are_case_sensitive_and_exact() {
        let c = card("Xin chào", "こんにちは", "こんにちは", "");
        assert!(check_answer("こんにちは", &c, Quiz::Meaning).correct);
        assert!(!check_answer("こんにちわ", &c, Quiz::Meaning).correct); // khác ký tự
    }

    #[test]
    fn slash_separated_variants_are_all_valid() {
        let c = card("Xin chào", "こんにちは/ハロー", "", "konnichiwa|haro");
        assert!(check_answer("ハロー", &c, Quiz::Meaning).correct);
        assert!(check_answer("haro", &c, Quiz::Meaning).correct);
        assert!(!check_answer("hello", &c, Quiz::Meaning).correct);
    }

    #[test]
    fn normalizes_full_width_characters() {
        // Input từ IME có thể ở dạng full-width; phải quy về ASCII để khớp.
        let c = card("Xin chào", "こんにちは", "", "konnichiwa");
        assert!(check_answer("ｋｏｎｎｉｃｈｉｗａ", &c, Quiz::Meaning).correct);
    }

    #[test]
    fn normalizes_ideographic_spaces_in_answers() {
        let c = card("Cảm ơn", "ありがとう", "", "arigatou gozaimasu");
        assert!(check_answer("arigatou\u{3000}gozaimasu", &c, Quiz::Meaning).correct);
    }

    #[test]
    fn empty_input_is_never_correct_but_still_gives_a_reference() {
        let c = card("Xin chào", "こんにちは", "こんにちは", "konnichiwa");
        let result = check_answer("   ", &c, Quiz::Meaning);
        assert!(!result.correct);
        assert_eq!(result.reference.len(), 3);
    }

    #[test]
    fn reports_which_variant_matched() {
        let c = card("Xin chào", "こんにちは/ハロー", "", "");
        let result = check_answer("ハロー", &c, Quiz::Meaning);
        assert_eq!(result.matched.as_deref(), Some("ハロー"));
    }

    #[test]
    fn a_card_without_answers_is_not_quizzable() {
        let base = card("Xin chào", "こんにちは", "", "");
        let bare = Card {
            back: String::new(),
            ..base
        };
        assert!(!is_quizzable(&bare, Quiz::Meaning)); // không có mặt tiếng Nhật
        assert!(!is_quizzable(&bare, Quiz::Reading));
    }

    // ── Chấm điểm theo mức ─────────────────────────────────────────────

    fn vietnamese(answer: &str) -> Card {
        // Bộ hỏi nghĩa: đáp án nằm ở `front` tiếng Việt.
        card(answer, "こんにちは", "", "")
    }

    #[test]
    fn verdict_comes_with_a_fixed_score() {
        assert_eq!(Verdict::Exact.score(), 1.0);
        assert_eq!(Verdict::Accepted.score(), 0.9);
        assert_eq!(Verdict::Near.score(), 0.5);
        assert_eq!(Verdict::Wrong.score(), 0.0);
        assert_eq!(Verdict::Empty.score(), 0.0);
        assert!(Verdict::Exact.is_correct());
        assert!(Verdict::Accepted.is_correct());
        assert!(!Verdict::Near.is_correct());
    }

    #[test]
    fn exact_match_scores_full() {
        let c = card("Xin chào", "こんにちは", "こんにちは", "konnichiwa");
        let result = score_answer("こんにちは", &c, Quiz::Meaning, AnswerConfig::default());
        assert_eq!(result.verdict, Verdict::Exact);
        assert_eq!(result.score, 1.0);
        assert!(result.correct);
    }

    #[test]
    fn empty_answer_is_a_verdict_not_a_wrong_answer() {
        let c = vietnamese("nghĩa");
        for input in ["", "   ", "\u{3000}"] {
            let result = score_answer(input, &c, Quiz::Reading, AnswerConfig::default());
            assert_eq!(result.verdict, Verdict::Empty, "input: {input:?}");
            assert_eq!(result.score, 0.0);
            assert!(!result.correct);
            assert_eq!(result.reference, vec!["nghĩa"]);
        }
    }

    #[test]
    fn missing_vietnamese_diacritics_is_accepted_at_a_lower_score() {
        let c = vietnamese("nghĩa");
        let result = score_answer("nghia", &c, Quiz::Reading, AnswerConfig::default());
        assert_eq!(result.verdict, Verdict::Accepted);
        assert_eq!(result.score, 0.9);
        assert!(result.correct, "thiếu dấu vẫn phải được tính là đúng");
        assert_eq!(result.matched.as_deref(), Some("nghĩa"));
    }

    #[test]
    fn diacritic_tolerance_can_be_switched_off() {
        let c = vietnamese("nghĩa");
        let strict = AnswerConfig {
            accent_tolerant: false,
            allow_typos: false,
        };
        let result = score_answer("nghia", &c, Quiz::Reading, strict);
        assert_eq!(result.verdict, Verdict::Wrong);
        assert_eq!(result.score, 0.0);
        // Và khi bỏ dấu không được bật thì cũng không có gì bị coi là "gần đúng".
        assert!(result.matched.is_none());
    }

    #[test]
    fn japanese_answers_are_never_diacritic_folded() {
        // Bỏ dấu chỉ áp cho hệ chữ Latin; chữ Nhật vẫn phải so chính xác.
        let c = vietnamese("こんにちは");
        let result = score_answer("こんにちわ", &c, Quiz::Reading, AnswerConfig::default());
        assert_eq!(result.verdict, Verdict::Near);
        assert!(!result.correct);
    }

    #[test]
    fn tone_difference_is_still_an_accepted_answer() {
        // Sai thanh là sai dấu ⇒ bỏ dấu là khớp, nên kết luận phải là `Accepted`
        // chứ không phải "gần đúng": người gõ thiếu dấu không mắc lỗi chính tả.
        let c = vietnamese("nghĩa");
        assert_eq!(
            score_answer("nghìa", &c, Quiz::Reading, AnswerConfig::default()).verdict,
            Verdict::Accepted
        );
        assert_eq!(
            score_answer("nghia", &c, Quiz::Reading, AnswerConfig::default()).verdict,
            Verdict::Accepted
        );
    }

    #[test]
    fn a_typo_in_the_middle_is_a_near_miss_not_a_wrong_answer() {
        let c = vietnamese("nghĩa");
        let typo = score_answer("nghĩ", &c, Quiz::Reading, AnswerConfig::default());
        assert_eq!(typo.verdict, Verdict::Near);
        assert_eq!(typo.score, 0.5);
        assert!(!typo.correct, "gần đúng không được tính là đúng");
        assert_eq!(typo.matched.as_deref(), Some("nghĩa"));
    }

    #[test]
    fn short_answers_get_no_typo_allowance() {
        // Ở từ 3 ký tự, khác một phụ âm thường là từ KHÁC (ba / bo), không phải
        // gõ nhầm — nên không có "gần đúng".
        let c = vietnamese("ba");
        assert_eq!(
            score_answer("bo", &c, Quiz::Reading, AnswerConfig::default()).verdict,
            Verdict::Wrong
        );
        // Còn từ 4 ký tự trở lên thì một ký tự lệch vẫn là gần đúng.
        let c = vietnamese("bốn");
        assert_eq!(
            score_answer("bong", &c, Quiz::Reading, AnswerConfig::default()).verdict,
            Verdict::Near
        );
    }

    #[test]
    fn typo_detection_can_be_switched_off() {
        let c = vietnamese("nghĩa");
        let strict = AnswerConfig {
            accent_tolerant: true,
            allow_typos: false,
        };
        assert_eq!(
            score_answer("nghĩ", &c, Quiz::Reading, strict).verdict,
            Verdict::Wrong
        );
    }

    #[test]
    fn scoring_is_deterministic_for_the_same_input() {
        let c = card("Xin chào", "こんにちは/ハロー", "", "konnichiwa|haro");
        for input in ["konnichiwa", "haro", "KONNICHIWA", "ハロー", "sai", ""] {
            let first = score_answer(input, &c, Quiz::Meaning, AnswerConfig::default());
            let second = score_answer(input, &c, Quiz::Meaning, AnswerConfig::default());
            assert_eq!(first, second, "input: {input:?}");
        }
    }

    #[test]
    fn multiple_valid_answers_resolve_by_declaration_order() {
        // "こんにちは" xuất hiện ở cả `back` và `furigana`: phải luôn khớp bản đầu.
        let c = card("Xin chào", "こんにちは", "こんにちは", "konnichiwa");
        let result = score_answer("こんにちは", &c, Quiz::Meaning, AnswerConfig::default());
        assert_eq!(result.matched.as_deref(), Some("こんにちは"));
        assert_eq!(result.verdict, Verdict::Exact);
    }

    #[test]
    fn garbage_input_is_a_wrong_answer_not_a_crash() {
        let c = card("Xin chào", "こんにちは", "", "konnichiwa");
        for input in ["?????", "\u{0}", "−—–", "😀😀😀😀"] {
            let result = score_answer(input, &c, Quiz::Meaning, AnswerConfig::default());
            assert!(!result.correct, "input: {input:?}");
            assert!(result.score <= 0.5, "input: {input:?}");
            assert_eq!(result.reference, vec!["こんにちは", "konnichiwa"]);
        }
    }

    #[test]
    fn letter_case_alone_is_not_a_wrong_answer() {
        // Tiếng Việt viết hoa đầu câu không mang nghĩa; gõ lại không hoa vẫn đúng
        // hoàn toàn (không bị hạ xuống mức "chấp nhận").
        let c = vietnamese("Xin chào");
        let result = score_answer("xin chào", &c, Quiz::Reading, AnswerConfig::default());
        assert_eq!(result.verdict, Verdict::Exact);
        assert_eq!(result.score, 1.0);
    }

    #[test]
    fn full_width_input_still_matches_exactly() {
        let c = card("Xin chào", "こんにちは", "", "konnichiwa");
        let result = score_answer("ｋｏｎｎｉｃｈｉｗａ", &c, Quiz::Meaning, AnswerConfig::default());
        assert_eq!(result.verdict, Verdict::Exact);
        assert_eq!(result.score, 1.0);
    }

    #[test]
    fn config_defaults_are_the_documented_ones() {
        let default = AnswerConfig::default();
        assert!(default.accent_tolerant);
        assert!(default.allow_typos);
        // Cấu hình đọc từ JSON thiếu trường vẫn phải ra mặc định.
        let parsed: AnswerConfig = serde_json::from_str("{}").unwrap();
        assert_eq!(parsed, default);
    }
}
