//! Phân tích văn bản dùng chung: nhận dạng kana/Latin, gộp khoảng trắng,
//! suy ra số bài Minna từ tag.

/// Khoảng kana: Hiragana (3040–309F) + Katakana (30A0–30FF).
pub fn has_kana(s: &str) -> bool {
    s.chars().any(|c| ('\u{3040}'..='\u{30ff}').contains(&c))
}

pub fn has_latin(s: &str) -> bool {
    s.chars().any(|c| c.is_ascii_alphabetic())
}

/// Chuẩn hoá "tương thích" cho văn bản người dùng nhập.
///
/// Xử lý đúng hai trường hợp thực tế gặp phải, KHÔNG thay thế NFKC đầy đủ:
/// 1. Dạng full-width của ASCII (`Ｇｏｏｄ` → `Good`) — bàn phím tiếng Nhật ở
///    chế độ full-width, hoặc dữ liệu copy từ tài liệu CJK.
/// 2. Dấu cách ideographic `U+3000` → dấu cách thường.
///
/// Vì sao không dùng crate NFKC: bảng đầy đủ làm file WASM tăng ~128 KB
/// (đo được, xem `docs/decisions.md`), trong khi các ký tự NFKC xử lý thêm
/// (số khoanh tròn, ký hiệu vuông CJK, katakana nửa độ rộng) không xuất hiện
/// trong dữ liệu thẻ của Midori.
const FULLWIDTH_ASCII_START: u32 = 0xFF01;
const FULLWIDTH_ASCII_END: u32 = 0xFF5E;
/// Khoảng cách offset giữa dạng full-width và ASCII.
const FULLWIDTH_ASCII_OFFSET: u32 = 0xFEE0;
const IDEOGRAPHIC_SPACE: char = '\u{3000}';

pub fn compat_normalize(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c == IDEOGRAPHIC_SPACE {
                return ' ';
            }
            let code = c as u32;
            if (FULLWIDTH_ASCII_START..=FULLWIDTH_ASCII_END).contains(&code) {
                if let Some(ascii) = char::from_u32(code - FULLWIDTH_ASCII_OFFSET) {
                    return ascii;
                }
            }
            c
        })
        .collect()
}

/// Gộp mọi khoảng trắng liên tiếp thành một dấu cách và cắt hai đầu.
/// Dùng cho so khớp đáp án — KHÔNG bỏ dấu (dấu là thông tin).
pub fn collapse_whitespace(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut pending_space = false;
    for ch in s.trim().chars() {
        if ch.is_whitespace() {
            pending_space = !out.is_empty();
        } else {
            if pending_space {
                out.push(' ');
                pending_space = false;
            }
            out.push(ch);
        }
    }
    out
}

/// Quy một chữ cái tiếng Việt về chữ cái gốc KHÔNG DẤU, viết thường.
///
/// Chỉ xử lý bảng chữ cái tiếng Việt (kể cả `đ` → `d`); mọi ký tự khác đi qua
/// nguyên vẹn. Dùng cho phép so khớp "gõ thiếu dấu" — người Việt gõ nhanh rất
/// hay bỏ dấu, và bắt họ sai vì thiếu dấu là trừng phạt bàn phím chứ không phải
/// trừng phạt kiến thức.
///
/// Vì sao là bảng tường minh chứ không phải NFD/NFKC: cùng lý do như
/// [`compat_normalize`] — bảng phân rã đầy đủ của Unicode làm file WASM phình
/// thêm hàng trăm KB cho những ký tự không hề xuất hiện trong dữ liệu thẻ.
pub fn fold_vietnamese_char(c: char) -> char {
    match c {
        // a / ă / â + năm dấu thanh, chữ thường và chữ hoa
        'a' | 'à' | 'á' | 'ả' | 'ã' | 'ạ' | 'ă' | 'ằ' | 'ắ' | 'ẳ' | 'ẵ' | 'ặ' | 'â' | 'ầ'
        | 'ấ' | 'ẩ' | 'ẫ' | 'ậ' | 'A' | 'À' | 'Á' | 'Ả' | 'Ã' | 'Ạ' | 'Ă' | 'Ằ' | 'Ắ' | 'Ẳ'
        | 'Ẵ' | 'Ặ' | 'Â' | 'Ầ' | 'Ấ' | 'Ẩ' | 'Ẫ' | 'Ậ' => 'a',
        // e / ê
        'e' | 'è' | 'é' | 'ẻ' | 'ẽ' | 'ẹ' | 'ê' | 'ề' | 'ế' | 'ể' | 'ễ' | 'ệ' | 'E' | 'È'
        | 'É' | 'Ẻ' | 'Ẽ' | 'Ẹ' | 'Ê' | 'Ề' | 'Ế' | 'Ể' | 'Ễ' | 'Ệ' => 'e',
        // i
        'i' | 'ì' | 'í' | 'ỉ' | 'ĩ' | 'ị' | 'I' | 'Ì' | 'Í' | 'Ỉ' | 'Ĩ' | 'Ị' => 'i',
        // o / ô / ơ
        'o' | 'ò' | 'ó' | 'ỏ' | 'õ' | 'ọ' | 'ô' | 'ồ' | 'ố' | 'ổ' | 'ỗ' | 'ộ' | 'ơ' | 'ờ'
        | 'ớ' | 'ở' | 'ỡ' | 'ợ' | 'O' | 'Ò' | 'Ó' | 'Ỏ' | 'Õ' | 'Ọ' | 'Ô' | 'Ồ' | 'Ố' | 'Ổ'
        | 'Ỗ' | 'Ộ' | 'Ơ' | 'Ờ' | 'Ớ' | 'Ở' | 'Ỡ' | 'Ợ' => 'o',
        // u / ư
        'u' | 'ù' | 'ú' | 'ủ' | 'ũ' | 'ụ' | 'ư' | 'ừ' | 'ứ' | 'ử' | 'ữ' | 'ự' | 'U' | 'Ù'
        | 'Ú' | 'Ủ' | 'Ũ' | 'Ụ' | 'Ư' | 'Ừ' | 'Ứ' | 'Ử' | 'Ữ' | 'Ự' => 'u',
        // y
        'y' | 'ỳ' | 'ý' | 'ỷ' | 'ỹ' | 'ỵ' | 'Y' | 'Ỳ' | 'Ý' | 'Ỷ' | 'Ỹ' | 'Ỵ' => 'y',
        // d / đ — đ là chữ cái riêng nhưng gõ không dấu thì thành d
        'd' | 'đ' | 'D' | 'Đ' => 'd',
        other => other,
    }
}

