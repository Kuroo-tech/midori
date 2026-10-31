//! Nhập bộ thẻ từ nội dung file: JSON, CSV, TSV.
//!
//! Header được nhận linh hoạt theo nhiều "phương ngữ" dữ liệu đã tồn tại:
//!   - Midori / Mitsuha: `front,back,furigana,romaji,tags`
//!   - bản ghi cũ:       `front,back,reading`
//!   - japanese_tnai:    `vietnamese,kanji,hiragana,romaji,category,lesson`

use std::collections::HashSet;

use serde::Serialize;
use serde_json::Value;

use crate::card::{dedupe_key, split_legacy_reading, Card, CardDraft, Quiz};
use crate::error::{CoreError, CoreResult, ErrorCode};
use crate::json;
use crate::text;

/// Kết quả đọc một file bộ thẻ.
///
/// `skipped` là số BẢN GHI có trong file nhưng không thành thẻ được — dòng thiếu
/// mặt thẻ/mặt nghĩa, phần tử không phải đối tượng, bản ghi thiếu trường bắt buộc.
/// Con số này chỉ có ở ĐÂY vì chỉ nơi này biết luật đọc của từng định dạng; lớp
/// giao diện dùng nó để nói trước khi ghi "bao nhiêu bản ghi sẽ bị bỏ qua" mà
/// không phải đoán lại luật đó bằng JavaScript.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub name: String,
    pub cards: Vec<CardDraft>,
    pub skipped: u32,
}

const DEFAULT_NAME: &str = "Đã import";

/// Đọc file theo phần mở rộng trong tên file.
pub fn parse_deck(text: &str, filename: &str, quiz: Quiz) -> CoreResult<ImportResult> {
    let lower = filename.to_lowercase();
    if lower.ends_with(".json") {
        parse_json(text, quiz)
    } else if lower.ends_with(".csv") || lower.ends_with(".tsv") || lower.ends_with(".txt") {
        parse_csv(text, quiz)
    } else {
        Err(CoreError::new(
            ErrorCode::UnsupportedFormat,
            "Chỉ hỗ trợ .json, .csv và .tsv",
        ))
    }
}

/// JSON: file `DeckFile` của Midori/Mitsuha hoặc một mảng thẻ.
pub fn parse_json(text: &str, quiz: Quiz) -> CoreResult<ImportResult> {
    let data: Value = serde_json::from_str(text)
        .map_err(|e| CoreError::invalid_json(e.to_string()))?;

    let is_array = data.is_array();
    let cards = if is_array {
        data.as_array()
    } else {
        data.get("cards").and_then(Value::as_array)
    };
    let Some(cards) = cards else {
        return Err(CoreError::new(
            ErrorCode::InvalidJson,
            "Sai JSON: không thấy mảng \"cards\"",
        ));
    };

    let cleaned: Vec<CardDraft> = cards
        .iter()
        .filter_map(|raw| CardDraft::from_json(raw, quiz))
        .collect();
    if cleaned.is_empty() {
        return Err(CoreError::new(
            ErrorCode::NoValidRecords,
            "Không có thẻ hợp lệ nào trong file",
        ));
    }
    // Đếm phần bị bỏ: mỗi phần tử trong `cards` không thành nháp được là một bản
    // ghi hỏng (thiếu mặt thẻ/mặt nghĩa, hoặc không phải đối tượng).
    let skipped = cards.len().saturating_sub(cleaned.len()) as u32;

    let name = if is_array {
        DEFAULT_NAME.to_string()
    } else {
        let declared = json::string(&data, "name");
        if declared.is_empty() {
            DEFAULT_NAME.to_string()
        } else {
            declared
        }
    };

    Ok(ImportResult {
        name,
        cards: cleaned,
        skipped,
    })
}

