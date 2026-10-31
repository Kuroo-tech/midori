<script lang="ts">
  /**
   * Collection — màn quản lý và bắt đầu phiên học cho MỘT phạm vi nội dung.
   *
   * # Vì sao chỉ có một màn hình
   *
   * Ba lối vào (một bài Minna, một nhóm Kanji, một bộ bất kỳ) trỏ về cùng component
   * này với phạm vi khác nhau (`app.collectionScope`), thay vì mỗi bài/mỗi nhóm một
   * màn hình riêng. Phạm vi là trạng thái ĐIỀU HƯỚNG nằm ở lớp store: nó sống sót
   * qua mỗi lần dựng lại component (Back từ phiên học, tải lại trang) nên tiêu đề,
   * thống kê và bộ lọc không bao giờ lệch khỏi thứ người dùng đã chọn.
   *
   * # Con số trên nút Bắt đầu là hàng đợi thật
   *
   * Danh sách "Sẽ học" và số thẻ trên nút đi qua ĐÚNG bộ lọc mà màn phiên dùng để
   * dựng hàng đợi (`sessionFilter` trong `src/app/session-plan.ts` + `cardsFilter`
   * của lõi Rust). Vì vậy nút không thể ghi "12 thẻ" rồi phiên chạy 9 thẻ. Khi
   * không có thẻ nào, nút bị vô hiệu và nói rõ VÌ SAO thay vì im lặng.
   *
   * Bốn con số tổng (tổng · tới hạn · chưa học · chưa thuộc) đến từ `deckStats` /
   * `lessonSummary` của lõi — giao diện không tự đếm.
   *
   * # Mở Collection KHÔNG phải bắt đầu phiên
   *
   * Màn này chỉ mở ra để xem và chỉnh; phiên chỉ chạy khi bấm nút Bắt đầu, và mọi
   * đường bắt đầu đầu đi qua đây — không có lối tắt nào tự chạy phiên từ một cú
   * chạm chọn bài.
   */
  import { app } from '../app/store.svelte.ts';
  import { KANJI_CATEGORIES } from '../app/content-sections.ts';
  import { catalogCards, sessionFilter } from '../app/session-plan.ts';
  import { randomDrawSize } from '../app/random-study.ts';
  import { cardsFilter, lessonSummary, type Card, type LessonInfo } from '../core/index.ts';
  import type { StudyFocus, StudyMode } from '../storage/session.ts';
  import { barLabel, percent } from './deck-rows.ts';
  import Icon from './Icon.svelte';
  import PageHeader from './PageHeader.svelte';
  import StructureBar from './StructureBar.svelte';
  import { staggerDelay } from './motion.ts';

  /** Số thẻ xem trước trong danh sách "Sẽ học" — đủ để nhận diện, không dài. */
  const PREVIEW_LIMIT = 8;

  const scope = $derived(app.collectionScope);

  /** Danh mục Kanji của phạm vi đang mở, nếu có — nguồn của nhãn và mô tả. */
  const kanjiCategory = $derived(
    scope.kind === 'deck'
      ? (KANJI_CATEGORIES.find((category) => category.deckId === scope.deckId) ?? null)
      : null,
  );

  /** Bộ xuất bản của phạm vi — `null` nghĩa là nội dung chưa được phát hành. */
  const bundle = $derived(
    scope.kind === 'deck'
      ? ((app.content?.bundles ?? []).find((entry) => entry.deckId === scope.deckId) ?? null)
      : null,
  );

  const title = $derived.by(() => {
    if (scope.kind === 'all') return 'Tất cả nội dung';
    if (scope.kind === 'lesson') {
      return scope.deckId === 'patterns' ? `Mẫu câu bài ${scope.lesson}` : `Bài ${scope.lesson}`;
    }
    return kanjiCategory?.label ?? app.deckName(scope.deckId);
  });

  const subtitle = $derived.by(() => {
    if (scope.kind === 'all') return 'Toàn thư viện — Từ vựng, Kanji, Mẫu câu và bộ của bạn.';
    if (scope.kind === 'lesson') {
      return scope.deckId === 'patterns' ? 'Mẫu câu Minna no Nihongo' : 'Từ vựng Minna no Nihongo';
    }
    if (kanjiCategory !== null) return kanjiCategory.description;
    if (scope.deckId === 'vocabulary') return '50 bài Minna no Nihongo';
    if (scope.deckId === 'patterns') return '50 bài Minna no Nihongo';
    return 'Bộ thẻ của bạn';
  });

  /** Đường dẫn phân cấp: người học luôn biết mình đang đứng ở đâu trong cây. */
  const path = $derived.by(() => {
    if (scope.kind === 'all') return 'Học › Tất cả nội dung';
    if (scope.kind === 'lesson') {
      const deck = scope.deckId === 'patterns' ? 'Mẫu câu' : 'Từ vựng';
      return `Học › ${deck} › Bài ${scope.lesson}`;
    }
    if (kanjiCategory !== null) return `Học › Kanji › ${kanjiCategory.label}`;
    if (scope.deckId === 'vocabulary') return 'Học › Từ vựng';
    if (scope.deckId === 'patterns') return 'Học › Mẫu câu';
    return 'Học › Bộ khác';
  });

  // ── Cấu hình phiên ──────────────────────────────────────────────────────

  // Lựa chọn GẦN NHẤT trong store, không phải giá trị cứng: Back từ phiên học về
  // đây (component được dựng lại) vẫn thấy đúng thứ vừa chọn.
  let focus = $state<StudyFocus>(app.collectionFocus);
  let mode = $state<StudyMode>(app.collectionMode);

  /** Phiên ngẫu nhiên chỉ có nghĩa ở phạm vi toàn thư viện — xem `session-plan.ts`. */
  const randomAllowed = $derived(scope.kind === 'all');

  // ── Thống kê của phạm vi ────────────────────────────────────────────────

  let lessons = $state.raw<LessonInfo[]>([]);

  const lessonInfo = $derived(
    scope.kind === 'lesson' ? (lessons.find((entry) => entry.n === scope.lesson) ?? null) : null,
  );

  $effect(() => {
    const currentScope = scope;
    const cards = app.cards;
    if (currentScope.kind !== 'lesson') return;
    void (async () => {
      // Chỉ đếm thẻ của đúng bộ đang mở: bài 1 của Mẫu câu không được cộng lẫn
      // thẻ Từ vựng cùng số bài.
      const deckCards = cards.filter((card) => card.deckId === currentScope.deckId);
      lessons = await lessonSummary(deckCards, Date.now());
    })();
  });

  interface ScopeCounts {
    total: number;
    due: number;
    new: number;
    learning: number;
    mature: number;
    weak: number;
    mastery: number;
    mastered: number;
  }

  const EMPTY_COUNTS: ScopeCounts = {
    total: 0,
    due: 0,
    new: 0,
    learning: 0,
    mature: 0,
    weak: 0,
    mastery: 0,
    mastered: 0,
  };

  const counts = $derived.by<ScopeCounts | null>(() => {
    const all = app.stats;
    if (scope.kind === 'all') {
      if (all === null) return null;
      return {
        total: all.total,
        due: all.due,
        new: all.new,
        learning: all.learning,
        mature: all.mature,
        weak: all.weak,
        mastery: all.mastery,
        mastered: all.mastered,
      };
    }
    if (scope.kind === 'deck') {
      const deck = all?.byDeck[scope.deckId];
      if (deck === undefined) return null;
      return {
        total: deck.total,
        due: deck.due,
        new: deck.new,
        learning: deck.learning,
        mature: deck.mature,
        weak: deck.weak,
        mastery: deck.mastery,
        mastered: deck.mastered,
      };
    }
    const info = lessonInfo;
    if (info === null) return null;
    return {
      total: info.count,
      due: info.due,
      new: info.new,
      learning: info.learning,
      mature: info.mature,
      weak: info.weak,
      mastery: info.mastery,
      mastered: info.mastered,
    };
  });

  const total = $derived(counts?.total ?? 0);

  /**
   * Các trường của phạm vi với giá trị 0 khi chưa đọc xong.
   *
   * `counts` là `$derived` nên mỗi lần đọc trong template là một lần gọi lại —
   * TypeScript không giữ được thu hẹp `null` giữa các lần đọc đó. Một biến đã
   * thu hẹp sẵn cho template vừa tránh lặp `?? 0` ở từng chỗ, vừa không che mất
   * nhánh `counts === null` phía trên (nhánh đó vẫn dùng `counts` gốc).
   */
  const view = $derived(counts ?? EMPTY_COUNTS);

  // ── Kế hoạch phiên: bộ lọc + xem trước ──────────────────────────────────

  /** Phiên bản của lần tính gần nhất — kết quả cũ về muộn bị bỏ qua. */
  let planSequence = 0;
  let plan = $state.raw<{ cards: Card[]; count: number } | null>(null);
  let drawCount = $state(0);
  let counting = $state(true);

  $effect(() => {
    const cards = app.cards;
    const limit = app.settings.dailyNewLimit;
    const selectedFocus = focus;
    const currentScope = scope;

    if (selectedFocus === 'random') {
      // Phiên bốc thăm không có danh sách cố định để xem trước: nội dung được
      // trộn lúc bắt đầu. Con số là số thẻ sẽ bốc, tính cùng công thức với phiên.
      planSequence += 1;
      drawCount = randomDrawSize(catalogCards(cards).length, limit);
      plan = null;
      counting = false;
      return;
    }

    void computePlan(currentScope, selectedFocus, limit, cards);
  });

  async function computePlan(
    currentScope: (typeof scope),
    selectedFocus: StudyFocus,
    limit: number,
    cards: Card[],
  ): Promise<void> {
    const filter = sessionFilter(
      { scope: currentScope, mode, focus: selectedFocus },
      limit,
    );
    if (filter === null) return;
    const sequence = ++planSequence;
    counting = true;
    const found = await cardsFilter(cards, filter, Date.now());
    if (sequence !== planSequence) return;
    const byId = new Map(cards.map((card) => [card.id, card]));
    const list = found.ids
      .map((id) => byId.get(id))
      .filter((card): card is Card => card !== undefined);
    plan = { cards: list, count: list.length };
    counting = false;
  }

  const availableCount = $derived(focus === 'random' ? drawCount : (plan?.count ?? 0));
  const ready = $derived(focus === 'random' ? !counting : plan !== null);

  /** Lý do nút Bắt đầu bị vô hiệu — nút chết phải nói được vì sao nó chết. */
  const emptyReason = $derived.by(() => {
    if (focus === 'weak') return 'Không có thẻ chưa thuộc trong phạm vi này.';
    if (focus === 'random') {
      return app.settings.dailyNewLimit < 1
        ? 'Giới hạn thẻ mới mỗi ngày đang là 0 — tăng trong Cài đặt để bốc thẻ ngẫu nhiên.'
        : 'Danh mục học chưa có thẻ nào để bốc.';
    }
    return 'Không còn thẻ tới hạn trong phạm vi này.';
  });

  function selectFocus(next: StudyFocus): void {
    focus = next;
    app.setCollectionOptions({ focus: next });
  }

  function onFocusSelect(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (value === 'due' || value === 'weak' || value === 'random') selectFocus(value);
  }

  function onModeSelect(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (value !== 'flip' && value !== 'type') return;
    mode = value;
    app.setCollectionOptions({ mode: value });
  }

  function start(): void {
    if (!ready || availableCount === 0) return;
    app.startSession({ scope, mode, focus });
  }

  const startLabel = $derived.by(() => {
    if (focus === 'random') return `Học ngẫu nhiên · ${drawCount} thẻ`;
    if (counting || !ready) return 'Đang đếm thẻ…';
    if (availableCount === 0) return 'Không có thẻ để học';
    return focus === 'weak'
      ? `Củng cố thẻ chưa thuộc · ${availableCount} thẻ`
      : `Bắt đầu ôn · ${availableCount} thẻ`;
  });

  const masteryPercent = $derived(percent(view.mastered, view.total));
