<script lang="ts">
  /**
   * Màn duyệt bài học 1–50 — tầng 2 của chủ đề Từ vựng hoặc Mẫu câu.
   *
   * Cùng một component cho hai bộ vì cách chọn bài giống hệt nhau: mỗi bài mở
   * Collection của đúng bộ + đúng số bài, và một hàng "Học toàn bộ" mở cả bộ.
   * `deckId` quyết định bộ nào được đếm và mở; nhờ vậy thêm Mẫu câu theo bài
   * không sinh ra bản sao thứ hai của danh sách 50 bài.
   *
   * Đây là nơi DUY NHẤT chọn bài. Một cú chạm mở Collection của bài đó — KHÔNG
   * tự chạy phiên: phiên chỉ bắt đầu bằng nút Bắt đầu trong Collection, sau khi
   * người học đã thấy phạm vi, số thẻ và cấu hình.
   *
   * Mọi con số (`count`, `due`) đến từ `lessonSummary` của lõi Rust trên đúng
   * thẻ của bộ này — giao diện không tự đếm, nên nhãn "tới hạn" luôn khớp quy
   * tắc nghiệp vụ thật.
   */
  import { onMount, untrack } from 'svelte';

  import { app } from '../app/store.svelte.ts';
  import { lessonSummary, type LessonInfo } from '../core/index.ts';
  import Icon from './Icon.svelte';
  import { staggerDelay } from './motion.ts';
  import PageHeader from './PageHeader.svelte';

  let { deckId = 'vocabulary' }: { deckId?: string } = $props();

  const isPatterns = $derived(deckId === 'patterns');
  /** Đơn vị hiển thị theo bộ: Mẫu câu đếm bằng câu, Từ vựng đếm bằng thẻ. */
  const cardUnit = $derived(isPatterns ? 'mẫu câu' : 'thẻ');

  let lessons = $state.raw<LessonInfo[]>([]);
  /** Chuỗi tra cứu: khớp số bài hoặc nhãn, không phân biệt hoa thường. */
  let query = $state('');
  /**
   * Chỉ hiện bài đã có thẻ. Từ vựng còn nhiều bài trống nên mặc định bật; Mẫu
   * câu hiện đủ 50 bài nên mặc định tắt để danh mục không bị che mất.
   */
  let onlyWithCards = $state(untrack(() => deckId !== 'patterns'));

  onMount(() => {
    void load();
  });

  $effect(() => {
    if (app.cards.length > 0) void load();
  });

  async function load(): Promise<void> {
    // Lọc theo bộ TRƯỚC khi tóm tắt: `lessonSummary` của lõi đếm mọi thẻ có cùng
    // số bài, nên nếu đưa cả thư viện vào thì bài 1 của Mẫu câu sẽ cộng lẫn thẻ
    // Từ vựng (và ngược lại).
    const deckCards = app.cards.filter((card) => card.deckId === deckId);
    lessons = await lessonSummary(deckCards, Date.now());
  }

  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    return lessons.filter((lesson) => {
      if (onlyWithCards && lesson.count === 0) return false;
      if (needle === '') return true;
      return (
        lesson.label.toLowerCase().includes(needle) ||
        String(lesson.n).includes(needle)
      );
    });
  });

  const withCards = $derived(lessons.filter((lesson) => lesson.count > 0).length);
  /** Tổng số thẻ đã có bài. */
  const coveredCards = $derived(
    lessons.reduce((sum, lesson) => sum + lesson.count, 0),
  );
  const summary = $derived.by(() => {
    const base = `${coveredCards} ${cardUnit} trên ${withCards} bài.`;
    if (lessons.length > 0 && withCards < lessons.length) {
      return `${base} Các bài còn lại chưa có nội dung.`;
    }
    return base;
  });

  /**
   * Mở Collection của một bài — hoặc của cả bộ khi `lesson` là `null`.
   * Mọi lối vào Collection đều đi qua `app.goCollection`, nên phạm vi là trạng
   * thái điều hướng sống sót qua Back và tải lại trang.
   */
  function open(lesson: LessonInfo | null): void {
    app.goCollection(
      lesson === null
        ? { kind: 'deck', deckId }
        : { kind: 'lesson', deckId, lesson: lesson.n },
    );
  }
</script>