/// Bỏ dấu cả chuỗi và hạ về chữ thường. `nghĩa` → `nghia`, `Đường` → `duong`.
pub fn fold_vietnamese(s: &str) -> String {
    s.chars()
        .map(|c| fold_vietnamese_char(c).to_ascii_lowercase())
        .collect()
}

/// Số bài hợp lệ trong chuỗi "bài N" / "lesson N" / "N".
pub const LESSON_MIN: u32 = 1;
pub const LESSON_MAX: u32 = 50;

/// Suy ra số bài Minna từ tag. Không tìm thấy ⇒ `None` (không đoán bừa).
pub fn lesson_from_tags(tags: &[String]) -> Option<u32> {
    tags.iter().find_map(|tag| lesson_from_tag(tag))
}

fn lesson_from_tag(tag: &str) -> Option<u32> {
    let lower = tag.to_lowercase();
    for keyword in ["bài", "bai", "lesson"] {
        if let Some(pos) = lower.find(keyword) {
            let rest = lower[pos + keyword.len()..].trim_start();
            // Tối đa 2 chữ số, tham lam từ trái sang phải.
            let digits: String = rest.chars().take_while(char::is_ascii_digit).take(2).collect();
            if let Ok(n) = digits.parse::<u32>() {
                if in_lesson_range(n) {
                    return Some(n);
                }
            }
        }
    }

    // Tag chỉ là số: "3", "12"
    let t = tag.trim();
    if !t.is_empty() && t.len() <= 2 && t.chars().all(|c| c.is_ascii_digit()) {
        if let Ok(n) = t.parse::<u32>() {
            if in_lesson_range(n) {
                return Some(n);
            }
        }
    }
    None
}

