//! Đánh giá chất lượng thuật toán chấm điểm bằng SỐ LIỆU, không bằng cảm nhận.
//!
//! # Bài toán
//!
//! Thuật toán cũ chỉ có hai kết cục: khớp chính xác (đúng) hoặc không (sai). Với
//! người học Việt–Nhật, hai kết cục đó sai ở cả hai phía:
//!
//! - **Âm tính giả** (báo sai trong khi người học đúng): gõ thiếu dấu tiếng Việt
//!   (`nghia` cho `nghĩa`) là chuyện thường ngày trên bàn phím điện thoại.
//! - **Mất thông tin**: "gõ nhầm một ký tự" và "không biết gì" bị gộp làm một, nên
//!   phản hồi và số liệu đều không phân biệt được hai tình huống rất khác nhau.
//!
//! # Cách đo
//!
//! Corpus dưới đây có NHÃN do người đặt: mỗi ca là một câu trả lời thật, kèm kết
//! luận mà một người chấm công bằng sẽ đưa ra (`should_accept`). Từ nhãn đó tính
//! hai chỉ số:
//!
//! - **recall** = phần các ca ĐÁNG được chấp nhận mà thuật toán chấp nhận.
//! - **precision** = phần các ca được chấp nhận mà ĐÁNG được chấp nhận (1.0 nghĩa
//!   là không có ca nào bị chấp nhận oan).
//!
//! Chỉ số tự in ra khi chạy `cargo test -p midori-core --test answer-scoring --
//! --nocapture`, để con số nằm trong log chứ không chỉ trong đầu người viết.

use midori_core::card::{Card, Quiz};
use midori_core::quiz::{check_answer, score_answer, AnswerConfig, Verdict};
use serde_json::json;

const T0: i64 = 1_700_000_000_000;

/// Một ca kiểm thử có nhãn.
struct Case {
    /// Câu hỏi thuộc bộ nào (quyết định mặt nào là đáp án).
    quiz: Quiz,
    front: &'static str,
    back: &'static str,
    furigana: &'static str,
    romaji: &'static str,
    /// Người học đã gõ gì.
    input: &'static str,
    /// Người chấm công bằng có tính là đúng không.
    should_accept: bool,
    /// Nhóm ca, dùng để đọc bảng số liệu.
    group: &'static str,
}

fn card(case: &Case) -> Card {
    Card::from_json(
        &json!({
            "id": "eval",
            "deckId": "vocabulary",
            "front": case.front,
            "back": case.back,
            "furigana": case.furigana,
            "romaji": case.romaji,
        }),
        T0,
    )
    .expect("ca kiểm thử phải dựng được thẻ")
}

/// Corpus nhãn: chữ Nhật, romaji và tiếng Việt, gồm cả các trường hợp biên.
fn corpus() -> Vec<Case> {
    let mut cases = Vec::new();

    // ── Chữ Nhật, hỏi nghĩa (đáp án nằm ở `back`/`furigana`/`romaji`) ───────
    for (front, back, furigana, romaji) in [
        ("Xin chào", "こんにちは", "こんにちは", "konnichiwa"),
        ("Cảm ơn", "ありがとう", "ありがとう", "arigatou"),
        ("Xin lỗi", "ごめんなさい", "ごめんなさい", "gomen nasai"),
        ("Vâng, có", "はい", "はい", "hai"),
    ] {
        for (input, accept, group) in [
            (back, true, "chữ Nhật"),
            (furigana, true, "furigana"),
            (romaji, true, "romaji"),
            (input_upper(romaji), true, "romaji hoa"),
            ("__SAI__", false, "trả lời sai"),
        ] {
            let parsed = if input == "__SAI__" { "sai hẳn" } else { input };
            cases.push(Case {
                quiz: Quiz::Meaning,
                front,
                back,
                furigana,
                romaji,
                input: parsed,
                should_accept: accept,
                group,
            });
        }
    }

    // ── Tiếng Việt, hỏi chữ Nhật (đáp án nằm ở `front`) ─────────────────────
    for (front, back, furigana) in [
        ("nghĩa", "意味", "いみ"),
        ("Xin chào", "こんにちは", "こんにちは"),
        ("Tôi là học sinh", "私は学生です", "わたしはがくせいです"),
    ] {
        let lower = Box::leak(front.to_lowercase().into_boxed_str());
        for (input, accept, group) in [
            (front, true, "đúng chính xác"),
            (input_no_diacritics(front), true, "gõ thiếu dấu"),
            (lower, true, "viết thường"),
            ("__SAI__", false, "trả lời sai"),
        ] {
            let parsed = if input == "__SAI__" { "không biết" } else { input };
            cases.push(Case {
                quiz: Quiz::Reading,
                front,
                back,
                furigana,
                romaji: "",
                input: parsed,
                should_accept: accept,
                group,
            });
        }
    }

    // ── Trường hợp biên: không được chấp nhận ──────────────────────────────
    for (input, group) in [
        ("", "bỏ trống"),
        ("   ", "bỏ trống"),
        ("\u{3000}", "bỏ trống"),
        ("?????", "rác"),
        ("こんにちXYZ", "rác"),
    ] {
        cases.push(Case {
            quiz: Quiz::Meaning,
            front: "Xin chào",
            back: "こんにちは",
            furigana: "こんにちは",
            romaji: "konnichiwa",
            input,
            should_accept: false,
            group,
        });
    }

    // ── Gần đúng: KHÔNG được tính là đúng, nhưng phải được nhận ra ──────────
    for (front, back, furigana, input) in [
        ("nghĩa", "意味", "いみ", "nghĩ"),
        ("Xin chào", "こんにちは", "こんにちは", "Xin chàoo"),
    ] {
        cases.push(Case {
            quiz: Quiz::Reading,
            front,
            back,
            furigana,
            romaji: "",
            input,
            should_accept: false,
            group: "gần đúng",
        });
    }

    cases
}

