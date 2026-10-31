//! Xuất bộ thẻ ra nội dung file (JSON/CSV).
//!
//! Chỉ dựng NỘI DUNG và TÊN FILE ở đây; việc tạo Blob rồi tải về là quyền của
//! lớp nền tảng (trình duyệt).

use serde::{Deserialize, Serialize};

use crate::card::{Card, CardDraft};
use crate::error::{CoreError, CoreResult};

/// Tiền tố tên file xuất ra.
const APP_SLUG: &str = "midori";
const DEFAULT_DECK_NAME: &str = "Midori export";
/// Phiên bản schema file bộ thẻ.
const DECK_FILE_VERSION: u32 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Json,
    Csv,
}

impl ExportFormat {
    pub fn parse(value: &str) -> CoreResult<Self> {
        match value {
            "json" => Ok(ExportFormat::Json),
            "csv" => Ok(ExportFormat::Csv),
            _ => Err(CoreError::invalid_argument("format")),
        }
    }
}

/// Nội dung file đã sẵn sàng để lớp nền tảng tải về.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportFile {
    pub filename: String,
    pub mime: String,
    pub text: String,
}

#[derive(Serialize)]
struct DeckFile<'a> {
    id: &'a str,
    name: &'a str,
    version: u32,
    cards: Vec<CardDraft>,
}

/// Dựng file xuất. `date_stamp` do lớp nền tảng cung cấp (dạng `YYYY-MM-DD`)
/// vì Rust không có đồng hồ địa phương trong WASM.
pub fn export(
    cards: &[Card],
    format: ExportFormat,
    deck_name: &str,
    date_stamp: &str,
) -> ExportFile {
    let name = if deck_name.trim().is_empty() {
        DEFAULT_DECK_NAME
    } else {
        deck_name.trim()
    };

    match format {
        ExportFormat::Json => ExportFile {
            filename: format!("{APP_SLUG}-{date_stamp}.json"),
            mime: "application/json".to_string(),
            text: to_json(cards, name),
        },
        ExportFormat::Csv => ExportFile {
            filename: format!("{APP_SLUG}-{date_stamp}.csv"),
            mime: "text/csv".to_string(),
            text: to_csv(cards),
        },
    }
}

/// JSON đảo ngược được bởi `import::parse_json`.
pub fn to_json(cards: &[Card], deck_name: &str) -> String {
    let file = DeckFile {
        id: "export",
        name: deck_name,
        version: DECK_FILE_VERSION,
        cards: cards.iter().map(Card::draft).collect(),
    };
    // Bản xuất cũ dùng thụt lề 2 khoảng trắng; giữ nguyên để diff dễ đọc.
    serde_json::to_string_pretty(&file).unwrap_or_else(|_| "{}".to_string())
}

pub fn to_csv(cards: &[Card]) -> String {
    let head = "front,back,furigana,romaji,tags";
    let mut out = String::from(head);
    out.push('\n');
    for card in cards {
        let fields = [
            card.front.as_str(),
            card.back.as_str(),
            card.furigana.as_str(),
            card.romaji.as_str(),
        ];
        let tags = card.tags.join(";");
        let mut row = fields
            .iter()
            .map(|f| escape_csv(f))
            .collect::<Vec<_>>()
            .join(",");
        row.push(',');
        row.push_str(&escape_csv(&tags));
        out.push_str(&row);
        out.push('\n');
    }
    out.pop(); // không kết thúc bằng dòng trống
    out
}

