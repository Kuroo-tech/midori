<script lang="ts">
  /**
   * Ba hàng "Danh mục học" — dùng CHUNG cho màn Trang chủ và màn Học.
   *
   * Hai màn cần cùng ba chủ đề với cùng con số, chỉ khác ngữ cảnh: Trang chủ đặt
   * nó trong vùng tiến độ, màn Học đặt nó làm nơi chọn nội dung. Một component
   * duy nhất bảo đảm hai nơi không bao giờ đọc ra hai bộ số khác nhau, và lần sửa
   * đầu tiên (nhãn, thứ tự, cách tính phần trăm) không phải nhớ sửa hai chỗ.
   *
   * Hàng chỉ ĐIỀU HƯỚNG: Từ vựng và Mẫu câu mở 50 bài, Kanji mở 7 nhóm. Không
   * hàng nào bắt đầu phiên học — mọi phiên đều bắt đầu từ Collection, nên một cú
   * chạm ở đây không bao giờ vừa "mở" vừa "chạy".
   *
   * Mọi con số đến từ `deckStats` của lõi Rust (`app.stats.byDeck`), kể cả hàng
   * Kanji — cộng theo bảy nhóm đúng bằng số của cả chủ đề, không tự đếm thẻ.
   */
  import { KANJI_CATEGORIES } from '../app/content-sections.ts';
  import { app } from '../app/store.svelte.ts';
  import type { DeckCount } from '../core/index.ts';
  import Icon from './Icon.svelte';
  import { staggerDelay } from './motion.ts';

  let { showAll = false }: { showAll?: boolean } = $props();

  const rows = $derived.by(() => {
    const byDeck = app.stats?.byDeck ?? {};
    const kanji = KANJI_CATEGORIES.map((category) => byDeck[category.deckId]);
    // `pick` nhận ĐÚNG kiểu phần tử đã lọc `undefined`: tham số của callback được
    // chú kiểu tường minh, không suy từ context (`DeckCount | undefined`), nếu
    // không thì thân callback phải tự kiểm tra lại thứ `reduce` đã kiểm.
    const sum = (pick: (counts: DeckCount) => number): number =>
      kanji.reduce((total, counts) => total + (counts === undefined ? 0 : pick(counts)), 0);
    const patternsBundle = (app.content?.bundles ?? []).some(
      (bundle) => bundle.deckId === 'patterns',
    );

    return [
      {
        id: 'vocabulary',
        mark: '語',
        title: 'Từ vựng',
        subtitle: '50 bài Minna no Nihongo',
        total: byDeck['vocabulary']?.total ?? 0,
        due: byDeck['vocabulary']?.due ?? 0,
        new: byDeck['vocabulary']?.new ?? 0,
        available: (app.content?.bundles ?? []).some((b) => b.deckId === 'vocabulary'),
        open: () => app.go('lessons'),
      },
      {
        id: 'kanji',
        mark: '漢',
        title: 'Kanji',
        subtitle: '7 nhóm từ loại và chủ đề',
        total: sum((counts) => counts.total),
        due: sum((counts) => counts.due),
        new: sum((counts) => counts.new),
        available: KANJI_CATEGORIES.some((category) =>
          (app.content?.bundles ?? []).some((bundle) => bundle.deckId === category.deckId),
        ),
        open: () => app.go('kanji'),
      },
      {
        id: 'patterns',
        mark: '文',
        title: 'Mẫu câu',
        subtitle: '50 bài Minna no Nihongo',
        total: byDeck['patterns']?.total ?? 0,
        due: byDeck['patterns']?.due ?? 0,
        new: byDeck['patterns']?.new ?? 0,
        available: patternsBundle,
        open: () => app.go('patterns'),
      },
    ];
  });

  const catalog = $derived(app.stats);

  function percentSeen(row: { total: number; new: number }): number {
    if (row.total === 0) return 0;
    return Math.round(((row.total - row.new) / row.total) * 100);
  }
