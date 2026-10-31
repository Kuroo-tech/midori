<script lang="ts">
  /**
   * Số liệu đếm lên khi giá trị ĐỔI.
   *
   * # Vì sao không đếm ở lần dựng đầu tiên
   *
   * Lần dựng đầu đã nhận giá trị thật (thống kê được nạp xong trước khi giao diện
   * hiện ra), nên đếm từ 0 lên chỉ làm con số đúng bị trễ — người dùng đọc một con
   * số sai trong khoảng nửa giây đầu. Quan trọng không kém: vòng đếm của `Tween`
   * chạy bằng rAF, mà bộ kiểm định bố cục (`npm run audit:layout`) chỉ chờ được
   * `document.getAnimations()` — một con số đang đếm sẽ lọt vào ảnh chụp và làm lệch
   * chuẩn không tái lập được. Vì vậy lần dựng đầu hiện NGAY giá trị cuối; chỉ những
   * lần đổi giá trị sau đó mới đếm.
   *
   * # Vì sao bọc `{#key}`
   *
   * `pop` là animation của CSS: muốn nó chạy LẠI sau mỗi lần đổi giá trị thì phần tử
   * phải được dựng lại — `{#key}` làm đúng việc đó mà không phải tự tính chuỗi thời
   * gian. Phần tử chỉ chứa chữ số nên dựng lại không làm nháy bố cục.
   */
  import { cubicOut } from 'svelte/easing';
  import { Tween } from 'svelte/motion';

  import { motionDuration } from './motion.ts';

  interface Props {
    value: number;
  }

  let { value }: Props = $props();

  /**
   * Vòng đếm bám thẳng vào `value` (`Tween.of`): lần dựng đầu lấy đúng giá trị đầu
   * làm điểm xuất phát — không có vòng đếm nào chạy từ 0, nên cũng không có khung
   * hình nào hiển thị số sai.
   *
   * Thời lượng suy theo khoảng cách: nhảy từ 0 lên 400 cần lâu hơn nhảy từ 12 lên
   * 13, nhưng luôn nằm trong khoảng mắt còn đọc được là "đang đếm tới". Dưới
   * reduced-motion thời lượng về 0 — giá trị mới được đặt thẳng.
   */
  const tween = Tween.of(() => value, {
    easing: cubicOut,
    duration: (from, to) => motionDuration(Math.min(640, 260 + Math.abs(to - from) * 24)),
  });

  /** Giá trị đã nhận gần nhất — mốc để biết khi nào cần chạy lại `pop`. */
  let last = tween.target;
  /** Tăng mỗi khi giá trị đổi: khoá để `{#key}` chạy lại `pop`. */
  let pops = $state(0);

  $effect(() => {
    const next = value;
    if (next === last) return;
    last = next;
    pops += 1;
  });
</script>

{#key pops}
  <span class="pop tnum">{Math.round(tween.current)}</span>
{/key}
