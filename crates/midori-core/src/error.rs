//! Lỗi có cấu trúc — MỘT quy tắc lỗi duy nhất cho toàn bộ biên Rust/WASM.
//!
//! Mọi lỗi vượt qua biên giới đều có dạng `{ code, message, detail? }`:
//! - `code`    — ổn định, dùng cho logic phía JS (đổi mã = đổi contract)
//! - `message` — tiếng Việt, hiển thị được cho người dùng
//! - `detail`  — ngữ cảnh kỹ thuật, chỉ để gỡ lỗi

use serde::Serialize;

/// Mã lỗi ổn định (xem `docs/contract.md`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    /// Đầu vào không phải JSON đọc được.
    InvalidJson,
    /// Kiểu/giá trị của tham số không hợp lệ.
    InvalidArgument,
    /// Bản ghi thiếu trường bắt buộc hoặc sai định dạng.
    InvalidRecord,
    /// Định dạng file không được hỗ trợ.
    UnsupportedFormat,
    /// File/chuỗi rỗng, không có gì để xử lý.
    EmptyInput,
    /// Đã đọc được file nhưng không có bản ghi nào hợp lệ.
    NoValidRecords,
}

impl ErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            ErrorCode::InvalidJson => "invalid_json",
            ErrorCode::InvalidArgument => "invalid_argument",
            ErrorCode::InvalidRecord => "invalid_record",
            ErrorCode::UnsupportedFormat => "unsupported_format",
            ErrorCode::EmptyInput => "empty_input",
            ErrorCode::NoValidRecords => "no_valid_records",
        }
    }
}

/// Lỗi có cấu trúc đi qua biên WASM.
#[derive(Debug, Clone, Serialize)]
pub struct CoreError {
    pub code: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl CoreError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code: code.as_str(),
            message: message.into(),
            detail: None,
        }
    }

    /// Thêm ngữ cảnh kỹ thuật (không thay `message`).
    pub fn detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }

    pub fn invalid_argument(field: &str) -> Self {
        Self::new(
            ErrorCode::InvalidArgument,
            format!("Tham số không hợp lệ: {field}"),
        )
    }

    pub fn invalid_json(detail: impl Into<String>) -> Self {
        Self::new(ErrorCode::InvalidJson, "Không đọc được JSON").detail(detail)
    }

    pub fn invalid_record(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::InvalidRecord, message)
    }
}

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for CoreError {}

pub type CoreResult<T> = Result<T, CoreError>;
