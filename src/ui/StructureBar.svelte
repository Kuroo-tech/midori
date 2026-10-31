<script lang="ts">
  /**
   * Thanh cơ cấu ba nhóm chưa học / đang học / nhớ lâu của một bộ hoặc một bài.
   *
   * Tách khỏi hai màn vì hàng bộ thẻ (Trang chủ, hai mục chủ đề ở Thống kê chi
   * tiết) và hàng bài Minna (Thống kê chi tiết) đều vẽ CÙNG một thanh: chép tay
   * nhiều bản sẽ khiến lần sửa đầu tiên (độ cao, màu nhóm) lệch nhau giữa các nơi.
   *
   * Thanh chia theo TRỌNG SỐ (`flex-grow`) chứ không theo bề rộng cố định: dữ liệu
   * thẻ hỏng có thể khiến ba nhóm không cộng đúng bằng tổng, và khi đó thanh vẫn vẽ
   * đúng tỉ lệ thay vì tràn ra ngoài khung.
   */
  let {
    newCount,
    learning,
    mature,
    small = false,
    label,
  }: {
    newCount: number;
    learning: number;
    mature: number;
    /** Cỡ nhỏ dùng cho hàng bài Minna; hàng bộ thẻ dùng cỡ thường. */
    small?: boolean;
    /** Mô tả cơ cấu cho trình đọc màn hình (`barLabel` trong `deck-rows.ts`). */
    label: string;
  } = $props();
</script>

<span class="bar" class:bar-small={small} role="img" aria-label={label}>
  <i class="seg-new" style="flex-grow: {newCount}"></i>
  <i class="seg-learning" style="flex-grow: {learning}"></i>
  <i class="seg-mature" style="flex-grow: {mature}"></i>
</span>

<style>
  .bar {
    display: flex;
    gap: 2px;
    height: 7px;
    margin-top: 10px;
    border-radius: 999px;
    overflow: hidden;
    background: var(--surface-3);
  }

  .bar i {
    flex-basis: 0;
    min-width: 0;
  }

  .bar-small {
    height: 5px;
    margin-top: 7px;
  }

  .seg-new {
    background: var(--rate-easy);
  }

  .seg-learning {
    background: var(--warn);
  }

  .seg-mature {
    background: var(--accent);
  }
</style>
