//! Truy cập `serde_json::Value` theo kiểu "khoan dung".
//!
//! Dữ liệu thẻ đến từ nhiều nguồn (IndexedDB của các phiên bản trước, file người
//! dùng nhập, bản xuất của Mitsuha). Quy tắc: trường thiếu/sai kiểu ⇒ dùng mặc
//! định, KHÔNG làm hỏng cả bản ghi — trừ trường bắt buộc thì báo lỗi rõ ràng.

use serde_json::Value;

/// Chuỗi đã trim; trả `""` nếu thiếu hoặc sai kiểu.
pub fn string(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

/// Chuỗi thô (không trim) — dùng cho nội dung cần giữ nguyên khoảng trắng.
pub fn raw_string(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_string)
}

pub fn opt_string(value: &Value, key: &str) -> Option<String> {
    let s = string(value, key);
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

/// `f64`; chấp nhận cả số nguyên (JSON không phân biệt) và chuỗi số.
pub fn f64_or(value: &Value, key: &str, fallback: f64) -> f64 {
    match value.get(key) {
        Some(Value::Number(n)) => n.as_f64().unwrap_or(fallback),
        Some(Value::String(s)) => s.trim().parse::<f64>().unwrap_or(fallback),
        _ => fallback,
    }
}

/// `i64` — làm tròn số thực về số nguyên gần nhất.
pub fn i64_or(value: &Value, key: &str, fallback: i64) -> i64 {
    let n = f64_or(value, key, fallback as f64);
    if n.is_finite() {
        n.round() as i64
    } else {
        fallback
    }
}

/// `u32` — giá trị âm hoặc không hữu hạn ⇒ mặc định.
pub fn u32_or(value: &Value, key: &str, fallback: u32) -> u32 {
    let n = f64_or(value, key, fallback as f64);
    if n.is_finite() && n >= 0.0 && n <= u32::MAX as f64 {
        n.round() as u32
    } else {
        fallback
    }
}

pub fn opt_u32(value: &Value, key: &str) -> Option<u32> {
    match value.get(key) {
        Some(Value::Number(_)) | Some(Value::String(_)) => {
            let n = f64_or(value, key, 0.0);
            if n.is_finite() && n > 0.0 {
                Some(n.round() as u32)
            } else {
                None
            }
        }
        _ => None,
    }
}

pub fn bool_or(value: &Value, key: &str, fallback: bool) -> bool {
    value
        .get(key)
        .and_then(Value::as_bool)
        .unwrap_or(fallback)
}

/// Mảng chuỗi; bỏ mọi phần tử không phải chuỗi. Thiếu ⇒ mảng rỗng.
pub fn string_list(value: &Value, key: &str) -> Vec<String> {
    match value.get(key) {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

/// Danh sách chuỗi tuỳ chọn: `None` khi trường vắng mặt (khác với mảng rỗng).
pub fn opt_string_list(value: &Value, key: &str) -> Option<Vec<String>> {
    match value.get(key) {
        Some(Value::Array(items)) => Some(
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect(),
        ),
        _ => None,
    }
}

/// Một trường chỉ được coi là "có mặt" khi tồn tại và khác `null`.
pub fn present(value: &Value, key: &str) -> bool {
    matches!(value.get(key), Some(v) if !v.is_null())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn coerce_numbers_from_strings_and_floats() {
        let v = json!({ "a": 3, "b": 2.6, "c": "7", "d": -5, "e": true });
        assert_eq!(u32_or(&v, "a", 0), 3);
        assert_eq!(u32_or(&v, "b", 0), 3); // làm tròn
        assert_eq!(u32_or(&v, "c", 0), 7);
        assert_eq!(u32_or(&v, "d", 9), 9); // âm ⇒ mặc định
        assert_eq!(u32_or(&v, "e", 4), 4); // sai kiểu ⇒ mặc định
        assert_eq!(u32_or(&v, "missing", 1), 1);
    }

    #[test]
    fn opt_u32_treats_zero_and_negative_as_absent() {
        let v = json!({ "zero": 0, "neg": -2, "ok": 5 });
        assert_eq!(opt_u32(&v, "zero"), None);
        assert_eq!(opt_u32(&v, "neg"), None);
        assert_eq!(opt_u32(&v, "ok"), Some(5));
        assert_eq!(opt_u32(&v, "missing"), None);
    }

    #[test]
    fn string_list_drops_non_strings() {
        let v = json!({ "tags": ["a", 3, null, "b"] });
        assert_eq!(string_list(&v, "tags"), vec!["a", "b"]);
        assert_eq!(opt_string_list(&json!({}), "tags"), None);
        assert_eq!(opt_string_list(&v, "tags").unwrap().len(), 2);
    }

    #[test]
    fn string_trims_and_defaults() {
        let v = json!({ "s": "  x  ", "n": 4 });
        assert_eq!(string(&v, "s"), "x");
        assert_eq!(string(&v, "n"), "");
        assert_eq!(opt_string(&v, "n"), None);
        assert!(present(&v, "s") && !present(&v, "gone"));
        assert!(!present(&json!({ "s": null }), "s"));
    }
}
