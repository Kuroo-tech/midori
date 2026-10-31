<script lang="ts">
  /**
   * Vỏ ứng dụng: khởi động, chọn màn hình, điều hướng dưới.
   *
   * Ba trạng thái, theo thứ tự:
   * 1. lỗi khởi động  → hiển thị NGUYÊN NHÂN (không để màn hình trắng)
   * 2. đang khởi động → hiển thị bước đang chạy
   * 3. sẵn sàng       → màn hình hiện tại + điều hướng
   *
   * # Vì sao chuyển màn hình dùng `in:` mà không dùng `out:`
   *
   * Màn hình cũ biến mất NGAY, nên bố cục không bao giờ có hai màn hình chồng
   * nhau trong cùng một cột flex. Dùng `out:` sẽ khiến hai `.screen` cùng tồn tại
   * trong lúc chuyển, và vì cả hai đều `flex: 1`, chúng sẽ đẩy nhau gây nhảy bố
   * cục — đúng thứ chuyển động đáng ra phải che đi.
   *
   * Hướng trượt lấy từ `app.navDirection` (xem `pageFly`): đi tới thì trượt lên,
   * quay lại thì trượt xuống. Trước đây luôn trượt lên vì `in:` không biết người
   * dùng vừa bấm tab hay vừa bấm Back; nay chiều đó được ghi ở store, cùng lượt
   * cập nhật với màn hình nên không có khung hình nào dùng sai hướng.
   */
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';

  import { app, type Screen } from '../app/store.svelte.ts';
  import { navigationSection } from '../app/screen.ts';
  import type { IconName } from './Icon.svelte';
  import LiquidTabs from './LiquidTabs.svelte';
  import ScreenHost from './ScreenHost.svelte';
  import { noticeFly, pageFly } from './motion.ts';

  onMount(() => {
    void app.boot();
  });

  // Ba mục lớn: Trang chủ · Nhập/xuất · Cài đặt. Màn "Học" đã gộp vào Trang chủ,
  // nên việc chọn nội dung để học nằm ngay trên Trang chủ thay vì một tab riêng.
  const tabs: { id: Screen; label: string; icon: IconName }[] = [
    { id: 'home', label: 'Trang chủ', icon: 'home' },
    { id: 'transfer', label: 'Nhập/Xuất', icon: 'transfer' },
    { id: 'settings', label: 'Cài đặt', icon: 'settings' },
  ];

  const pageIn = $derived(pageFly(app.navDirection));
</script>

{#if app.bootError !== null}
  <main class="screen">
    <div class="card rise">
      <h1>Không khởi động được Midori</h1>
      <p class="muted">{app.bootError}</p>
      <p class="muted">
        Gợi ý: chạy <code>npm run generate</code> rồi tải lại, để sinh lại lõi WASM và
        cấu trúc nội dung.
      </p>
      <button class="btn btn-primary" onclick={() => window.location.reload()}>Tải lại</button>
    </div>
  </main>
{:else if !app.ready}
  <main class="screen splash">
    <div class="mark" aria-hidden="true"><span></span></div>
    <h1>Midori</h1>
    <p class="muted">{app.bootStep}</p>
  </main>
{:else}
  {#if app.backupRestoreNotice !== null}
    <div class="backup-restore-notice" role="status" in:fly={noticeFly(-6, 200)}>
      <span>{app.backupRestoreNotice}</span>
      <button class="btn btn-inline" onclick={() => app.dismissBackupRestoreNotice()}>Đóng</button>
    </div>
  {/if}
  {#if app.screenPersistenceError !== null}
    <div class="screen-persistence-notice" role="alert" in:fly={noticeFly(-6, 200)}>
      <span>{app.screenPersistenceError}</span>
      <button class="btn btn-inline" onclick={() => app.dismissScreenPersistenceError()}>Đóng</button>
    </div>
  {/if}
  <!--
    Màn hình được nạp theo nhu cầu; xem `src/ui/screens.ts` để biết vì sao việc
    này không tạo ra khung hình trắng. `{#key app.screen}` giữ nguyên: nó là thứ
    buộc Svelte dựng lại cả cây con khi đổi màn hình.
  -->
  <div class="slot">
    {#key app.screen}
      <div class="page" in:fly={pageIn}>
        <ScreenHost screen={app.screen} />
      </div>
    {/key}
  </div>

  <nav class="nav" aria-label="Điều hướng chính">
    <LiquidTabs
      items={tabs}
      activeId={navigationSection(app.screen)}
      ariaLabel="Điều hướng chính"
      variant="navigation"
      onSelect={(id) => app.go(id as Screen)}
    />
  </nav>
{/if}

<style>
  .backup-restore-notice,
  .screen-persistence-notice {
    position: fixed;
    z-index: 20;
    inset-inline: max(16px, calc((100vw - 760px) / 2));
    bottom: calc(var(--nav-height, 72px) + 14px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    border: 1px solid color-mix(in srgb, var(--ok) 35%, var(--border));
    border-radius: var(--radius);
    background: var(--surface-2);
    color: var(--text);
    box-shadow: var(--shadow);
  }

  .screen-persistence-notice {
    bottom: calc(var(--nav-height, 72px) + 84px);
    border-color: color-mix(in srgb, var(--warn) 45%, var(--border));
    background: var(--warn-soft);
  }

  .splash {
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 10px;
  }

  .splash h1 {
    font-size: 1.6rem;
    letter-spacing: 0.02em;
    animation: fade-up 520ms var(--ease-out) 80ms backwards;
  }

  .splash .muted {
    animation: fade-up 520ms var(--ease-out) 200ms backwards;
  }

  /* Viên gradient thở nhẹ: đủ để màn hình chờ trông "đang làm việc" mà không
     gây cảm giác giật. */
  .mark {
    position: relative;
    width: 84px;
    height: 84px;
    border-radius: var(--radius-xl);
    background: linear-gradient(140deg, #1fc48c, #0a5f3f);
    box-shadow:
      0 18px 40px rgb(10 95 63 / 28%),
      inset 0 1px 0 rgb(255 255 255 / 22%);
    display: grid;
    place-items: center;
    animation: mark-in 620ms var(--ease-spring) backwards;
  }

  .mark span {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 3px solid rgb(255 255 255 / 35%);
    border-top-color: #ffffff;
    animation: spin 900ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes mark-in {
    from {
      opacity: 0;
      transform: scale(0.82) translateY(10px);
    }
  }

  @keyframes fade-up {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }

  /* `{#key}` đổi màn hình bằng cách thay cả cây con, nên cần một khung flex để
     màn hình bên trong vẫn giãn hết chiều cao. */
  .slot {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .page {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  code {
    background: var(--surface-3);
    border-radius: 6px;
    padding: 1px 5px;
  }

  @media (prefers-reduced-motion: reduce) {
    .mark span {
      animation: none;
      border-top-color: rgb(255 255 255 / 35%);
    }
  }
</style>