fn input_upper(romaji: &str) -> &'static str {
    Box::leak(romaji.to_uppercase().into_boxed_str())
}

/// Bỏ dấu tiếng Việt bằng đúng bảng tường minh của lõi, dựng lại ở đây để nhãn
/// không phụ thuộc vào chính hàm đang được kiểm.
fn input_no_diacritics(text: &str) -> &'static str {
    Box::leak(
        text.chars()
            .map(|c| match c {
                'à' | 'á' | 'ả' | 'ã' | 'ạ' | 'ă' | 'ằ' | 'ắ' | 'ẳ' | 'ẵ' | 'ặ' | 'â' | 'ầ'
                | 'ấ' | 'ẩ' | 'ẫ' | 'ậ' => 'a',
                'è' | 'é' | 'ẻ' | 'ẽ' | 'ẹ' | 'ê' | 'ề' | 'ế' | 'ể' | 'ễ' | 'ệ' => 'e',
                'ì' | 'í' | 'ỉ' | 'ĩ' | 'ị' => 'i',
                'ò' | 'ó' | 'ỏ' | 'õ' | 'ọ' | 'ô' | 'ồ' | 'ố' | 'ổ' | 'ỗ' | 'ộ' | 'ơ' | 'ờ'
                | 'ớ' | 'ở' | 'ỡ' | 'ợ' => 'o',
                'ù' | 'ú' | 'ủ' | 'ũ' | 'ụ' | 'ư' | 'ừ' | 'ứ' | 'ử' | 'ữ' | 'ự' => 'u',
                'ỳ' | 'ý' | 'ỷ' | 'ỹ' | 'ỵ' => 'y',
                'đ' => 'd',
                other => other,
            })
            .collect::<String>()
            .into_boxed_str(),
    )
}

#[derive(Debug, Default)]
struct Metrics {
    cases: usize,
    /// Số ca đáng được chấp nhận.
    accept_expected: usize,
    /// Số ca thuật toán chấp nhận.
    accepted: usize,
    /// Chấp nhận đúng (đáng nhận và có nhận).
    true_positive: usize,
    /// Chấp nhận oan.
    false_positive: usize,
    /// Bỏ sót ca đáng được nhận.
    false_negative: usize,
}

impl Metrics {
    fn recall(&self) -> f64 {
        if self.accept_expected == 0 {
            return 1.0;
        }
        self.true_positive as f64 / self.accept_expected as f64
    }

    fn precision(&self) -> f64 {
        if self.accepted == 0 {
            return 1.0;
        }
        self.true_positive as f64 / self.accepted as f64
    }
}

fn measure(accept: impl Fn(&Case) -> bool) -> Metrics {
    let mut metrics = Metrics::default();
    for case in corpus() {
        metrics.cases += 1;
        if case.should_accept {
            metrics.accept_expected += 1;
        }
        let got = accept(&case);
        if got {
            metrics.accepted += 1;
        }
        match (case.should_accept, got) {
            (true, true) => metrics.true_positive += 1,
            (false, true) => metrics.false_positive += 1,
            (true, false) => metrics.false_negative += 1,
            (false, false) => {}
        }
    }
    metrics
}