<main class="screen">
  <PageHeader
    title={isPatterns ? 'Mẫu câu' : '50 bài Minna'}
    subtitle={summary}
    onBack={() => app.back()}
  />

  <section class="card rise" style="--rise-delay: 0ms">
    <div class="section-head">
      <h2>{isPatterns ? 'Bài mẫu câu' : 'Bài học'}</h2>
      <span class="section-tag">{filtered.length}/{lessons.length}</span>
    </div>

    <!-- Mục tiêu ngang hàng với từng bài: học cả bộ. Đứng TRÊN thanh lọc để
         tìm kiếm/bộ lọc không che mất lối vào này. -->
    <button
      class="all-row"
      disabled={coveredCards === 0}
      onclick={() => open(null)}
    >
      <span class="lesson-n tnum" aria-hidden="true">全</span>
      <span class="lesson-body">
        <strong>{isPatterns ? 'Tất cả mẫu câu' : 'Học toàn bộ từ vựng'}</strong>
        <span class="muted">
          {coveredCards === 0 ? 'Chưa có thẻ nào' : `${coveredCards} ${cardUnit} · tất cả các bài`}
        </span>
      </span>
      <Icon name="chevron" size={15} width={2.4} />
    </button>

    <div class="controls">
      <label class="search">
        <Icon name="search" size={16} width={2.2} />
        <input
          bind:value={query}
          type="search"
          inputmode="search"
          placeholder="Tìm theo số bài…"
          aria-label="Tìm bài học"
        />
      </label>
      <label class="switch">
        <input type="checkbox" bind:checked={onlyWithCards} />
        <span class="track" aria-hidden="true"></span>
        <span class="switch-label">Chỉ bài có thẻ</span>
      </label>
    </div>

    {#if filtered.length === 0}
      <p class="muted" style="margin-top: 12px">
        {#if onlyWithCards && query.trim() === ''}
          Chưa có bài nào có thẻ. Tắt "Chỉ bài có thẻ" để xem đủ 50 bài.
        {:else}
          Không có bài nào khớp "{query}".
        {/if}
      </p>
    {:else}
      <div class="lesson-grid">
        <!-- Thẻ bài vào so le theo vị trí trong danh sách (trần 8 bước): lưới 50 ô
             bật ra cùng lúc trông như một khối giật, còn so le thì mắt lần theo
             hàng đầu tiên rồi các hàng sau đã đứng sẵn. -->
        {#each filtered as lesson, i (lesson.n)}
          <button
            class="lesson-card rise"
            style="--rise-delay: {staggerDelay(i)}"
            onclick={() => open(lesson)}
          >
            <span class="lesson-n tnum">{lesson.n}</span>
            <span class="lesson-body">
              <strong>{isPatterns ? `Mẫu câu bài ${lesson.n}` : lesson.label}</strong>
              <span class="muted">{lesson.count} {cardUnit}</span>
            </span>
            {#if lesson.due > 0}
              <span class="lesson-due tnum">{lesson.due}</span>
            {:else}
              <Icon name="chevron" size={15} width={2.4} />
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </section>
</main>

<style>
  .controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 14px;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface-container);
    color: var(--muted);
    transition:
      border-color var(--dur-2) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out);
  }

  .search:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    padding: 12px 0;
    color: var(--text);
  }

  .search input:focus-visible {
    outline: none;
  }

  .switch-label {
    font-size: 0.85rem;
    font-weight: 600;
  }

  /* Hàng "Học toàn bộ từ vựng": nổi hơn các ô bài (nền accent nhạt, viền accent)
     vì đây là mục tiêu rộng nhất, nhưng vẫn cùng một khuôn hàng với chúng. */
  .all-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    margin-bottom: 14px;
    border: 1px solid color-mix(in srgb, var(--accent) 32%, transparent);
    border-radius: var(--radius);
    background: var(--accent-soft);
    color: var(--text);
    text-align: left;
    transition:
      transform var(--dur-2) var(--ease-out),
      border-color var(--dur-2) var(--ease-out);
  }

  .all-row:active {
    transform: scale(0.99);
  }

  .all-row:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .all-row .lesson-n {
    background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  }

  .all-row > :global(svg) {
    flex: 0 0 auto;
    color: var(--muted);
    transform: rotate(-90deg);
  }

  @media (hover: hover) {
    .all-row:not(:disabled):hover {
      border-color: var(--accent-line);
    }
  }

  /* Lưới tự co theo bề rộng: hai cột trên điện thoại (390px cho ra ~170px mỗi
     ô), nhiều hơn khi màn rộng. 150px là ngưỡng nhỏ nhất để nhãn "Bài 12" và
     "12 mẫu câu" còn nằm trên một dòng, kể cả khi có badge tới hạn bên phải. */
  .lesson-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
  }

  .lesson-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
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

  .lesson-card:active {
    transform: scale(0.985);
  }

  .lesson-n {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    flex: 0 0 auto;
    border-radius: 9px;
    background: var(--accent-soft);
    color: var(--ok);
    font-size: 0.8rem;
    font-weight: 700;
  }

  .lesson-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .lesson-body strong {
    font-size: 0.88rem;
  }

  .lesson-body .muted {
    font-size: 0.74rem;
  }

  .lesson-due {
    flex: 0 0 auto;
    min-width: 1.6em;
    padding: 2px 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 16%, var(--surface));
    color: var(--ok);
    font-size: 0.72rem;
    font-weight: 700;
    text-align: center;
  }

  .lesson-card > :global(svg) {
    flex: 0 0 auto;
    color: var(--muted);
    transform: rotate(-90deg);
  }

  @media (hover: hover) {
    .lesson-card:hover {
      border-color: var(--accent-line);
      background: var(--surface-3);
    }
  }
</style>
