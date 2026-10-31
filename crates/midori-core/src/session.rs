//! Hàng đợi phiên học: các phép biến đổi thuần trên danh sách id thẻ.
//!
//! Thẻ được tham chiếu bằng id để biên WASM không phải sao chép nội dung thẻ
//! chỉ vì đổi thứ tự hàng đợi.
//!
//! # Vì sao phiên học lưu bằng ID chứ không lưu bản sao thẻ
//!
//! Phiên đang học dở phải sống sót qua việc tải lại trang — kể cả khi trang bị
//! tải lại vì cập nhật ứng dụng. Nếu lưu bản sao nội dung thẻ thì bản lưu đó sẽ
//! cũ đi sau mỗi lần cập nhật nội dung, và ta có hai nguồn sự thật.
//!
//! Lưu id và tra lại vào thư viện hiện tại giải quyết cả hai việc: bản lưu không
//! bao giờ cũ, và nội dung thẻ luôn là bản mới nhất. Đổi lại phải xử lý trường
//! hợp thẻ biến mất khỏi thư viện — xem [`restore`].

use serde::Serialize;

/// Bộ sinh số giả ngẫu nhiên xác định (xorshift64*).
///
/// Không dùng nguồn ngẫu nhiên của hệ điều hành: kết quả phải tái lập được để
/// kiểm thử, và seed do lớp nền tảng quyết định khi cần ngẫu nhiên thật.
struct Rng(u64);

impl Rng {
    fn new(seed: u64) -> Self {
        // Seed 0 làm xorshift suy biến ⇒ thay bằng hằng số phi vàng.
        Rng(if seed == 0 { 0x9E37_79B9_7F4A_7C15 } else { seed })
    }

    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    /// Số nguyên đều trong `0..n` (loại bỏ vùng gây lệch bằng cách lấy lại).
    fn below(&mut self, n: u64) -> u64 {
        debug_assert!(n > 0);
        let threshold = n.wrapping_neg() % n; // = (2^64 - n) % n
        loop {
            let value = self.next_u64();
            if value >= threshold {
                return value % n;
            }
        }
    }
}

/// Trộn thứ tự theo Fisher–Yates. Cùng `seed` ⇒ cùng kết quả.
pub fn shuffle_ids(ids: &[String], seed: u64) -> Vec<String> {
    let mut out = ids.to_vec();
    if out.len() < 2 {
        return out;
    }
    let mut rng = Rng::new(seed);
    for i in (1..out.len()).rev() {
        let j = rng.below((i + 1) as u64) as usize;
        out.swap(i, j);
    }
    out
}

/// Kết quả khôi phục một phiên học đang dở.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRestore {
    /// Hàng đợi còn dùng được, giữ nguyên thứ tự đã lưu.
    pub queue: Vec<String>,
    /// Vị trí thẻ đang học trong `queue`, đã tính lại theo hàng đợi mới.
    pub index: usize,
    /// Số id bị bỏ: không còn trong thư viện, hoặc trùng lặp.
    pub dropped: usize,
}