/// CSV/TSV: header linh hoạt; không có header thì thứ tự là
/// `front,back,furigana,romaji,tags`.
///
/// Ô được trích dẫn (`"…"`) là một ô NGUYÊN VẸN: dấu phân cách và dấu xuống dòng
/// bên trong nó thuộc về nội dung, không phải cú pháp. Đó chính là dạng
/// `export::to_csv` ghi ra, nên một file xuất rồi nhập lại phải giữ đủ dữ liệu.
pub fn parse_csv(text: &str, quiz: Quiz) -> CoreResult<ImportResult> {
    let body = text.strip_prefix('\u{feff}').unwrap_or(text);
    let rows = split_records(body);

    if rows.is_empty() {
        return Err(CoreError::new(ErrorCode::EmptyInput, "File rỗng"));
    }

    let header: Vec<String> = rows[0].iter().map(|h| h.value.trim().to_lowercase()).collect();
    let has_header = header.iter().any(|h| ANY_ALIASES.contains(&h.as_str()));

    let columns = if has_header {
        columns_from_header(&header, quiz)
    } else {
        Columns::positional()
    };
    let body_rows = if has_header { &rows[1..] } else { &rows[..] };

    let mut cleaned = Vec::new();
    let mut skipped = 0u32;
    for row in body_rows {
        let front = columns.cell_at(row, columns.front).to_string();
        let back = columns.cell_at(row, columns.back).to_string();
        if front.is_empty() || back.is_empty() {
            // Dòng có trong file nhưng thiếu một mặt: bỏ qua và ĐẾM, để lớp giao
            // diện nói được trước khi ghi rằng bao nhiêu dòng sẽ không vào thư viện.
            skipped += 1;
            continue;
        }

        let mut furigana = columns.cell(row, columns.furigana).to_string();
        let mut romaji = columns.cell(row, columns.romaji).to_string();
        // Cột `reading` là trường cũ: tách theo hệ chữ (ADR-007). Nó là NGUỒN BỔ
        // SUNG, không phải thay thế: một file có cả `reading` lẫn `romaji` phải giữ
        // được cả hai, thay vì lặng lẽ bỏ cột `reading`.
        if let Some(index) = columns.reading {
            let legacy = columns.cell_at(row, index);
            if !legacy.is_empty() {
                let (kana, latin) = split_legacy_reading(legacy);
                if furigana.is_empty() {
                    furigana = kana.unwrap_or_default();
                }
                if romaji.is_empty() {
                    romaji = latin.unwrap_or_default();
                }
            }
        }

        let tags = columns.tags_of(row);
        // Cột `lesson` chuyên dụng thắng tag: file có cả `category` lẫn `lesson`
        // từng bị đọc thành tag nên số bài rơi mất (lỗi thật gặp khi nhập CSV
        // japanese_tnai). Giá trị vẫn nhận cả dạng số lẫn "bài 12".
        let lesson = columns
            .lesson
            .and_then(|index| {
                let raw = columns.cell_at(row, index);
                if raw.is_empty() {
                    None
                } else {
                    text::lesson_from_tags(&[raw.to_string()])
                }
            })
            .or_else(|| text::lesson_from_tags(&tags));

        let id = match columns.cell(row, columns.id) {
            "" => None,
            value => Some(value.to_string()),
        };

        cleaned.push(CardDraft {
            id,
            front,
            back,
            furigana,
            romaji,
            tags,
            lesson,
        });
    }

    if cleaned.is_empty() {
        return Err(CoreError::new(
            ErrorCode::NoValidRecords,
            "Không có thẻ hợp lệ nào trong file",
        ));
    }

    Ok(ImportResult {
        name: DEFAULT_NAME.to_string(),
        cards: cleaned,
        skipped,
    })
}

// ── Header ──────────────────────────────────────────────────────────────

const ANY_ALIASES: &[&str] = &[
    "id",
    "front",
    "back",
    "vi",
    "ja",
    "vietnamese",
    "kanji",
    "hiragana",
    "romaji",
    "reading",
    "furigana",
    "tags",
    "category",
    "lesson",
    "nghĩa việt",
    "tiếng việt",
];

/// Cột id ổn định — cho phép bảo trì nội dung xuất bản bằng CSV.
const ID_COLUMN: &[&str] = &["id", "cardid", "card id", "source", "sourceid", "source id"];
const FRONT_MEANING: &[&str] = &["front", "vi", "vietnamese", "tiếng việt", "nghĩa việt"];
const FRONT_READING: &[&str] = &["front", "kanji", "chữ"];
const BACK_MEANING: &[&str] = &[
    "back",
    "ja",
    "japanese",
    "kanji",
    "hiragana",
    "kana",
    "tiếng nhật",
];
const BACK_READING: &[&str] = &["back", "vietnamese", "vi", "nghĩa", "nghĩa việt"];
const FURIGANA: &[&str] = &["furigana", "hiragana", "kana", "cách đọc", "cach doc"];
const ROMAJI: &[&str] = &["romaji", "romanji", "phiên âm", "phien am"];
const READING: &[&str] = &["reading"];
const TAGS: &[&str] = &["tags", "tag", "category"];
const LESSON: &[&str] = &["lesson", "lessonnumber", "lesson number", "bài", "bai"];

