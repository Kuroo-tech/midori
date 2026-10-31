<script lang="ts">
  /**
   * Chỗ dựng màn hình hiện tại.
   *
   * Component được lấy ĐỒNG BỘ từ bộ nhớ đệm của `screens.ts`. Trên đường đi bình
   * thường thì bộ nhớ đệm đã có sẵn (màn hình đầu tiên được `boot()` nạp xong, các
   * màn hình khác được nạp trước), nên không có khung hình trung gian nào.
   *
   * Khung xương ở đây chỉ dành cho trường hợp hiếm: người dùng chuyển màn hình
   * trước khi việc nạp trước kịp xong (máy rất chậm, hoặc mạng vừa bị cắt lúc cài
   * đặt). Nó giữ đúng hình dạng một thẻ để bố cục không nhảy hai lần, và dùng lại
   * đúng chỉ báo tải mà màn Học đã dùng.
   *
   * Bộ nhớ đệm của `screens.ts` là `Map` thường (không reactive), nên trạng thái
   * ở đây phải là `$state` chứ không `$derived`: một `$derived(screenComponent())`
   * sẽ đóng băng ở `null` khi gói màn hình về muộn — khung xương không bao giờ
   * được thay bằng màn hình thật.
   *
   * Nạp hỏng (mất mạng giữa chừng) hiện thẻ lỗi với nút TẢI LẠI TRANG — không
   * phải nút "thử lại" tại chỗ. Chrome nhớ kết quả nạp hỏng của một `import()`
   * theo URL suốt vòng đời tài liệu: đo trên bản dựng production, sau khi mạng
   * hồi thì `fetch(url)` trả 200 nhưng `import(url)` vẫn ném lỗi y cũ, còn
   * `import(url + '?v=2')` chạy bình thường. Thử lại tại chỗ vì thế không bao giờ
   * thành công; tải lại trang tạo tài liệu mới và màn hình nạp lại từ đầu.
   */
  import type { Component as SvelteComponent } from 'svelte';
  import { untrack } from 'svelte';

  import { loadScreen, screenComponent } from './screens.ts';
  import type { Screen } from '../app/screen.ts';

  interface Props {
    screen: Screen;
  }

  const { screen }: Props = $props();

  // `untrack`: App dựng lại chỗ này theo `{#key app.screen}` nên `screen` của một
  // instance là bất biến; đọc qua `untrack` chỉ để svelte-check không tưởng nhầm
  // đây là chỗ bám giá trị đầu của một biến đổi được.
  let Component = $state<SvelteComponent | null>(untrack(() => screenComponent(screen)));
  let failed = $state(false);

  $effect(() => {
    if (Component !== null) return;
    let active = true;
    void loadScreen(screen).then(
      (loaded) => {
        if (active) Component = loaded;
      },
      () => {
        if (active) failed = true;
      },
    );
    return () => {
      active = false;
    };
  });
</script>

{#if Component !== null}
  <Component />
{:else if failed}
  <div class="screen" aria-label="Không mở được màn hình">
    <div class="card failure">
      <p>Không mở được màn hình này. Kiểm tra kết nối rồi tải lại trang.</p>
      <button class="btn btn-inline" onclick={() => window.location.reload()}>Tải lại trang</button>
    </div>
  </div>
{:else}
  <div class="screen" aria-busy="true" aria-label="Đang mở màn hình">
    <div class="card skeleton">
      <i></i>
      <i></i>
      <i></i>
    </div>
  </div>
{/if}

<style>
  .skeleton {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 12px;
    min-height: 180px;
  }

  .skeleton i {
    display: block;
    height: 12px;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      var(--surface-2) 0%,
      var(--surface-3) 40%,
      var(--surface-2) 80%
    );
    background-size: 240% 100%;
    animation: shimmer 1400ms linear infinite;
  }

  .skeleton i:nth-child(1) {
    width: 46%;
  }

  .skeleton i:nth-child(2) {
    width: 78%;
  }

  .skeleton i:nth-child(3) {
    width: 62%;
  }

  .failure {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  @keyframes shimmer {
    from {
      background-position: 120% 0;
    }
    to {
      background-position: -120% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton i {
      animation: none;
    }
  }
</style>