fn in_lesson_range(n: u32) -> bool {
    (LESSON_MIN..=LESSON_MAX).contains(&n)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tags(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn detects_script() {
        assert!(has_kana("こんにちは"));
        assert!(has_kana("カタカナ"));
        assert!(!has_kana("kanji"));
        assert!(has_latin("romaji"));
        assert!(!has_latin("私"));
        assert!(!has_latin("こんにちは"));
    }

    #[test]
    fn collapses_whitespace_without_stripping_diacritics() {
        assert_eq!(collapse_whitespace("  xin   chào  "), "xin chào");
        assert_eq!(collapse_whitespace("\txin\nchào"), "xin chào");
        assert_eq!(collapse_whitespace("   "), "");
        assert_eq!(collapse_whitespace("nghĩa"), "nghĩa");
    }

    #[test]
    fn reads_lesson_numbers() {
        assert_eq!(lesson_from_tags(&tags(&["bài 3"])), Some(3));
        assert_eq!(lesson_from_tags(&tags(&["Bài 12"])), Some(12));
        assert_eq!(lesson_from_tags(&tags(&["lesson 7"])), Some(7));
        assert_eq!(lesson_from_tags(&tags(&["bai 25"])), Some(25));
        assert_eq!(lesson_from_tags(&tags(&["3"])), Some(3));
        // không phải số bài
        assert_eq!(lesson_from_tags(&tags(&["bài 51"])), None);
        assert_eq!(lesson_from_tags(&tags(&["bài 0"])), None);
        assert_eq!(lesson_from_tags(&tags(&["123"])), None);
        assert_eq!(lesson_from_tags(&tags(&["n5", "từ vựng"])), None);
        assert_eq!(lesson_from_tags(&[]), None);
        // tham lam tối đa 2 chữ số, giống bản JS gốc: "bài 123" ⇒ 12
        assert_eq!(lesson_from_tags(&tags(&["bài 123"])), Some(12));
    }

    #[test]
    fn lesson_scans_all_tags() {
        assert_eq!(lesson_from_tags(&tags(&["nhóm a", "bài 9"])), Some(9));
    }

    #[test]
    fn compat_normalize_folds_fullwidth_ascii() {
        assert_eq!(compat_normalize("Ｇｏｏｄ"), "Good");
        assert_eq!(compat_normalize("１２３"), "123");
        assert_eq!(compat_normalize("ＡＢＣ"), "ABC");
        // Dấu cách ideographic
        assert_eq!(compat_normalize("a\u{3000}b"), "a b");
    }

    #[test]
    fn folds_vietnamese_diacritics_to_base_letters() {
        assert_eq!(fold_vietnamese("nghĩa"), "nghia");
        assert_eq!(fold_vietnamese("Đường"), "duong");
        assert_eq!(fold_vietnamese("ĐẶT CƠM"), "dat com");
        assert_eq!(fold_vietnamese("khuyến mãi"), "khuyen mai");
        // Dấu thanh trên mọi nguyên âm của bảng chữ cái
        assert_eq!(fold_vietnamese("àáảãạ"), "aaaaa");
        assert_eq!(fold_vietnamese("ằắẳẵặ"), "aaaaa");
        assert_eq!(fold_vietnamese("ầấẩẫậ"), "aaaaa");
        assert_eq!(fold_vietnamese("èéẻẽẹ"), "eeeee");
        assert_eq!(fold_vietnamese("ềếểễệ"), "eeeee");
        assert_eq!(fold_vietnamese("ìíỉĩị"), "iiiii");
        assert_eq!(fold_vietnamese("òóỏõọ"), "ooooo");
        assert_eq!(fold_vietnamese("ồốổỗộ"), "ooooo");
        assert_eq!(fold_vietnamese("ờớởỡợ"), "ooooo");
        assert_eq!(fold_vietnamese("ùúủũụ"), "uuuuu");
        assert_eq!(fold_vietnamese("ừứửữự"), "uuuuu");
        assert_eq!(fold_vietnamese("ỳýỷỹỵ"), "yyyyy");
        // Chữ đã không dấu thì giữ nguyên
        assert_eq!(fold_vietnamese("nghia"), "nghia");
    }

    #[test]
    fn folding_leaves_other_scripts_alone() {
        assert_eq!(fold_vietnamese("こんにちは"), "こんにちは");
        assert_eq!(fold_vietnamese("漢字"), "漢字");
        assert_eq!(fold_vietnamese("konnichiwa"), "konnichiwa");
        // Dấu ngoài tiếng Việt (umlaut, mũ ngược, vòng) đi qua nguyên vẹn.
        assert_eq!(fold_vietnamese("über"), "über");
        assert_eq!(fold_vietnamese("mañana"), "mañana");
        assert_eq!(fold_vietnamese("smørrebrød"), "smørrebrød");
        // Nhưng `é` là chữ sắc của tiếng Việt nên vẫn bị bỏ dấu — cố ý.
        assert_eq!(fold_vietnamese("café"), "cafe");
    }

    #[test]
    fn compat_normalize_leaves_other_scripts_alone() {
        // Kana, kanji và chữ Việt có dấu phải đi qua nguyên vẹn.
        assert_eq!(compat_normalize("こんにちは"), "こんにちは");
        assert_eq!(compat_normalize("私"), "私");
        assert_eq!(compat_normalize("nghĩa"), "nghĩa");
        // Katakana nửa độ rộng KHÔNG được xử lý (giới hạn đã biết, có test khoá lại).
        assert_eq!(compat_normalize("ﾊﾛｰ"), "ﾊﾛｰ");
        // Ký tự ngay ngoài khoảng full-width ASCII
        assert_eq!(compat_normalize("\u{FF00}\u{FF5F}"), "\u{FF00}\u{FF5F}");
    }
}
