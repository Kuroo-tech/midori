/**
 * Dữ liệu một hàng bộ thẻ và các phép tính kèm theo — dùng chung giữa hai màn.
 *
 * "Theo bộ thẻ" nằm ở Trang chủ (mục kiểm kê ĐẦY ĐỦ mọi bộ có trong thư viện),
 * còn Thống kê chi tiết dùng lại cùng khuôn hàng cho hai góc nhìn chủ đề (Kanji,
 * Mẫu câu). Các nơi đó phải đọc ra CÙNG con số và cùng cách diễn giải: số thẻ ·
 * đã học, pill "% thành thạo"/"Trống", thanh cơ cấu, dòng chi tiết. Tách hàm
 * dựng hàng và hai phép tính ra đây để một sửa đổi nhỏ không lệch nhau giữa các
 * nơi — trước đây cả ba nằm trong một snippet của `StatsDetail`.
 *
 * Mọi con số đều đến từ lõi Rust (`stats.byDeck`); ở đây chỉ đổi cách hiển thị,
 * giao diện không tự đếm thẻ.
 */
import type { DeckStats } from '../core/index.ts';

/** Một hàng bộ thẻ đã sẵn sàng để hiển thị (kể cả bộ chưa có thẻ). */
export interface DeckRowData {
  id: string;
  name: string;
  total: number;
  due: number;
  new: number;
  learning: number;
  mature: number;
  weak: number;
  weakRating: number;
  weakQuiz: number;
  mastery: number;
  mastered: number;
  accuracy: number;
  graded: number;
}

/**
 * Dựng một hàng từ `deckStats` của lõi.
 *
 * Bộ không có trong `byDeck` (chưa có thẻ nào) trả về hàng 0 thay vì bị bỏ sót —
 * bộ do người học tự tạo cũng nằm trong `byDeck`, nên không nơi nào phải tự lọc.
 */
export function deckRow(stats: DeckStats | null, id: string, name: string): DeckRowData {
  const counts = stats?.byDeck[id];
  return {
    id,
    name,
    total: counts?.total ?? 0,
    due: counts?.due ?? 0,
    new: counts?.new ?? 0,
    learning: counts?.learning ?? 0,
    mature: counts?.mature ?? 0,
    weak: counts?.weak ?? 0,
    weakRating: counts?.weakRating ?? 0,
    weakQuiz: counts?.weakQuiz ?? 0,
    mastery: counts?.mastery ?? 0,
    mastered: counts?.mastered ?? 0,
    accuracy: counts?.accuracy ?? 0,
    graded: counts?.graded ?? 0,
  };
}

/** Phần trăm luôn có mẫu số thật; chia cho 0 trả 0 thay vì NaN. */
export function percent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

/** Mô tả cơ cấu cho trình đọc màn hình — thanh màu không tự đọc được. */
export function barLabel(parts: {
  total: number;
  new: number;
  learning: number;
  mature: number;
}): string {
  if (parts.total === 0) return 'Chưa có thẻ nào';
  return `Cơ cấu ${parts.total} thẻ: ${parts.new} chưa học, ${parts.learning} đang học, ${parts.mature} nhớ lâu`;
}