fn escape_csv(value: &str) -> String {
    if value.contains('"') || value.contains(',') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::card::Quiz;
    use serde_json::json;

    const T0: i64 = 1_700_000_000_000;

    fn cards() -> Vec<Card> {
        vec![
            Card::from_json(
                &json!({
                    "id": "c1", "deckId": "vocabulary", "front": "Xin chào", "back": "こんにちは",
                    "furigana": "こんにちは", "romaji": "konnichiwa", "tags": ["bài 1"],
                    "createdAt": T0, "srs": { "due": T0 }
                }),
                T0,
            )
            .unwrap(),
            Card::from_json(
                &json!({ "id": "c2", "front": "Có, dấu, phẩy", "back": "\"trích\"", "createdAt": T0 }),
                T0,
            )
            .unwrap(),
        ]
    }

    #[test]
    fn json_export_round_trips_through_the_importer() {
        let text = to_json(&cards(), "Bộ của tôi");
        let back = crate::import::parse_json(&text, Quiz::Meaning).unwrap();
        assert_eq!(back.name, "Bộ của tôi");
        assert_eq!(back.cards.len(), 2);
        assert_eq!(back.cards[0].front, "Xin chào");
        assert_eq!(back.cards[0].lesson, Some(1));
        assert_eq!(back.cards[1].back, "\"trích\"");
    }

    #[test]
    fn json_export_carries_no_srs_state() {
        let text = to_json(&cards(), "x");
        assert!(!text.contains("\"srs\""));
        assert!(!text.contains("createdAt"));
        assert!(text.contains("\"version\": 2"));
    }

    #[test]
    fn csv_export_escapes_quotes_commas_and_pipes_tags() {
        let csv = to_csv(&cards());
        let lines: Vec<&str> = csv.split('\n').collect();
        assert_eq!(lines[0], "front,back,furigana,romaji,tags");
        assert_eq!(lines[1], "Xin chào,こんにちは,こんにちは,konnichiwa,bài 1");
        // 5 trường ⇒ 4 dấu phẩy; thẻ này chỉ có 2 trường đầu.
        assert_eq!(lines[2], "\"Có, dấu, phẩy\",\"\"\"trích\"\"\",,,");
        assert!(!csv.ends_with('\n'));
    }

    #[test]
    fn csv_export_round_trips() {
        let csv = to_csv(&cards());
        let back = crate::import::parse_csv(&csv, Quiz::Meaning).unwrap();
        assert_eq!(back.cards.len(), 2);
        assert_eq!(back.cards[1].front, "Có, dấu, phẩy");
        assert_eq!(back.cards[1].back, "\"trích\"");
    }

    #[test]
    fn csv_export_round_trips_multiline_content_and_comma_tags() {
        // Hai thứ mà bộ đọc theo dòng cũ làm mất: mặt thẻ xuống dòng (ô trích dẫn
        // nhiều dòng) và tag có dấu phẩy (bị tách thành hai tag).
        let card = Card::from_json(
            &json!({
                "id": "c1", "front": "dòng 1\ndòng 2", "back": "B",
                "tags": ["a,b", "c"], "createdAt": T0
            }),
            T0,
        )
        .unwrap();
        let csv = to_csv(std::slice::from_ref(&card));
        let back = crate::import::parse_csv(&csv, Quiz::Meaning).unwrap();
        assert_eq!(back.cards.len(), 1);
        assert_eq!(back.cards[0].front, "dòng 1\ndòng 2");
        assert_eq!(back.cards[0].tags, vec!["a,b", "c"]);
    }

    #[test]
    fn filenames_and_mime_follow_the_format() {
        let json_file = export(&cards(), ExportFormat::Json, "x", "2026-10-12");
        assert_eq!(json_file.filename, "midori-2026-10-12.json");
        assert_eq!(json_file.mime, "application/json");

        let csv_file = export(&cards(), ExportFormat::Csv, "x", "2026-10-12");
        assert_eq!(csv_file.filename, "midori-2026-10-12.csv");
        assert_eq!(csv_file.mime, "text/csv");
    }

    #[test]
    fn empty_deck_name_falls_back() {
        let file = export(&[], ExportFormat::Json, "   ", "2026-01-01");
        assert!(file.text.contains(DEFAULT_DECK_NAME));
    }

    #[test]
    fn format_parse_rejects_unknown() {
        assert_eq!(ExportFormat::parse("json").unwrap(), ExportFormat::Json);
        assert!(ExportFormat::parse("xlsx").is_err());
    }
}
