//! Đồng bộ nội dung xuất bản với dữ liệu người học.
//!
//! Đây là cơ chế thi hành yêu cầu "cập nhật nội dung KHÔNG được phá dữ liệu
//! người dùng":
//!
//! | Trường hợp | Hành vi |
//! |---|---|
//! | Thẻ nội dung đã có, nội dung đổi | cập nhật 4 trường nội dung, **giữ nguyên** lịch SRS, id, ngày tạo |
//! | Thẻ nội dung mới | tạo thẻ mới ở trạng thái chưa học |
//! | Thẻ nội dung đã biến mất | **không xoá** — chỉ báo về để giao diện xử lý |
//!
//! Nhờ vậy, người học không bao giờ mất tiến độ vì một lần cập nhật dữ liệu, và
//! một thẻ bị nhà phát hành bỏ đi vẫn còn nguyên lịch ôn của người học.

use std::collections::{HashMap, HashSet};

use serde::Serialize;

use crate::card::{Card, CardDraft};
use crate::error::{CoreError, CoreResult};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileResult {
    /// Thẻ đang có được cập nhật nội dung — lịch SRS giữ nguyên.
    pub updated: Vec<Card>,
    /// Thẻ mới xuất hiện trong nội dung.
    pub fresh: Vec<Card>,
    /// Id thẻ do nội dung quản lý nhưng đã không còn trong nội dung.
    /// KHÔNG bị xoá khỏi dữ liệu người dùng.
    pub orphaned: Vec<String>,
    /// Số thẻ không có gì thay đổi.
    pub unchanged: u32,
}

/// Đối chiếu nội dung mới với thẻ đang có.
///
/// `previous_content_ids` là danh sách id thuộc phiên bản nội dung ĐANG dùng —
/// lớp nền tảng lưu lại khi kích hoạt nội dung. Nhờ nó, ta phân biệt được "thẻ
/// do nội dung quản lý nay đã bị bỏ" với "thẻ người dùng tự tạo trong cùng bộ".
pub fn reconcile(
    user_cards: &[Card],
    content: &[CardDraft],
    previous_content_ids: &[String],
    deck_id: &str,
    now: i64,
) -> CoreResult<ReconcileResult> {
    let content_ids: HashSet<&str> = content
        .iter()
        .map(|draft| {
            draft
                .id
                .as_deref()
                .filter(|id| !id.trim().is_empty())
                .ok_or_else(|| {
                    CoreError::invalid_record("Thẻ trong nội dung xuất bản phải có id ổn định")
                })
        })
        .collect::<CoreResult<_>>()?;

    let existing: HashMap<&str, &Card> = user_cards
        .iter()
        .map(|card| (card.id.as_str(), card))
        .collect();

    let mut updated = Vec::new();
    let mut fresh = Vec::new();
    let mut unchanged = 0u32;

    for draft in content {
        // Đã kiểm tra ở trên: mọi nháp đều có id.
        let id = draft.id.as_deref().unwrap_or_default();
        match existing.get(id) {
            Some(card) => {
                if same_content(&card.draft(), draft) {
                    unchanged += 1;
                } else {
                    updated.push(apply_content(card, draft, deck_id));
                }
            }
            None => fresh.push(Card::make(draft, id, deck_id, now)),
        }
    }

    let orphaned = previous_content_ids
        .iter()
        .filter(|id| !content_ids.contains(id.as_str()))
        .filter(|id| existing.contains_key(id.as_str()))
        .cloned()
        .collect();

    Ok(ReconcileResult {
        updated,
        fresh,
        orphaned,
        unchanged,
    })
}

/// Áp nội dung mới lên thẻ, GIỮ NGUYÊN id, ngày tạo và toàn bộ trạng thái SRS.
///
/// `lesson` đi qua `CardDraft::resolved_lesson` — cùng quy tắc với thẻ MỚI
/// (`Card::make`). Nếu lệch, thẻ mới tạo ở lần đồng bộ đầu sẽ nhận bài suy từ
/// tag nhưng bị lần đồng bộ sau ghi đè thành không bài.
pub fn apply_content(card: &Card, draft: &CardDraft, deck_id: &str) -> Card {
    Card {
        deck_id: deck_id.to_string(),
        front: draft.front.trim().to_string(),
        back: draft.back.trim().to_string(),
        furigana: draft.furigana.trim().to_string(),
        romaji: draft.romaji.trim().to_string(),
        tags: draft.tags.clone(),
        lesson: draft.resolved_lesson(),
        ..card.clone()
    }
}

