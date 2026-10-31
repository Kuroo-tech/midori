/**
 * Chuyển động dùng chung: một chỗ trả lời câu hỏi "người dùng có yêu cầu giảm
 * chuyển động không", và một chỗ định nghĩa tham số cho các hiệu ứng chạy bằng JS.
 *
 * # Vì sao cần tệp này
 *
 * Khối `@media (prefers-reduced-motion: reduce)` trong `src/app.css` chỉ chạm được
 * `transition`/`animation` của CSS. Hiệu ứng của Svelte (`in:fly`, `transition:fly`)
 * chạy bằng JS và tự đặt style trực tiếp lên phần tử, còn `Tween` chạy bằng rAF —
 * không khối CSS nào phủ được chúng, nên mỗi nơi dùng phải tự hỏi. Trước đây chỉ màn
 * Nhập/xuất tự hỏi bằng `matchMedia` riêng; gộp vào đây để mọi chuyển cảnh JS có
 * cùng một câu trả lời và cùng hành vi.
 *
 * `prefersReducedMotion` của Svelte dùng lại MỘT đối tượng `MediaQuery`, nên đọc
 * `.current` vừa luôn phản ánh trạng thái hiện tại, vừa là một phụ thuộc phản ứng
 * khi được đọc trong `$derived`/`$effect` — đổi cài đặt của hệ điều hành là giao
 * diện tự cập nhật.
 */
import { prefersReducedMotion } from 'svelte/motion';
import type { FlyParams } from 'svelte/transition';

import type { NavDirection } from '../app/store.svelte.ts';

/** Người dùng có yêu cầu giảm chuyển động không. */
export function reducedMotion(): boolean {
  return prefersReducedMotion.current;
}

/**
 * Thời lượng cho hiệu ứng JS: về 0 khi người dùng yêu cầu giảm chuyển động.
 *
 * `duration: 0` của Svelte làm phần tử hiện ra ngay thay vì chạy hiệu ứng — đúng
 * hành vi mà khối CSS chung làm với token `--dur-*`.
 */
export function motionDuration(ms: number): number {
  return reducedMotion() ? 0 : ms;
}

/**
 * Hiệu ứng vào của màn hình theo chiều điều hướng.
 *
 * Đi tới thì trượt lên (`y` dương), quay lại thì trượt xuống — chuyển động khớp với
 * việc người dùng vừa làm, thay vì luôn cùng một hướng cho mọi cặp màn hình.
 */
export function pageFly(direction: NavDirection): FlyParams {
  return {
    y: reducedMotion() ? 0 : direction === 'forward' ? 14 : -14,
    duration: motionDuration(260),
    opacity: 0,
  };
}

/**
 * Hiệu ứng vào của thông báo: nhẹ, cùng nhịp ở mọi màn.
 *
 * Thông báo có `role` cảnh báo/trạng thái nên chỉ chạy ở lần VÀO — lúc gỡ thì
 * biến mất ngay, để trình đọc màn hình và luồng bố cục không phải chờ một hiệu ứng
 * không mang thông tin gì.
 */
export function noticeFly(y = -8, duration = 220): FlyParams {
  return {
    y: reducedMotion() ? 0 : y,
    duration: motionDuration(duration),
    opacity: 0,
  };
}

/**
 * Độ trễ so le cho phần tử thứ `index` trong danh sách.
 *
 * Có TRẦN vì danh sách dài (50 bài Minna, tối đa 200 kết quả tìm kiếm): không trần
 * thì phần tử cuối phải chờ hàng giây, và người dùng cuộn tới chỉ thấy một khung
 * đứng im — đúng thứ chuyển động đáng ra phải che đi.
 */
export function staggerDelay(index: number, step = 40, maxSteps = 8): string {
  return `${Math.min(index, maxSteps) * step}ms`;
}
