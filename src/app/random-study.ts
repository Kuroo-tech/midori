/**
 * Phiên "Học ngẫu nhiên": bốc `dailyNewLimit` thẻ từ cả ba chủ đề.
 *
 * Ở đây chỉ có phần quyết định SỐ thẻ bốc — hàm thuần, có test. Việc chọn bộ do
 * `isStudyCatalogDeck` quyết định, còn việc trộn thật do lõi Rust làm
 * (`sessionShuffle`) nên thứ tự bốc không phụ thuộc vào cách xếp của thư viện.
 */

/**
 * Số thẻ cần bốc.
 *
 * Lấy đúng "thẻ mới tối đa mỗi ngày" trong Cài đặt, nhưng không vượt quá số thẻ
 * đang có — thư viện nhỏ hơn giới hạn thì bốc hết, không lặp lại thẻ nào.
 * Giá trị rác (âm, `NaN`) quay về 0 thay vì tạo ra một hàng đợi vô lý.
 */
export function randomDrawSize(poolSize: number, dailyNewLimit: number): number {
  const limit = Number.isFinite(dailyNewLimit) ? Math.max(0, Math.round(dailyNewLimit)) : 0;
  const pool = Number.isFinite(poolSize) ? Math.max(0, Math.round(poolSize)) : 0;
  return Math.min(limit, pool);
}