</script>

<main class="screen">
  <PageHeader {title} {subtitle} onBack={() => app.back()} />
  <p class="path muted">{path}</p>

  {#if counts === null && scope.kind === 'lesson' && lessons.length === 0}
    <!-- Bài học đang đọc số liệu: im lặng thay vì hiện "0 thẻ" rồi đổi ngay. -->
    <section class="card skeleton" aria-busy="true" aria-label="Đang đọc tiến độ bài học">
      <i></i><i></i><i></i>
    </section>
  {:else if bundle === null && scope.kind === 'deck' && kanjiCategory !== null && total === 0}
    <!-- Nhóm Kanji chưa được phát hành: danh mục có sẵn nhưng bộ thẻ chưa có, nên
         không có gì để cấu hình hay bắt đầu. -->
    <section class="card rise">
      <div class="empty-state" role="status">
        <span class="empty-mark" aria-hidden="true">文</span>
        <h2>Nội dung đang được chuẩn bị</h2>
        <p class="muted">
          Nhóm {kanjiCategory.label} đã có trong danh mục giáo trình. Khi bộ thẻ được phát
          hành, bạn sẽ học trực tiếp tại đây.
        </p>
        <button class="btn btn-inline" onclick={() => app.go('kanji')}>
          <Icon name="chevron" size={16} width={2.4} />
          Về danh mục Kanji
        </button>
      </div>
    </section>
  {:else if total === 0}
    <!-- Phạm vi rỗng thật: nói rõ vì sao trống và chỉ đúng nơi có thể lấp nó. -->
    <section class="card rise">
      <div class="empty-state" role="status">
        <span class="empty-mark" aria-hidden="true">空</span>
        <h2>Chưa có thẻ nào</h2>
        <p class="muted">
          {#if scope.kind === 'lesson'}
            {scope.deckId === 'patterns' ? `Mẫu câu bài ${scope.lesson} chưa có mẫu câu.` : `Bài ${scope.lesson} chưa có thẻ từ vựng. Các bài khác có thể đã có nội dung.`}
          {:else if scope.kind === 'all'}
            Thư viện đang trống. Nhập bộ thẻ của bạn hoặc tự tạo thẻ để bắt đầu.
          {:else}
            Bộ này chưa có thẻ nào. Thêm thẻ trong Trình biên tập hoặc nhập từ tệp.
          {/if}
        </p>
        <div class="empty-actions">
          {#if scope.kind === 'lesson'}
            <button class="btn btn-inline" onclick={() => app.go('lessons')}>
              <Icon name="chevron" size={16} width={2.4} />
              Chọn bài khác
            </button>
          {:else if scope.kind === 'all'}
            <button class="btn btn-inline" onclick={() => app.go('transfer')}>
              <Icon name="upload" size={16} />
              Nhập dữ liệu
            </button>
          {:else}
            <button class="btn btn-inline" onclick={() => app.go('editor')}>
              <Icon name="edit" size={16} />
              Mở trình biên tập
            </button>
          {/if}
        </div>
      </div>
    </section>
  {:else}
    <div class="layout">
      <div class="column">
        <section class="card rise" style="--rise-delay: 0ms">
          <div class="section-head">
            <h2>Phạm vi học</h2>
            <span class="section-tag">
              {#if scope.kind === 'lesson'}{scope.deckId === 'patterns' ? `Mẫu câu bài ${scope.lesson}` : `Bài ${scope.lesson}`}
              {:else if scope.kind === 'all'}Toàn thư viện
              {:else}{scope.deckId === 'patterns' ? 'Tất cả mẫu câu' : 'Bộ thẻ'}{/if}
            </span>
          </div>

          <!-- Bốn con số đếm được của phạm vi; "tới hạn" là con số hành động. -->
          <div class="grid-stats">
            <div class="stat tint-total">
              <b><span class="tnum">{total}</span></b>
              <span>Tổng thẻ</span>
            </div>
            <div class="stat tint-due">
              <b><span class="tnum">{view.due}</span></b>
              <span>Tới hạn</span>
            </div>
            <div class="stat tint-new">
              <b><span class="tnum">{view.new}</span></b>
              <span>Chưa học</span>
            </div>
            <div class="stat tint-weak">
              <b><span class="tnum">{view.weak}</span></b>
              <span>Chưa thuộc</span>
            </div>
          </div>

          <div class="mastery">
            <div class="mastery-head">
              <span class="gauge-label">Thành thạo</span>
              <b class="tnum">{masteryPercent}%</b>
            </div>
            <div
              class="progress"
              role="progressbar"
              aria-valuenow={masteryPercent}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-label="Độ thành thạo"
            >
              <i style="width: {masteryPercent}%"></i>
            </div>
            <span class="muted gauge-hint tnum">
              {view.mastered}/{view.total} thẻ đạt ngưỡng thành thạo
            </span>
          </div>

          <StructureBar
            newCount={view.new}
            learning={view.learning}
            mature={view.mature}
            label={barLabel(view)}
          />
          <p class="muted structure-hint tnum">
            {view.new} chưa học · {view.learning} đang học · {view.mature} nhớ lâu
          </p>
        </section>

        {#if focus !== 'random' && plan !== null}
          <section class="card rise" style="--rise-delay: 80ms">
            <div class="section-head">
              <h2>Sẽ học</h2>
              <span class="section-tag tnum">{plan.count} thẻ</span>
            </div>
            {#if plan.count === 0}
              <p class="muted">{emptyReason}</p>
            {:else}
              <ol class="preview">
                {#each plan.cards.slice(0, PREVIEW_LIMIT) as card, index (card.id)}
                  <li class="preview-row rise" style="--rise-delay: {staggerDelay(index, 30)}">
                    <span class="preview-n tnum" aria-hidden="true">{index + 1}</span>
                    <span class="preview-body">
                      <strong>{card.front}</strong>
                      <span class="muted">{card.back}</span>
                    </span>
                    {#if scope.kind === 'all'}
                      <span class="preview-deck">{app.deckName(card.deckId)}</span>
                    {/if}
                  </li>
                {/each}
              </ol>
              {#if plan.count > PREVIEW_LIMIT}
                <p class="muted more tnum">
                  … và {plan.count - PREVIEW_LIMIT} thẻ nữa trong phiên.
                </p>
              {/if}
            {/if}
          </section>
        {/if}
      </div>

      <div class="column">
        <section class="card rise" style="--rise-delay: 40ms">
          <div class="section-head">
            <h2>Thiết lập phiên</h2>
            <span class="section-tag">Study</span>
          </div>

          <label class="field">
            <span>Chế độ</span>
            <select value={mode} onchange={onModeSelect}>
              <option value="flip">Lật thẻ và tự chấm (cập nhật lịch ôn)</option>
              <option value="type">Tự trả lời (chỉ đánh dấu đúng/sai)</option>
            </select>
          </label>

          <label class="field" style="margin-top: 12px">
            <span>Thẻ cần học</span>
            <select value={focus} onchange={onFocusSelect}>
              <option value="due">Thẻ tới hạn (giới hạn thẻ mới mỗi ngày)</option>
              <option value="weak">Thẻ chưa thuộc (không giới hạn theo ngày)</option>
              {#if randomAllowed}
                <option value="random">Học ngẫu nhiên (bốc từ cả ba chủ đề)</option>
              {/if}
            </select>
          </label>

          <p class="muted field-hint">
            {#if focus === 'due'}
              Tối đa {app.settings.dailyNewLimit} thẻ mới/ngày; thẻ đã học không bị giới hạn.
            {:else if focus === 'weak'}
              Lọc theo dấu sai bài kiểm tra hoặc lần tự chấm Again/Hard. Lật thẻ cập nhật
              SM-2; tự trả lời chỉ luyện, không đổi lịch ôn.
            {:else}
              Bốc {drawCount} thẻ từ ba chủ đề Từ vựng, Kanji, Mẫu câu — không phân biệt
              tới hạn.
            {/if}
          </p>

          <button
            class="btn btn-primary btn-inline start"
            disabled={!ready || availableCount === 0}
            onclick={start}
          >
            <Icon name={availableCount === 0 ? 'check' : focus === 'random' ? 'shuffle' : 'study'} size={18} />
            {startLabel}
          </button>
          {#if ready && availableCount === 0}
            <p class="muted field-hint">{emptyReason}</p>
          {/if}
        </section>
      </div>
    </div>
  {/if}
</main>

<style>
  .path {
    margin: -6px 0 0;
    font-size: 0.78rem;
    letter-spacing: 0.01em;
  }

  .layout {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .column {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  /* › Màn rộng: hai cột. Bên trái là "sẽ học gì", bên phải là "cấu hình và bắt
     đầu" — người học đọc và hành động mà không phải cuộn qua lại trên màn hình
     ngang. Trên điện thoại hai cột xếp dọc theo đúng thứ tự đó. */
  @media (min-width: 900px) {
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.85fr);
      gap: 18px;
      align-items: start;
    }

    .column {
      gap: 18px;
    }

    .column:last-child {
      position: sticky;
      top: 12px;
    }
  }

  .tint-total {
    --stat-tint: var(--border-strong);
  }
  .tint-due {
    --stat-tint: var(--accent);
  }
  .tint-new {
    --stat-tint: var(--rate-easy);
  }
  .tint-weak {
    --stat-tint: var(--rate-again);
  }

  .grid-stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .grid-stats .stat {
    padding: 10px 8px;
  }

  .mastery {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .mastery-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .gauge-label {
    font-size: 0.82rem;
    font-weight: 600;
  }

  .mastery-head b {
    font-size: 0.95rem;
    color: var(--accent-strong);
  }

  .gauge-hint {
    font-size: 0.72rem;
  }

  .structure-hint {
    margin: 6px 0 0;
    font-size: 0.72rem;
  }

  .preview {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .preview-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }

  .preview-n {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
    border-radius: 8px;
    background: var(--accent-soft);
    color: var(--ok);
    font-size: 0.72rem;
    font-weight: 700;
  }

  .preview-body {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }

  .preview-body strong {
    font-size: 0.88rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preview-body .muted {
    font-size: 0.74rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preview-deck {
    flex: 0 0 auto;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--muted);
    font-size: 0.68rem;
    font-weight: 600;
  }

  .more {
    margin: 10px 0 0;
    font-size: 0.76rem;
  }

  .field-hint {
    margin: 12px 0 0;
    font-size: 0.78rem;
  }

  .start {
    width: 100%;
    margin-top: 16px;
    min-height: 48px;
  }

  .empty-state {
    display: grid;
    justify-items: center;
    gap: 10px;
    padding: 24px 18px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface-2);
    text-align: center;
  }

  .empty-mark {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 16px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 1.5rem;
    font-weight: 700;
  }

  .empty-state h2 {
    font-size: 1rem;
  }

  .empty-state p {
    max-width: 32rem;
    margin: 0;
  }

  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 6px;
  }

  .skeleton {
    min-height: 208px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 12px;
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
    width: 34%;
  }
  .skeleton i:nth-child(2) {
    width: 86%;
    height: 26px;
  }
  .skeleton i:nth-child(3) {
    width: 58%;
  }

  @keyframes shimmer {
    from {
      background-position: 140% 0;
    }
    to {
      background-position: -40% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton i {
      animation: none;
    }
  }
</style>