</script>

<section class="card rise" style="--rise-delay: 60ms">
  <div class="section-head">
    <h2>Danh mục học</h2>
    <span class="section-tag">3 chủ đề</span>
  </div>

  <div class="categories">
    {#each rows as row, index (row.id)}
      <button
        class="category rise"
        style="--rise-delay: {staggerDelay(index, 35)}"
        disabled={!row.available && row.total === 0}
        onclick={row.open}
      >
        <span class="category-mark" aria-hidden="true">{row.mark}</span>
        <span class="category-copy">
          <strong>{row.title}</strong>
          <span class="muted">{row.subtitle}</span>
          {#if row.total > 0}
            <span class="category-progress">
              <span class="progress" aria-hidden="true">
                <i style="width: {percentSeen(row)}%"></i>
              </span>
              <span class="muted tnum">{percentSeen(row)}% đã học</span>
            </span>
          {:else}
            <span class="muted small">Chưa có nội dung</span>
          {/if}
        </span>
        <span class="category-meta">
          {#if row.total > 0}
            <span class="tnum">{row.total} thẻ</span>
          {/if}
          {#if row.due > 0}
            <span class="due tnum">{row.due} tới hạn</span>
          {/if}
        </span>
        <Icon name="chevron" size={15} width={2.4} />
      </button>
    {/each}
  </div>

  {#if showAll}
    <!-- Hàng "Tất cả nội dung" đứng riêng dưới ba chủ đề: nó không thuộc chủ đề
         nào, và ở Collection nó là phạm vi duy nhất có thêm lựa chọn "Học ngẫu
         nhiên". Một đường kẻ mỏng nói điều đó rõ hơn bất kỳ nhãn nào. -->
    <div class="all-row-wrap">
      <button
        class="category all-row rise"
        style="--rise-delay: {staggerDelay(3, 35)}"
        onclick={() => app.goCollection({ kind: 'all' })}
      >
        <span class="category-mark" aria-hidden="true">全</span>
        <span class="category-copy">
          <strong>Tất cả nội dung</strong>
          <span class="muted">Mọi bộ trong thư viện · có học ngẫu nhiên</span>
        </span>
        <span class="category-meta">
          {#if (catalog?.total ?? 0) > 0}
            <span class="tnum">{catalog?.total ?? 0} thẻ</span>
          {/if}
          {#if (catalog?.due ?? 0) > 0}
            <span class="due tnum">{catalog?.due ?? 0} tới hạn</span>
          {/if}
        </span>
        <Icon name="chevron" size={15} width={2.4} />
      </button>
    </div>
  {/if}
</section>

<style>
  .categories {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .category {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 68px;
    padding: 10px;
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

  .category:active {
    transform: scale(0.99);
  }

  .category:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .category-mark {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    flex: 0 0 auto;
    border-radius: 12px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 1.15rem;
    font-weight: 700;
  }

  .category-copy {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .category-copy strong {
    display: block;
    font-size: 0.9rem;
  }

  .category-copy .muted,
  .category-meta {
    font-size: 0.76rem;
  }

  .category-copy .small {
    font-size: 0.74rem;
  }

  .category-progress {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
  }

  .category-progress .progress {
    flex: 1;
    max-width: 160px;
    height: 5px;
  }

  .category-progress .muted {
    font-size: 0.7rem;
  }

  .category-meta {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    color: var(--muted);
  }

  .category-meta .due {
    color: var(--accent-strong);
    font-weight: 700;
  }

  .category > :global(svg) {
    flex: 0 0 auto;
    color: var(--muted);
    transform: rotate(-90deg);
  }

  .all-row-wrap {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--border);
  }

  .all-row .category-mark {
    background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  }

  @media (hover: hover) {
    .category:not(:disabled):hover {
      border-color: var(--accent-line);
      background: var(--surface-3);
    }
  }
</style>