/// Hai nháp có cùng nội dung hiển thị không (bỏ qua khoảng trắng thừa)?
///
/// `lesson` so bằng giá trị HIỆU DỤNG (`resolved_lesson`): thẻ lưu bài đã suy
/// từ tag, còn nháp thô có thể chỉ có tag — so thẳng trường thô sẽ khiến mỗi lần
/// đồng bộ lại báo "đổi" rồi ghi đè bài.
fn same_content(current: &CardDraft, next: &CardDraft) -> bool {
    current.front.trim() == next.front.trim()
        && current.back.trim() == next.back.trim()
        && current.furigana.trim() == next.furigana.trim()
        && current.romaji.trim() == next.romaji.trim()
        && current.tags == next.tags
        && current.lesson == next.resolved_lesson()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::srs::{Rating, SrsState};

    const T0: i64 = 1_700_000_000_000;
    const LATER: i64 = T0 + 30 * 86_400_000;

    fn draft(id: &str, front: &str, back: &str) -> CardDraft {
        CardDraft {
            id: Some(id.into()),
            front: front.into(),
            back: back.into(),
            furigana: String::new(),
            romaji: String::new(),
            tags: vec![],
            lesson: Some(1),
        }
    }

    /// Thẻ đã học: id cho trước, lịch SRS đã tiến.
    fn learned(id: &str, front: &str, back: &str) -> Card {
        let card = Card::make(&draft(id, front, back), "unused", "vocabulary", T0);
        Card {
            srs: SrsState::new(T0).schedule(Rating::Good, T0).schedule(Rating::Good, T0),
            ..card
        }
    }

    fn ids(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| (*s).to_string()).collect()
    }

    #[test]
    fn a_new_card_in_content_is_created_unlearned() {
        let result = reconcile(&[], &[draft("a", "Xin chào", "こんにちは")], &[], "vocabulary", T0)
            .unwrap();
        assert_eq!(result.fresh.len(), 1);
        assert_eq!(result.fresh[0].id, "a");
        assert!(result.fresh[0].srs.is_new());
        assert!(result.updated.is_empty());
        assert_eq!(result.unchanged, 0);
    }

    #[test]
    fn an_unchanged_card_is_not_rewritten() {
        let card = learned("a", "Xin chào", "こんにちは");
        let result = reconcile(
            &[card],
            &[draft("a", "Xin chào", "こんにちは")],
            &ids(&["a"]),
            "vocabulary",
            LATER,
        )
        .unwrap();
        assert_eq!(result.unchanged, 1);
        assert!(result.updated.is_empty());
        assert!(result.fresh.is_empty());
        assert!(result.orphaned.is_empty());
    }

    #[test]
    fn whitespace_only_differences_do_not_count_as_changes() {
        let card = learned("a", "Xin chào", "こんにちは");
        let result = reconcile(
            &[card],
            &[draft("a", "  Xin chào ", "こんにちは")],
            &ids(&["a"]),
            "vocabulary",
            LATER,
        )
        .unwrap();
        assert_eq!(result.unchanged, 1);
        assert!(result.updated.is_empty());
    }

    #[test]
    fn lesson_from_tags_applies_to_existing_cards_too() {
        // Nháp thô (đường hạt giống/IndexedDB) có thể thiếu trường `lesson` mà
        // chỉ có tag "lesson 4". Thẻ đã có phải nhận cùng bài như thẻ mới.
        let card = learned("a", "A", "あ");
        let mut next = draft("a", "A", "あ");
        next.lesson = None;
        next.tags = vec!["lesson 4".into()];

        let result = reconcile(
            std::slice::from_ref(&card),
            &[next],
            &ids(&["a"]),
            "vocabulary",
            LATER,
        )
        .unwrap();

        assert_eq!(result.updated.len(), 1);
        assert_eq!(result.updated[0].lesson, Some(4));
    }

    #[test]
    fn tag_derived_lesson_does_not_count_as_a_change_on_resync() {
        // Trạng thái sau lần đồng bộ đầu của ca trên: bài đã suy từ tag. Lần
        // đồng bộ lại của CÙNG gói nội dung không được coi là thay đổi — nếu
        // không, nó sẽ ghi đè bài về "không bài".
        let card = Card {
            lesson: Some(4),
            tags: vec!["lesson 4".into()],
            ..learned("a", "A", "あ")
        };
        let mut next = draft("a", "A", "あ");
        next.lesson = None;
        next.tags = vec!["lesson 4".into()];

        let result = reconcile(
            std::slice::from_ref(&card),
            &[next],
            &ids(&["a"]),
            "vocabulary",
            LATER,
        )
        .unwrap();

        assert_eq!(result.unchanged, 1);
        assert!(result.updated.is_empty());
    }

    #[test]
    fn updating_content_preserves_the_whole_srs_schedule() {
        let card = learned("a", "Xin chào", "こんにちは");
        let before = card.srs.clone();

        let result = reconcile(
            std::slice::from_ref(&card),
            &[draft("a", "Xin chào (sửa)", "こんにちは")],
            &ids(&["a"]),
            "vocabulary",
            LATER,
        )
        .unwrap();

        assert_eq!(result.updated.len(), 1);
        let after = &result.updated[0];
        assert_eq!(after.id, card.id);
        assert_eq!(after.created_at, card.created_at);
        assert_eq!(after.srs, before, "lịch SRS phải được giữ nguyên");
        assert_eq!(after.front, "Xin chào (sửa)");
        assert_eq!(after.deck_id, "vocabulary");
    }

    #[test]
    fn content_cards_retarget_to_the_declared_deck() {
        let card = learned("a", "Xin chào", "こんにちは");
        let result = reconcile(
            &[card],
            &[draft("a", "Xin chào", "こんにちは v2")],
            &ids(&["a"]),
            "vocabulary-v2",
            LATER,
        )
        .unwrap();
        assert_eq!(result.updated[0].deck_id, "vocabulary-v2");
    }

    #[test]
    fn a_card_dropped_from_content_is_reported_but_never_deleted() {
        let cards = vec![learned("a", "A", "あ"), learned("b", "B", "い")];
        let result = reconcile(
            &cards,
            &[draft("a", "A", "あ")],
            &ids(&["a", "b"]),
            "vocabulary",
            LATER,
        )
        .unwrap();
        assert_eq!(result.orphaned, ids(&["b"]));
        // Không có nhánh nào trả về việc xoá: người gọi chỉ nhận được danh sách id.
        assert_eq!(result.updated.len(), 0);
        assert_eq!(result.fresh.len(), 0);
    }

    #[test]
    fn user_created_cards_in_the_same_deck_are_not_called_orphans() {
        // Thẻ người dùng tự tạo: id UUID, không nằm trong danh sách nội dung cũ.
        let user_card = learned("9f1c-uuid", "Thẻ của tôi", "わたし");
        let result = reconcile(
            &[user_card],
            &[draft("a", "A", "あ")],
            &ids(&["a"]),
            "vocabulary",
            LATER,
        )
        .unwrap();
        assert!(result.orphaned.is_empty());
        assert_eq!(result.updated.len(), 0);
        assert_eq!(result.fresh.len(), 1);
    }

    #[test]
    fn content_without_a_stable_id_is_rejected() {
        let mut broken = draft("a", "A", "あ");
        broken.id = None;
        let err = reconcile(&[], &[broken], &[], "vocabulary", T0).unwrap_err();
        assert_eq!(err.code, "invalid_record");

        // Id rỗng/ khoảng trắng không phải danh tính ổn định: nhận nó sẽ tạo thẻ
        // mà lần nạp sau phải cách ly.
        for bad_id in ["", "   "] {
            let mut broken = draft("a", "A", "あ");
            broken.id = Some(bad_id.to_string());
            let err = reconcile(&[], &[broken], &[], "vocabulary", T0).unwrap_err();
            assert_eq!(err.code, "invalid_record", "id: {bad_id:?}");
        }
    }

    #[test]
    fn an_empty_manifest_is_a_no_op_not_a_wipe() {
        // Nội dung rỗng: mọi thẻ cũ được báo là orphaned, KHÔNG thẻ nào bị xoá.
        let cards = vec![learned("a", "A", "あ")];
        let result = reconcile(&cards, &[], &ids(&["a"]), "vocabulary", LATER).unwrap();
        assert_eq!(result.orphaned, ids(&["a"]));
        assert!(result.updated.is_empty() && result.fresh.is_empty());
    }
}
