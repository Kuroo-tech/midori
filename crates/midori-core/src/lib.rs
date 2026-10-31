//! # midori-core — lõi nghiệp vụ của Midori
//!
//! Crate này là **toàn bộ logic nghiệp vụ** của Midori: lịch ôn SM-2, mô hình
//! thẻ, đọc/ghi file bộ thẻ, thống kê, lọc, hàng đợi phiên học và chấm câu trả
//! lời. Nó KHÔNG biết gì về WASM, DOM, IndexedDB, Service Worker hay mạng.
//!
//! Hai lớp dùng crate này:
//! - `crates/midori-wasm` — bọc mỏng để chạy trong trình duyệt.
//! - các bài test `cargo test` — chạy native, nhanh và độc lập.
//!
//! Điểm vào dành cho lớp WASM là [`api`], với hợp đồng chuỗi được mô tả trong
//! chính module đó và trong `docs/contract.md`.

#![forbid(unsafe_code)]

pub mod api;
pub mod card;
pub mod content;
pub mod error;
pub mod export;
pub mod import;
pub mod json;
pub mod quiz;
pub mod session;
pub mod srs;
pub mod stats;
pub mod text;

pub use card::{Card, CardDraft, Quiz};
pub use error::{CoreError, CoreResult, ErrorCode};
pub use srs::{Rating, SrsState, WeakReason};

/// Phiên bản của lõi nghiệp vụ (lấy từ `Cargo.toml`).
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