/// Khôi phục hàng đợi đã lưu, đối chiếu với thư viện hiện tại.
///
/// # Vì sao phải trả về cả `dropped`
///
/// Id có thể biến mất vì nhiều lý do đều hợp lệ: người dùng xoá thư viện, hoặc
/// nội dung xuất bản đổi (thẻ cũ bị bỏ khỏi bộ). Khôi phục "êm" trong im lặng sẽ
/// khiến người học thấy phiên ngắn hơn mình nhớ mà không hiểu vì sao. Giao diện
/// dùng `dropped` để nói rõ.
///
/// # Vì sao phải tính lại `index`
///
/// Đây là chỗ dễ sai nhất. Nếu thẻ đang học nằm ở vị trí 5 và hai thẻ TRƯỚC nó bị
/// bỏ, thì thẻ đó phải ở vị trí 3 trong hàng đợi mới — không phải vị trí 5. Vì
/// vậy `index` được đếm lại trên chính hàng đợi đã lọc, chứ không phải giữ
/// nguyên giá trị cũ. Khi thẻ đang học bị bỏ, kết quả trỏ vào thẻ kế tiếp còn
/// lại, đúng phản xạ tự nhiên của người đang học.
///
/// Thẻ trùng lặp bị bỏ: một id xuất hiện hai lần trong hàng đợi là dữ liệu vô
/// nghĩa (cùng một thẻ không thể tới hạn hai lần trong một phiên).
pub fn restore(ids: &[String], index: usize, available: &[String]) -> SessionRestore {
    let known: std::collections::HashSet<&str> = available.iter().map(String::as_str).collect();
    let limit = index.min(ids.len());

    let mut queue: Vec<String> = Vec::with_capacity(ids.len());
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut kept_before = 0usize;

    for (position, id) in ids.iter().enumerate() {
        if !known.contains(id.as_str()) || !seen.insert(id.clone()) {
            continue;
        }
        if position < limit {
            kept_before += 1;
        }
        queue.push(id.clone());
    }

    SessionRestore {
        index: kept_before.min(queue.len()),
        dropped: ids.len() - queue.len(),
        queue,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(n: usize) -> Vec<String> {
        (0..n).map(|i| format!("id-{i}")).collect()
    }

    fn owned(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn same_seed_gives_the_same_order() {
        let input = ids(50);
        assert_eq!(shuffle_ids(&input, 42), shuffle_ids(&input, 42));
    }

    #[test]
    fn different_seeds_give_different_orders() {
        let input = ids(50);
        assert_ne!(shuffle_ids(&input, 1), shuffle_ids(&input, 2));
    }

    #[test]
    fn shuffle_is_a_permutation() {
        let input = ids(200);
        let mut out = shuffle_ids(&input, 7);
        let mut expected = input.clone();
        out.sort();
        expected.sort();
        assert_eq!(out, expected);
    }

    #[test]
    fn shuffle_actually_reorders() {
        let input = ids(50);
        assert_ne!(shuffle_ids(&input, 99), input);
    }

    #[test]
    fn tiny_inputs_are_returned_as_is() {
        assert!(shuffle_ids(&[], 5).is_empty());
        assert_eq!(shuffle_ids(&ids(1), 5), ids(1));
    }

    #[test]
    fn zero_seed_is_not_degenerate() {
        let input = ids(20);
        assert_ne!(shuffle_ids(&input, 0), input);
        assert_eq!(shuffle_ids(&input, 0), shuffle_ids(&input, 0));
    }

    // ── Khôi phục phiên học ────────────────────────────────────────────

    #[test]
    fn restore_keeps_order_and_index_when_nothing_changed() {
        let queue = ids(5);
        let out = restore(&queue, 2, &queue);
        assert_eq!(out.queue, queue);
        assert_eq!(out.index, 2);
        assert_eq!(out.dropped, 0);
    }

    #[test]
    fn restore_reindexes_when_cards_before_the_current_one_disappear() {
        // Hàng đợi [0,1,2,3,4], đang ở vị trí 3 (thẻ id-3). Bỏ id-0 và id-2.
        let queue = ids(5);
        let available = owned(&["id-1", "id-3", "id-4"]);
        let out = restore(&queue, 3, &available);
        assert_eq!(out.queue, owned(&["id-1", "id-3", "id-4"]));
        assert_eq!(out.index, 1, "id-3 phải ở vị trí 1, không phải 3");
        assert_eq!(out.dropped, 2);
        assert_eq!(out.queue[out.index], "id-3");
    }

    #[test]
    fn restore_moves_past_the_current_card_when_it_is_gone() {
        // Đang ở id-2; id-2 không còn ⇒ trỏ vào thẻ kế tiếp (id-3).
        let queue = ids(5);
        let available = owned(&["id-0", "id-1", "id-3", "id-4"]);
        let out = restore(&queue, 2, &available);
        assert_eq!(out.index, 2);
        assert_eq!(out.queue[out.index], "id-3");
        assert_eq!(out.dropped, 1);
    }

    #[test]
    fn restore_clamps_an_index_past_the_end() {
        let queue = ids(3);
        let out = restore(&queue, 99, &queue);
        assert_eq!(out.index, 3, "phiên đã kết thúc ⇒ index bằng độ dài");
        assert_eq!(out.dropped, 0);
    }

    #[test]
    fn restore_on_an_empty_queue_is_empty() {
        let out = restore(&[], 4, &owned(&["id-0"]));
        assert!(out.queue.is_empty());
        assert_eq!(out.index, 0);
        assert_eq!(out.dropped, 0);
    }

    #[test]
    fn restore_drops_duplicates_without_counting_them_twice() {
        let queue = owned(&["a", "b", "a", "c"]);
        let out = restore(&queue, 3, &owned(&["a", "b", "c"]));
        assert_eq!(out.queue, owned(&["a", "b", "c"]));
        assert_eq!(out.dropped, 1);
        // Vị trí 3 trong bản lưu là "c"; sau khi bỏ bản trùng, "c" ở vị trí 2.
        assert_eq!(out.index, 2);
    }

    #[test]
    fn restore_with_nothing_available_is_an_empty_finished_session() {
        let out = restore(&ids(4), 1, &[]);
        assert!(out.queue.is_empty());
        assert_eq!(out.index, 0);
        assert_eq!(out.dropped, 4);
    }

    #[test]
    fn restore_is_stable_when_applied_twice() {
        // Khôi phục lại trên kết quả đã khôi phục không được làm mất thêm gì.
        let queue = ids(5);
        let available = owned(&["id-1", "id-3"]);
        let once = restore(&queue, 3, &available);
        let twice = restore(&once.queue, once.index, &available);
        assert_eq!(twice.queue, once.queue);
        assert_eq!(twice.index, once.index);
        assert_eq!(twice.dropped, 0);
    }

    #[test]
    fn fairness_is_plausible_over_many_rounds() {
        // Mỗi vị trí phải nhận được phần tử đầu tiên với tần suất xấp xỉ 1/n.
        let input = ids(4);
        let rounds = 40_000;
        let mut first_counts = [0usize; 4];
        for seed in 0..rounds {
            let shuffled = shuffle_ids(&input, seed as u64 + 1);
            let index: usize = shuffled[0].trim_start_matches("id-").parse().unwrap();
            first_counts[index] += 1;
        }
        for count in first_counts {
            let ratio = count as f64 / rounds as f64;
            assert!(
                (ratio - 0.25).abs() < 0.02,
                "phân bố lệch: {first_counts:?}"
            );
        }
    }
}
