<script lang="ts">
  /**
   * Màn danh mục Kanji — tầng 2 của chủ đề Kanji.
   *
   * Bảy nhóm là danh mục CỐ ĐỊNH của giáo trình (như 50 bài Minna): nhóm chưa có
   * nội dung vẫn hiện ra và nói rõ "chưa có nội dung", không biến mất khỏi danh
   * sách. Một cú chạm mở Collection của nhóm đó — KHÔNG tự chạy phiên; phiên chỉ
   * bắt đầu bằng nút Bắt đầu trong Collection.
   *
   * Mọi con số (`total`, `due`, phần trăm đã học) đến từ `deckStats` của lõi Rust
   * — giao diện không tự đếm.
   */
  import { KANJI_CATEGORIES } from '../app/content-sections.ts';
  import { app } from '../app/store.svelte.ts';
  import PageHeader from './PageHeader.svelte';
  import { staggerDelay } from './motion.ts';

  const rows = $derived(
    KANJI_CATEGORIES.map((category) => {
      const counts = app.stats?.byDeck[category.deckId];
      const total = counts?.total ?? 0;
      const seen = Math.max(0, total - (counts?.new ?? 0));
      return {
        ...category,
        total,
        due: counts?.due ?? 0,
        percent: total === 0 ? 0 : Math.round((seen / total) * 100),
        available: (app.content?.bundles ?? []).some(
          (bundle) => bundle.deckId === category.deckId,
        ),
      };
    }),
  );

  const totalCards = $derived(rows.reduce((sum, row) => sum + row.total, 0));
  const dueTotal = $derived(rows.reduce((sum, row) => sum + row.due, 0));
  const availableCategories = $derived(rows.filter((row) => row.available).length);
</script>

<main class="screen">
  <PageHeader
    title="Kanji"
    subtitle="Chọn nhóm để xem phạm vi, tiến độ và bắt đầu phiên."
    onBack={() => app.back()}
  />

  <section class="card rise" style="--rise-delay: 0ms">
    <div class="section-head">
      <h1>Học Kanji theo nhóm</h1>
      <span class="section-tag">{availableCategories}/7 có nội dung</span>
    </div>
    <div class="summary">
      <span><b class="tnum">{totalCards}</b> thẻ</span>
      <span><b class="tnum">{dueTotal}</b> tới hạn</span>
    </div>
    <div class="category-list">
      {#each rows as row, index (row.id)}
        <button
          class="category-row rise"
          style="--rise-delay: {staggerDelay(index, 35)}"
          aria-label="{row.label}: {row.available
            ? `${row.total} thẻ, ${row.due} tới hạn`
            : 'chưa có nội dung'}"
          onclick={() => app.goCollection({ kind: 'deck', deckId: row.deckId })}
        >
          <span class="category-copy">
            <strong>{row.label}</strong>
            <span class="muted">{row.description}</span>
            {#if row.available && row.total > 0}
              <span class="category-progress">
                <span class="progress" aria-hidden="true">
                  <i style="width: {row.percent}%"></i>
                </span>
                <span class="muted tnum">{row.percent}% đã học</span>
              </span>
            {/if}
          </span>
          <span class="category-meta">
            {#if row.available}
              <span class="tnum">{row.total} thẻ</span>
              {#if row.due > 0}<span class="due tnum">{row.due} tới hạn</span>{/if}
            {:else}
              <span class="muted">Chưa có nội dung</span>
            {/if}
            <span class="chevron" aria-hidden="true">›</span>
          </span>
        </button>
      {/each}
    </div>
  </section>
</main>

<style>
  .summary {
    display: flex;
    gap: 18px;
    margin-top: 10px;
    color: var(--muted);
    font-size: 0.84rem;
  }

  .summary b {
    color: var(--text);
  }

  .category-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;
  }

  .category-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    min-height: 64px;
    padding: 11px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
    color: var(--text);
    text-align: left;
    transition:
      transform var(--dur-2) var(--ease-out),
      border-color var(--dur-2) var(--ease-out),
      background-color var(--dur-2) var(--ease-out);
  }

  .category-row:active {
    transform: scale(0.99);
  }

  .category-copy,
  .category-meta {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .category-copy {
    min-width: 0;
  }

  .category-copy strong {
    font-size: 0.93rem;
  }

  .category-copy .muted,
  .category-meta {
    font-size: 0.75rem;
  }

  .category-progress {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 5px;
  }

  .category-progress .progress {
    flex: 1;
    max-width: 160px;
    height: 5px;
    margin: 0;
  }

  .category-progress .muted {
    font-size: 0.7rem;
  }

  .category-meta {
    align-items: flex-end;
    flex: 0 0 auto;
    color: var(--muted);
  }

  .due {
    color: var(--accent-strong);
    font-weight: 700;
  }

  .chevron {
    color: var(--muted);
    font-size: 1.3rem;
    line-height: 1;
  }

  @media (hover: hover) {
    .category-row:hover {
      border-color: var(--accent-line);
      background: var(--surface-3);
    }
  }
</style>