#[test]
fn the_new_algorithm_never_rejects_an_answer_a_human_would_accept() {
    let metrics = measure(|case| check_answer(case.input, &card(case), case.quiz).correct);
    let old = measure(|case| {
        // Thuật toán cũ: chỉ khớp chính xác, không bỏ dấu, không có mức trung gian.
        let check = score_answer(
            case.input,
            &card(case),
            case.quiz,
            AnswerConfig {
                accent_tolerant: false,
                allow_typos: false,
            },
        );
        check.verdict == Verdict::Exact
    });

    println!("── Chấm điểm: cũ vs mới ────────────────────────────────");
    println!("  ca kiểm thử          : {}", metrics.cases);
    println!("  cũ   recall/precision: {:.3} / {:.3}", old.recall(), old.precision());
    println!("  mới  recall/precision: {:.3} / {:.3}", metrics.recall(), metrics.precision());
    println!("  âm tính giả  cũ/mới  : {} / {}", old.false_negative, metrics.false_negative);
    println!("  dương tính giả cũ/mới: {} / {}", old.false_positive, metrics.false_positive);

    // Kết quả mong đợi: mới chấp nhận MỌI ca đáng chấp nhận...
    assert_eq!(metrics.false_negative, 0, "bỏ sót câu trả lời đáng được chấp nhận");
    // ...và không chấp nhận oan ca nào.
    assert_eq!(metrics.false_positive, 0, "chấp nhận oan một câu trả lời sai");
    assert_eq!(metrics.recall(), 1.0);
    assert_eq!(metrics.precision(), 1.0);

    // Và phép đo phải chứng minh được là thuật toán cũ THUA: nếu không, corpus
    // này không kiểm chứng được gì về cải tiến.
    assert!(
        old.false_negative > 0,
        "corpus không còn phân biệt được thuật toán cũ với thuật toán mới"
    );
    assert!(old.recall() < metrics.recall());
}

#[test]
fn every_verdict_appears_in_the_labelled_corpus() {
    // Một corpus chỉ toàn ca \"đúng hoàn hảo\" sẽ không kiểm được nhánh nào của
    // thuật toán, nên sự hiện diện của cả năm kết luận là một điều kiện của bộ đo.
    let mut seen: Vec<Verdict> = Vec::new();
    for case in corpus() {
        let verdict = check_answer(case.input, &card(&case), case.quiz).verdict;
        if !seen.contains(&verdict) {
            seen.push(verdict);
        }
    }
    println!("── Kết luận xuất hiện trong corpus: {seen:?}");
    for verdict in [
        Verdict::Empty,
        Verdict::Wrong,
        Verdict::Near,
        Verdict::Accepted,
        Verdict::Exact,
    ] {
        assert!(seen.contains(&verdict), "corpus thiếu kết luận {verdict:?}");
    }
}

#[test]
fn scores_are_deterministic_and_ordered_like_the_labels() {
    // Cùng dữ liệu + cùng cấu hình ⇒ cùng điểm. Và điểm phải xếp đúng thứ tự
    // \"chắc chắn đúng > thiếu dấu > gần đúng > sai\".
    for case in corpus() {
        let first = score_answer(case.input, &card(&case), case.quiz, AnswerConfig::default());
        let second = score_answer(case.input, &card(&case), case.quiz, AnswerConfig::default());
        assert_eq!(first.score, second.score, "input: {:?}", case.input);
        assert_eq!(first.verdict, second.verdict, "input: {:?}", case.input);
        // Điểm luôn là một trong bốn mức đã công bố — không có giá trị ngẫu nhiên.
        assert!(
            [0.0, 0.5, 0.9, 1.0].contains(&first.score),
            "điểm ngoài thang: {} cho {:?}",
            first.score,
            case.input
        );
    }

    let card = Card::from_json(
        &json!({ "id": "e", "front": "nghĩa", "back": "意味" }),
        T0,
    )
    .unwrap();
    let exact = score_answer("nghĩa", &card, Quiz::Reading, AnswerConfig::default());
    let accepted = score_answer("nghia", &card, Quiz::Reading, AnswerConfig::default());
    let near = score_answer("nghĩ", &card, Quiz::Reading, AnswerConfig::default());
    let wrong = score_answer("sai", &card, Quiz::Reading, AnswerConfig::default());
    let empty = score_answer("", &card, Quiz::Reading, AnswerConfig::default());
    assert!(exact.score > accepted.score);
    assert!(accepted.score > near.score);
    assert!(near.score > wrong.score);
    assert_eq!(wrong.score, empty.score);
}

#[test]
fn analysis_reports_where_the_new_algorithm_still_says_no() {
    // Nhánh \"gần đúng\" cố ý không được tính là đúng (xem `Verdict::is_correct`).
    // Kiểm lại bằng SỐ: mọi ca nhãn \"gần đúng\" phải có kết luận `Near` chứ không
    // được rơi xuống `Wrong` — rơi xuống `Wrong` là mất thông tin, mà giữ lại
    // thành \"đúng\" là nói dối người học.
    let mut near = 0;
    for case in corpus() {
        if case.group != "gần đúng" {
            continue;
        }
        near += 1;
        let check = check_answer(case.input, &card(&case), case.quiz);
        assert_eq!(check.verdict, Verdict::Near, "input: {:?}", case.input);
        assert!(!check.correct);
        assert_eq!(check.score, 0.5);
    }
    assert!(near > 0, "corpus thiếu ca \"gần đúng\"");
}