#[derive(Debug, Clone, Copy)]
struct Columns {
    id: Option<usize>,
    front: usize,
    back: usize,
    furigana: Option<usize>,
    romaji: Option<usize>,
    /// Cột cũ `reading` (Mitsuha) — nguồn bổ sung cho `furigana`/`romaji`.
    reading: Option<usize>,
    tags: Option<usize>,
    /// Cột số bài chuyên dụng. Tách khỏi `tags` để `category` + `lesson` cùng
    /// tồn tại mà không nuốt mất số bài.
    lesson: Option<usize>,
}

impl Columns {
    /// File không có header: `front,back,furigana,romaji,tags`.
    fn positional() -> Self {
        Self {
            id: None,
            front: 0,
            back: 1,
            furigana: Some(2),
            romaji: Some(3),
            reading: None,
            tags: Some(4),
            lesson: None,
        }
    }

    /// Ô tuỳ chọn: cột không tồn tại ⇒ chuỗi rỗng.
    fn cell<'a>(&self, row: &'a [Cell], index: Option<usize>) -> &'a str {
        index.map(|i| self.cell_at(row, i)).unwrap_or("")
    }

    /// Ô bắt buộc: dòng thiếu ô ⇒ chuỗi rỗng ⇒ dòng đó bị bỏ qua.
    fn cell_at<'a>(&self, row: &'a [Cell], index: usize) -> &'a str {
        row.get(index).map(Cell::trimmed).unwrap_or("")
    }

    /// Nhãn của dòng.
    ///
    /// `export::to_csv` nối các tag bằng `;` rồi bọc ô trong dấu nháy khi nội dung
    /// có dấu phẩy, nên trong ô TRÍCH DẪN dấu phẩy là nội dung của tag còn `;`
    /// vẫn là dấu phân cách. Ô không trích dẫn giữ luật cũ (`,`, `;`, `|`) để đọc
    /// được file do người dùng tự viết.
    fn tags_of(&self, row: &[Cell]) -> Vec<String> {
        let Some(index) = self.tags else {
            return Vec::new();
        };
        let Some(cell) = row.get(index) else {
            return Vec::new();
        };
        let value = cell.trimmed();
        if value.is_empty() {
            return Vec::new();
        }
        let separators: &[char] = if cell.quoted { &[';', '|'] } else { &[';', ',', '|'] };
        value
            .split(separators)
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .collect()
    }
}

fn columns_from_header(header: &[String], quiz: Quiz) -> Columns {
    let find = |names: &[&str]| -> Option<usize> {
        header.iter().position(|h| names.contains(&h.as_str()))
    };

    let front_names = match quiz {
        Quiz::Reading => FRONT_READING,
        Quiz::Meaning => FRONT_MEANING,
    };
    let back_names = match quiz {
        Quiz::Reading => BACK_READING,
        Quiz::Meaning => BACK_MEANING,
    };

    let id = find(ID_COLUMN);
    let front_found = find(front_names);
    let back_found = find(back_names);
    let furigana = find(FURIGANA);
    let reading = find(READING);
    let romaji = find(ROMAJI);
    let tags = find(TAGS);
    let lesson = find(LESSON);

    let front = front_found.unwrap_or(0);
    let back = back_found.unwrap_or(1);

    // Cột đã bị một trường CÓ TÊN chiếm thì không được dùng làm mặc định theo vị
    // trí. Trước đây `front,back,tags` khiến cột tags trở thành furigana,
    // `id,front,back` chép mặt sau vào furigana, và `front,back,romaji` ghi romaji
    // vào cả hai trường.
    let claimed: Vec<usize> = [id, front_found, back_found, furigana, reading, romaji, tags, lesson]
        .into_iter()
        .flatten()
        .chain([front, back])
        .collect();
    let free = |index: usize| index < header.len() && !claimed.contains(&index);

    Columns {
        id,
        front,
        back,
        // Không có cột furigana: dùng cột 2 nếu vị trí đó chưa bị trường khác chiếm.
        furigana: furigana.or_else(|| free(2).then_some(2)),
        romaji,
        reading,
        tags: tags.or_else(|| free(4).then_some(4)),
        lesson,
    }
}

/// Một ô CSV/TSV: giá trị thô và việc ô đó có được trích dẫn đầy đủ hay không.
///
/// Biết "có trích dẫn" là cần thiết, không phải trang trí: dấu phẩy và dấu xuống
/// dòng bên trong ô trích dẫn thuộc về NỘI DUNG, nên các quy tắc tách ô phải biết
/// ô nào được bảo vệ.
#[derive(Debug, Clone)]
struct Cell {
    value: String,
    quoted: bool,
}

impl Cell {
    fn trimmed(&self) -> &str {
        self.value.trim()
    }
}

