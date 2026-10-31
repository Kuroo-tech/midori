<script lang="ts">
  /**
   * Một hàng bộ thẻ — dùng chung cho "Bộ khác" ở Trang chủ, mục "Bộ khác" ở Thống
   * kê chi tiết, và hai góc nhìn chủ đề (Kanji, Mẫu câu).
   *
   * Mặc định hàng chỉ để ĐỌC: không hover, không `:active`. Khi truyền `onOpen`,
   * hàng trở thành NÚT mở Collection của bộ đó — vẫn một khuôn hàng, nhưng thêm
   * dấu hiệu bấm được (chevron, hover, phản hồi chạm) để người dùng biết.
   *
   * Con số và cách diễn giải nằm ở `deck-rows.ts`, không chép lại ở đây.
   */
  import Icon from './Icon.svelte';
  import { barLabel, percent, type DeckRowData } from './deck-rows.ts';
  import StructureBar from './StructureBar.svelte';

  let {
    row,
    emptyText,
    onOpen,
    openLabel,
  }: {
    row: DeckRowData;
    emptyText: string;
    /** Có mặt thì hàng là nút mở Collection của bộ này. */
    onOpen?: () => void;
    /** Nhãn đọc cho nút — không dựa vào chữ bên trong hàng. */
    openLabel?: string;
  } = $props();
</script>

{#snippet content()}
  <div class="row-head">
    <div>
      <strong>{row.name}</strong>
      <span class="muted tnum">
        {row.total} thẻ · {row.total - row.new} đã học
      </span>
    </div>
    <span class="head-tail">
      {#if row.total === 0}
        <span class="meta-pill pill-muted">Trống</span>
      {:else}
        <span class="meta-pill tnum">{percent(row.mastered, row.total)}% thành thạo</span>
      {/if}
      {#if onOpen}
        <Icon name="chevron" size={15} width={2.4} />
      {/if}
    </span>
  </div>
  <StructureBar
    newCount={row.new}
    learning={row.learning}
    mature={row.mature}
    label={barLabel(row)}
  />
  <div class="details muted">
    {#if row.total === 0}
      <span>{emptyText}</span>
    {:else}
      {#if row.due > 0}<span class="tnum">{row.due} tới hạn</span>{/if}
      {#if row.new > 0}<span class="tnum">{row.new} chưa học</span>{/if}
      {#if row.weak > 0}<span class="tnum">{row.weak} chưa thuộc</span>{/if}
      {#if row.mastered > 0}<span class="tnum">{row.mastered} thành thạo</span>{/if}
      {#if row.graded > 0}
        <span class="tnum">làm bài {Math.round(row.accuracy * 100)}% · {row.graded} thẻ</span>
      {/if}
    {/if}
  </div>
{/snippet}

{#if onOpen}
  <button
    type="button"
    class="deck-row deck-row-action"
    class:empty={row.total === 0}
    aria-label={openLabel}
    onclick={onOpen}
  >
    {@render content()}
  </button>
{:else}
  <div class="deck-row" class:empty={row.total === 0}>
    {@render content()}
  </div>
{/if}

<style>
  .deck-row {
    width: 100%;
    text-align: left;
    border: 1px solid var(--border);
    background: linear-gradient(180deg, var(--surface-2), color-mix(in srgb, var(--surface-2) 80%, var(--surface)));
    border-radius: var(--radius);
    padding: 12px;
  }

  /* Bộ chưa có thẻ bị làm mờ để mắt bỏ qua khi quét danh sách. */
  .deck-row.empty {
    opacity: 0.6;
  }

  /* Hàng bấm được: cùng khuôn, thêm dấu hiệu tương tác. */
  .deck-row-action {
    color: var(--text);
    cursor: pointer;
    transition:
      transform var(--dur-2) var(--ease-out),
      border-color var(--dur-2) var(--ease-out),
      background-color var(--dur-2) var(--ease-out);
  }

  .deck-row-action:active {
    transform: scale(0.99);
  }

  @media (hover: hover) {
    .deck-row-action:hover {
      border-color: var(--accent-line);
    }
  }

  .row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .row-head strong {
    display: block;
    font-size: 0.94rem;
  }

  .row-head .muted {
    display: block;
    margin-top: 4px;
    font-size: 0.76rem;
  }

  .head-tail {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    color: var(--muted);
  }

  .meta-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    padding: 4px 8px;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
    background: var(--accent-soft);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    color: var(--ok);
  }

  .pill-muted {
    background: var(--surface);
    border-color: var(--border);
    color: var(--muted);
  }

  .details {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
    font-size: 0.74rem;
  }
</style>