/// Tách toàn bộ nội dung file thành các bản ghi.
///
/// Khác cách đọc theo từng dòng: ô trích dẫn có thể chứa dấu xuống dòng. Người
/// dùng dán nghĩa nhiều dòng vào thẻ, `export::to_csv` ghi ra đúng dạng trích dẫn
/// đó — đọc theo dòng sẽ cắt đôi bản ghi và làm hỏng cả file khi nhập lại.
///
/// Dấu `"` chỉ MỞ ô trích dẫn khi nó đứng ở đầu ô; một dấu nháy gõ lạc giữa chữ
/// (`Anh "ấy`) vì thế vẫn là ký tự thường thay vì nuốt dấu phân cách phía sau.
///
/// Dòng trống bị bỏ qua (không phải bản ghi); dòng chỉ có dấu phân cách vẫn được
/// giữ để được đếm là bản ghi thiếu mặt thẻ.
fn split_records(text: &str) -> Vec<Vec<Cell>> {
    let mut records: Vec<Vec<Cell>> = Vec::new();
    let mut cells: Vec<Cell> = Vec::new();
    let mut field = String::new();
    let mut quoted = false;
    let mut in_quotes = false;
    let mut at_field_start = true;
    let mut chars = text.chars().peekable();

    while let Some(ch) = chars.next() {
        if in_quotes {
            match ch {
                '"' if chars.peek() == Some(&'"') => {
                    field.push('"');
                    chars.next();
                }
                '"' => in_quotes = false,
                // Chuẩn hoá CRLF trong ô trích dẫn về LF: cùng một nội dung phải
                // cho ra cùng một giá trị, bất kể file dùng kiểu xuống dòng nào.
                '\r' => {
                    if chars.peek() == Some(&'\n') {
                        chars.next();
                    }
                    field.push('\n');
                }
                other => field.push(other),
            }
            continue;
        }

        match ch {
            '"' if at_field_start => {
                in_quotes = true;
                quoted = true;
                at_field_start = false;
            }
            ',' | '\t' => {
                push_cell(&mut cells, &mut field, &mut quoted);
                at_field_start = true;
            }
            '\r' | '\n' => {
                if ch == '\r' && chars.peek() == Some(&'\n') {
                    chars.next();
                }
                push_cell(&mut cells, &mut field, &mut quoted);
                push_record(&mut records, &mut cells);
                at_field_start = true;
            }
            other => {
                field.push(other);
                at_field_start = false;
            }
        }
    }

    // Dòng cuối không có dấu xuống dòng.
    if !field.is_empty() || !cells.is_empty() || quoted || in_quotes {
        push_cell(&mut cells, &mut field, &mut quoted);
        push_record(&mut records, &mut cells);
    }

    records
}

fn push_cell(cells: &mut Vec<Cell>, field: &mut String, quoted: &mut bool) {
    cells.push(Cell {
        value: std::mem::take(field),
        quoted: *quoted,
    });
    *quoted = false;
}

fn push_record(records: &mut Vec<Vec<Cell>>, cells: &mut Vec<Cell>) {
    let blank = cells.len() == 1 && cells[0].value.trim().is_empty() && !cells[0].quoted;
    if blank {
        cells.clear();
        return;
    }
    records.push(std::mem::take(cells));
}

// ── Nhập vào thư viện ───────────────────────────────────────────────────

/// Kết quả lập kế hoạch nhập: thẻ mới cần thêm và số nháp bị bỏ qua.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlan {
    pub fresh: Vec<Card>,
    pub skipped: u32,
}

/// Quyết định nháp nào là thẻ mới: bỏ trùng theo `front` + `back` trong CÙNG bộ.
///
/// `ids` do lớp nền tảng sinh (UUID của trình duyệt) — Rust không tự sinh id.
/// Thẻ trùng được giữ nguyên trong thư viện, không bị ghi đè.
pub fn plan_import(
    existing: &[Card],
    drafts: &[CardDraft],
    deck_id: &str,
    ids: &[String],
    now: i64,
) -> CoreResult<ImportPlan> {
    if ids.len() != drafts.len() {
        return Err(CoreError::invalid_argument("ids").detail(format!(
            "cần {} id, nhận {}",
            drafts.len(),
            ids.len()
        )));
    }
    // Id rỗng tạo ra thẻ không thể đọc lại: `cards_normalize` sẽ coi bản ghi đó là
    // hỏng và cách ly nó. Cùng luật với `card_make` của hợp đồng WASM.
    if ids.iter().any(|id| id.trim().is_empty()) {
        return Err(CoreError::invalid_argument("ids").detail("id thẻ không được rỗng"));
    }

    // Bỏ trùng theo hai cách: nội dung hiển thị (ý định người dùng) và id
    // (danh tính nội dung — không bao giờ ghi đè thẻ đang có).
    let mut seen: HashSet<String> = HashSet::new();
    for card in existing {
        seen.insert(card.id.clone());
        if card.deck_id == deck_id {
            seen.insert(card.key());
        }
    }

    let mut fresh = Vec::new();
    let mut skipped = 0u32;
    for (draft, id) in drafts.iter().zip(ids) {
        let known_id = draft.id.as_ref().is_some_and(|draft_id| seen.contains(draft_id));
        let key = dedupe_key(&draft.front, &draft.back);
        if known_id || !seen.insert(key) {
            skipped += 1;
            continue;
        }
        fresh.push(Card::make(draft, id.clone(), deck_id, now));
    }

    Ok(ImportPlan { fresh, skipped })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meaning() -> Quiz {
        Quiz::Meaning
    }

    #[test]
    fn dispatches_by_extension() {
        assert!(parse_deck(r#"[{"front":"a","back":"b"}]"#, "x.json", meaning()).is_ok());
        assert!(parse_deck("front,back\nA,B\n", "x.CSV", meaning()).is_ok());
        let err = parse_deck("a,b", "x.xlsx", meaning()).unwrap_err();
        assert_eq!(err.code, "unsupported_format");
    }

    #[test]
    fn reads_midori_deck_file() {
        let text = r#"{"id":"vocabulary","name":"Từ vựng","version":2,"cards":[
            {"front":"Xin chào","back":"こんにちは","romaji":"konnichiwa","tags":["bài 1"]},
            {"front":"","back":"bỏ qua vì thiếu mặt trước"}
        ]}"#;
        let out = parse_json(text, meaning()).unwrap();
        assert_eq!(out.name, "Từ vựng");
        assert_eq!(out.cards.len(), 1);
        assert_eq!(out.cards[0].lesson, Some(1));
    }

    #[test]
    fn reads_a_bare_array_and_names_it() {
        let text = r#"[{"front":"a","back":"b"}]"#;
        let out = parse_json(text, meaning()).unwrap();
        assert_eq!(out.name, "Đã import");
        assert_eq!(out.cards.len(), 1);
    }

    #[test]
    fn rejects_json_without_a_cards_array() {
        let err = parse_json(r#"{"name":"x"}"#, meaning()).unwrap_err();
        assert_eq!(err.code, "invalid_json");
        let err = parse_json("{not json", meaning()).unwrap_err();
        assert_eq!(err.code, "invalid_json");
    }

    #[test]
    fn rejects_files_with_no_valid_cards() {
        let err = parse_json(r#"[{"front":""}]"#, meaning()).unwrap_err();
        assert_eq!(err.code, "no_valid_records");
    }

    #[test]
    fn counts_json_records_that_could_not_be_read() {
        // Hai bản ghi hỏng: một thiếu mặt sau, một không phải đối tượng.
        let text = r#"[{"front":"a","back":"b"},{"front":"c"},"nope",42]"#;
        let out = parse_json(text, meaning()).unwrap();
        assert_eq!(out.cards.len(), 1);
        assert_eq!(out.skipped, 3);
    }

    #[test]
    fn counts_csv_rows_missing_a_face() {
        let text = "front,back\nA,B\n,C\nD,\n";
        let out = parse_csv(text, meaning()).unwrap();
        assert_eq!(out.cards.len(), 1);
        assert_eq!(out.skipped, 2);
    }

    #[test]
    fn a_fully_valid_file_skips_nothing() {
        let csv = parse_csv("front,back,furigana,romaji,tags\nA,B,C,D,bài 1\n", meaning()).unwrap();
        assert_eq!(csv.skipped, 0);
        let json = parse_json(r#"{"cards":[{"front":"a","back":"b"}]}"#, meaning()).unwrap();
        assert_eq!(json.skipped, 0);
    }

    #[test]
    fn reads_csv_with_header() {
        let text = "front,back,furigana,romaji,tags\nXin chào,こんにちは,こんにちは,konnichiwa,bài 1\n";
        let out = parse_csv(text, meaning()).unwrap();
        assert_eq!(out.cards.len(), 1);
        assert_eq!(out.cards[0].romaji, "konnichiwa");
        assert_eq!(out.cards[0].lesson, Some(1));
    }

    #[test]
    fn reads_japanese_tnai_header_and_maps_quiz_sides() {
        let text = "vietnamese,kanji,hiragana,romaji,category\nXin chào,こんにちは,こんにちは,konnichiwa,bài 1\n";
        let out = parse_csv(text, meaning()).unwrap();
        assert_eq!(out.cards[0].front, "Xin chào");
        assert_eq!(out.cards[0].back, "こんにちは");
        assert_eq!(out.cards[0].romaji, "konnichiwa");

        let out = parse_csv(text, Quiz::Reading).unwrap();
        assert_eq!(out.cards[0].front, "こんにちは");
        assert_eq!(out.cards[0].back, "Xin chào");
    }

    #[test]
    fn reads_headerless_csv_positionally() {
        let text = "Xin chào,こんにちは,こんにちは,konnichiwa,nhóm a\nTạm biệt,さようなら,,sayounara,nhóm b\n";
        let out = parse_csv(text, meaning()).unwrap();
        assert_eq!(out.cards.len(), 2);
        assert_eq!(out.cards[1].tags, vec!["nhóm b"]);
    }

    #[test]
    fn respects_quoted_fields_containing_commas() {
        let text = "front,back\n\"Xin chào, bạn\",こんにちは\n";
        let out = parse_csv(text, meaning()).unwrap();
        assert_eq!(out.cards[0].front, "Xin chào, bạn");
    }

    #[test]
    fn escaped_quotes_inside_a_field_survive() {
        let text = "front,back\n\"Anh ấy nói \"\"xin chào\"\"\",こんにちは\n";
        let out = parse_csv(text, meaning()).unwrap();
        assert_eq!(out.cards[0].front, "Anh ấy nói \"xin chào\"");
    }

    #[test]
    fn strips_utf8_bom_and_crlf() {
        let text = "\u{feff}front,back\r\nA,B\r\n";
        let out = parse_csv(text, meaning()).unwrap();
        assert_eq!(out.cards.len(), 1);
        assert_eq!(out.cards[0].front, "A");
    }

    #[test]
    fn tsv_works_with_tabs() {
        let text = "front\tback\nXin chào\tこんにちは\n";
        let out = parse_csv(text, meaning()).unwrap();
        assert_eq!(out.cards[0].back, "こんにちは");
    }

    #[test]
    fn empty_and_header_only_files_are_rejected() {
        assert_eq!(parse_csv("\n\n", meaning()).unwrap_err().code, "empty_input");
        assert_eq!(
            parse_csv("front,back\n", meaning()).unwrap_err().code,
            "no_valid_records"
        );
    }

    // ── Cột theo header không được rò sang trường khác ────────────────

    #[test]
    fn a_named_header_column_is_never_reused_as_another_field() {
        // Trước đây cột thứ 3 bị coi là furigana chỉ vì nó ở vị trí 2, nên
        // `front,back,tags` biến tag thành cách đọc.
        let out = parse_csv("front,back,tags\nA,B,bài 1\n", meaning()).unwrap();
        assert_eq!(out.cards[0].furigana, "");
        assert_eq!(out.cards[0].romaji, "");
        assert_eq!(out.cards[0].tags, vec!["bài 1"]);
        assert_eq!(out.cards[0].lesson, Some(1));

        // `id,front,back` ⇒ cột 2 LÀ mặt sau, không phải furigana.
        let out = parse_csv("id,front,back\nc1,A,B\n", meaning()).unwrap();
        assert_eq!(out.cards[0].furigana, "");
        assert_eq!(out.cards[0].back, "B");

        // Cột `lesson` không được thành furigana.
        let out = parse_csv("front,back,lesson\nA,B,3\n", meaning()).unwrap();
        assert_eq!(out.cards[0].furigana, "");
        assert_eq!(out.cards[0].lesson, Some(3));
    }

    #[test]
    fn csv_lesson_column_survives_alongside_a_tags_column() {
        // Lỗi thật: `category` đứng trước `lesson` làm cột lesson bị bỏ qua, nên
        // nhập "Toàn bộ từ vựng" từ CSV japanese_tnai từ chối cả file dù mỗi dòng
        // đều có số bài. Hai cột phải cùng sống.
        let text = "vietnamese,kanji,hiragana,romaji,category,lesson\nXin chào,こんにちは,こんにちは,konnichiwa,\"chào hỏi, kiểm thử\",50\n";
        let out = parse_csv(text, meaning()).unwrap();
        assert_eq!(out.cards[0].lesson, Some(50));
        // Ô trích dẫn giữ dấu phẩy là nội dung tag, đúng luật `tags_of`.
        assert_eq!(out.cards[0].tags, vec!["chào hỏi, kiểm thử"]);
    }

    #[test]
    fn a_lesson_column_is_not_also_a_tag() {
        let out = parse_csv("front,back,lesson\nA,B,12\n", meaning()).unwrap();
        assert_eq!(out.cards[0].lesson, Some(12));
        assert!(out.cards[0].tags.is_empty());
    }

    #[test]
    fn a_lesson_column_accepts_the_text_form() {
        let out = parse_csv("front,back,lesson\nA,B,Bài 12\n", meaning()).unwrap();
        assert_eq!(out.cards[0].lesson, Some(12));

        // Ô bài trống thì vẫn suy từ tag, không ghi đè bằng None.
        let out = parse_csv("front,back,tags,lesson\nA,B,bài 3,\n", meaning()).unwrap();
        assert_eq!(out.cards[0].lesson, Some(3));
    }

    #[test]
    fn a_romaji_column_does_not_also_fill_furigana() {
        let out = parse_csv("front,back,romaji\nA,B,kana\n", meaning()).unwrap();
        assert_eq!(out.cards[0].romaji, "kana");
        assert_eq!(out.cards[0].furigana, "");
    }

    #[test]
    fn reading_and_romaji_columns_both_survive() {
        // Cột `reading` cũ là nguồn BỔ SUNG: file có cả hai cột phải giữ cả hai.
        let out = parse_csv("front,back,reading,romaji\nXin chào,こんにちは,こんにちは,konnichiwa\n", meaning()).unwrap();
        assert_eq!(out.cards[0].furigana, "こんにちは");
        assert_eq!(out.cards[0].romaji, "konnichiwa");

        // Cột chuyên dụng được khai báo thì nó thắng, `reading` chỉ lấp chỗ trống.
        let out = parse_csv("front,back,romaji,reading\nA,B,kana,かな\n", meaning()).unwrap();
        assert_eq!(out.cards[0].romaji, "kana");
        assert_eq!(out.cards[0].furigana, "かな");
    }

    #[test]
    fn the_positional_headerless_order_is_unchanged() {
        let out = parse_csv("A,B,かな,kana,bài 2\n", meaning()).unwrap();
        assert_eq!(out.cards[0].furigana, "かな");
        assert_eq!(out.cards[0].romaji, "kana");
        assert_eq!(out.cards[0].tags, vec!["bài 2"]);
    }

    // ── Ô trích dẫn nhiều dòng ───────────────────────────────────────

    #[test]
    fn a_quoted_field_may_span_several_lines() {
        let text = "front,back\n\"dòng 1\ndòng 2\",こんにちは\n";
        let out = parse_csv(text, meaning()).unwrap();
        assert_eq!(out.cards.len(), 1);
        assert_eq!(out.cards[0].front, "dòng 1\ndòng 2");
        assert_eq!(out.skipped, 0);
    }

    #[test]
    fn crlf_inside_a_quoted_field_is_normalised() {
        let text = "front,back\r\n\"dòng 1\r\ndòng 2\",B\r\n";
        let out = parse_csv(text, meaning()).unwrap();
        assert_eq!(out.cards[0].front, "dòng 1\ndòng 2");
    }

    #[test]
    fn a_quote_in_the_middle_of_a_field_stays_literal() {
        // Dấu nháy gõ lạc không được nuốt dấu phân cách phía sau.
        let out = parse_csv("front,back\nAnh \"ấy,B\n", meaning()).unwrap();
        assert_eq!(out.cards.len(), 1);
        assert_eq!(out.cards[0].front, "Anh \"ấy");
        assert_eq!(out.cards[0].back, "B");
    }

    #[test]
    fn a_comma_inside_a_quoted_tags_cell_is_part_of_the_tag() {
        // `export::to_csv` nối tag bằng `;` và bọc nháy khi có dấu phẩy.
        let out = parse_csv("front,back,tags\nA,B,\"a,b;c\"\n", meaning()).unwrap();
        assert_eq!(out.cards[0].tags, vec!["a,b", "c"]);

        // Ô không trích dẫn giữ luật tách cũ: `;` và `|` vẫn là dấu phân cách.
        let out = parse_csv("front,back,tags\nA,B,a;b|c\n", meaning()).unwrap();
        assert_eq!(out.cards[0].tags, vec!["a", "b", "c"]);
    }

    #[test]
    fn legacy_reading_column_splits_by_script() {
        // Cột `reading` chứa kana thuần ⇒ vào furigana, không phải romaji.
        let text = "front,back,reading\nXin chào,こんにちは,こんにちは\n";
        let out = parse_csv(text, meaning()).unwrap();
        assert_eq!(out.cards[0].furigana, "こんにちは");
        assert_eq!(out.cards[0].romaji, "");

        let text = "front,back,reading\nXin chào,こんにちは,konnichiwa\n";
        let out = parse_csv(text, meaning()).unwrap();
        assert_eq!(out.cards[0].romaji, "konnichiwa");
        assert_eq!(out.cards[0].furigana, "");
    }

    #[test]
    fn csv_can_carry_stable_content_ids() {
        let text = "id,front,back\nvocabulary::xin-chao,Xin chào,こんにちは\n";
        let out = parse_csv(text, meaning()).unwrap();
        assert_eq!(out.cards[0].id.as_deref(), Some("vocabulary::xin-chao"));
    }

    #[test]
    fn csv_without_an_id_column_leaves_ids_empty() {
        let out = parse_csv("front,back\nA,B\n", meaning()).unwrap();
        assert_eq!(out.cards[0].id, None);
    }



    // ── plan_import ────────────────────────────────────────────────────

    const T0: i64 = 1_700_000_000_000;

    fn existing_card(id: &str, deck: &str, front: &str, back: &str) -> Card {
        Card::from_json(
            &serde_json::json!({ "id": id, "deckId": deck, "front": front, "back": back }),
            T0,
        )
        .unwrap()
    }

    fn draft(front: &str, back: &str) -> CardDraft {
        CardDraft {
            id: None,
            front: front.into(),
            back: back.into(),
            furigana: String::new(),
            romaji: String::new(),
            tags: Vec::new(),
            lesson: None,
        }
    }

    fn ids(n: usize) -> Vec<String> {
        (0..n).map(|i| format!("new-{i}")).collect()
    }

    #[test]
    fn import_skips_duplicates_inside_the_same_deck() {
        let existing = vec![existing_card("e1", "vocabulary", "Xin chào", "こんにちは")];
        let drafts = vec![
            draft("Xin chào", "こんにちは"), // trùng thẻ đã có
            draft("Tạm biệt", "さようなら"),
            draft("Tạm biệt", "さようなら"), // trùng với chính file đang nhập
        ];

        let plan = plan_import(&existing, &drafts, "vocabulary", &ids(3), T0).unwrap();
        assert_eq!(plan.skipped, 2);
        assert_eq!(plan.fresh.len(), 1);
        assert_eq!(plan.fresh[0].front, "Tạm biệt");
        assert_eq!(plan.fresh[0].id, "new-1");
        assert!(plan.fresh[0].srs.is_new());
    }

    #[test]
    fn duplicate_check_is_per_deck() {
        let existing = vec![existing_card("e1", "patterns", "Xin chào", "こんにちは")];
        let drafts = vec![draft("Xin chào", "こんにちは")];
        // Cùng nội dung nhưng khác bộ ⇒ KHÔNG phải trùng
        let plan = plan_import(&existing, &drafts, "vocabulary", &ids(1), T0).unwrap();
        assert_eq!(plan.skipped, 0);
        assert_eq!(plan.fresh.len(), 1);
        assert_eq!(plan.fresh[0].deck_id, "vocabulary");
    }

    #[test]
    fn duplicate_check_ignores_surrounding_whitespace() {
        let existing = vec![existing_card("e1", "vocabulary", "Xin chào", "こんにちは")];
        let drafts = vec![draft("  Xin chào ", " こんにちは ")];
        assert_eq!(
            plan_import(&existing, &drafts, "vocabulary", &ids(1), T0)
                .unwrap()
                .skipped,
            1
        );
    }

    #[test]
    fn import_rejects_a_mismatched_id_count() {
        let err = plan_import(&[], &[draft("a", "b")], "vocabulary", &[], T0).unwrap_err();
        assert_eq!(err.code, "invalid_argument");
    }

    #[test]
    fn import_rejects_an_empty_id() {
        // Id rỗng sinh ra thẻ mà lần nạp sau phải cách ly — chặn ngay tại đây.
        for bad in ["", "   "] {
            let err = plan_import(&[], &[draft("a", "b")], "vocabulary", &[bad.to_string()], T0)
                .unwrap_err();
            assert_eq!(err.code, "invalid_argument", "id: {bad:?}");
        }
    }

    #[test]
    fn importing_into_an_empty_library_keeps_everything() {
        let drafts = vec![draft("a", "b"), draft("c", "d")];
        let plan = plan_import(&[], &drafts, "vocabulary", &ids(2), T0).unwrap();
        assert_eq!(plan.skipped, 0);
        assert_eq!(plan.fresh.len(), 2);
    }
}
