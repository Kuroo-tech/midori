<script lang="ts">
  /**
   * Màn Thống kê chi tiết.
   *
   * Đây là màn CHỈ ĐỌC: tiến độ của toàn thư viện, từng bài Minna, từng nhóm
   * Kanji và bộ Mẫu câu. Danh sách ĐẦY ĐỦ mọi bộ có trong thư viện nằm ở Trang
   * chủ ("Danh mục học" cho ba chủ đề + "Bộ khác" cho bộ tự tạo/nhập); các mục ở
   * đây là góc nhìn chủ đề song song với "Danh mục học" (Từ vựng → Kanji → Mẫu
   * câu). Cùng con số với hàng tương ứng ở Trang chủ là chủ ý: cả hai đọc chung
   * một `deckStats` của lõi Rust, không phải hai nguồn đếm.
   *
   * Mọi con số đều đến từ lõi Rust: `app.stats` (`deckStats`) cho toàn thư viện
   * và từng bộ, `lessonSummary` cho từng bài. Giao diện KHÔNG tự đếm thẻ — nhờ
   * vậy "tới hạn", "chưa thuộc", "thành thạo" luôn khớp quy tắc nghiệp vụ thật,
   * và ba nhóm chưa học / đang học / nhớ lâu luôn cộng đúng bằng tổng số thẻ.
   *
   * Hai thước đo tách biệt vẫn giữ nguyên như thiết kế (xem `docs/design-system.md`):
   * "Thành thạo" suy từ lịch ôn dài hạn, "Làm bài" là điểm của lần làm bài gần
   * nhất. Gộp chúng thành một con số sẽ nói dối người học theo cả hai hướng.
   */
  import { onMount } from 'svelte';

  import { KANJI_CATEGORIES } from '../app/content-sections.ts';
  import { app } from '../app/store.svelte.ts';
  import { lessonSummary, type LessonInfo } from '../core/index.ts';
  import AnimatedNumber from './AnimatedNumber.svelte';
  import DeckRow from './DeckRow.svelte';
  import { barLabel, deckRow, percent } from './deck-rows.ts';
  import PageHeader from './PageHeader.svelte';
  import StructureBar from './StructureBar.svelte';

  let lessons = $state.raw<LessonInfo[]>([]);
  /** Chỉ hiện bài đã có thẻ — 40+ bài còn trống dữ liệu không phải thông tin. */
  let onlyWithCards = $state(true);

  onMount(() => {
    void refreshLessons();
  });

  async function refreshLessons(): Promise<void> {
    // Mục "Bài Minna" chỉ nói về Từ vựng. Mẫu câu cũng có số bài 1–50 từ khi
    // được gắn bài, nên đưa cả thư viện vào sẽ cộng lẫn hai bộ trong cùng một hàng.
    const vocabulary = app.cards.filter((card) => card.deckId === 'vocabulary');
    lessons = await lessonSummary(vocabulary, Date.now());
  }

  // Thống kê tổng hợp phải được TÍNH LẠI khi mở màn này: một phiên học dở dang
  // có thể đã chấm thẻ rồi thoát giữa đường mà chưa kịp làm mới `app.stats`.
  $effect(() => {
    if (app.cards.length > 0) {
      void app.refreshStats();
      void refreshLessons();
    }
  });

  /**
   * Bảy nhóm Kanji là danh mục CỐ ĐỊNH của giáo trình, như 50 bài Minna, nên
   * hiện đủ bảy hàng kể cả nhóm chưa có nội dung — bỏ sót nhóm nào sẽ khiến
   * danh sách trông như lỗi. Nhãn lấy từ danh mục (`Danh từ`…), không lấy từ
   * tên bộ (`Kanji — Danh từ`), để hàng đọc ngay trong ngữ cảnh mục Kanji.
   */
  const kanjiRows = $derived(
    KANJI_CATEGORIES.map((category) => deckRow(app.stats, category.deckId, category.label)),
  );

  const kanjiWithCards = $derived(kanjiRows.filter((row) => row.total > 0).length);

  /**
   * Bộ Mẫu câu gồm nhiều bài nhưng Thống kê chi tiết vẫn gộp thành MỘT hàng theo
   * bộ, song song với hàng chủ đề ở Trang chủ. Tên dự phòng là nhãn chủ đề: khi
   * nội dung chưa đồng bộ, `deckName` rơi về id thô ("patterns") — đó không phải
   * chữ để hiện cho người học.
   */
  const patternsRow = $derived.by(() => {
    const row = deckRow(app.stats, 'patterns', app.deckName('patterns'));
    return row.name === 'patterns' ? { ...row, name: 'Mẫu câu' } : row;
  });

  /** Tổng quan: đọc thẳng từ lõi, chỉ đổi sang phần trăm để hiển thị. */
  const overview = $derived.by(() => {
    const stats = app.stats;
    const mastery = stats?.mastery ?? 0;
    const graded = stats?.graded ?? 0;
    const total = stats?.total ?? 0;
    return {
      total,
      due: stats?.due ?? 0,
      new: stats?.new ?? 0,
      learning: stats?.learning ?? 0,
      mature: stats?.mature ?? 0,
      weak: stats?.weak ?? 0,
      weakRating: stats?.weakRating ?? 0,
      weakQuiz: stats?.weakQuiz ?? 0,
      mastery,
      masteryPercent: Math.round(mastery * 100),
      mastered: stats?.mastered ?? 0,
      accuracy: stats?.accuracy ?? 0,
      graded,
      accuracyPercent: Math.round((stats?.accuracy ?? 0) * 100),
      // Chưa làm bài lần nào thì KHÔNG hiển thị "0%" — đó là "chưa có dữ liệu",
      // không phải "kém".
      hasAccuracy: graded > 0,
    };
  });

  const lessonsWithCards = $derived(lessons.filter((lesson) => lesson.count > 0));
  const coveredCards = $derived(
    lessonsWithCards.reduce((sum, lesson) => sum + lesson.count, 0),
  );
  const visibleLessons = $derived(
    onlyWithCards ? lessonsWithCards : lessons,
  );

  /** Nhãn mô tả độ thành thạo bằng lời, để con số không phải tự giải thích. */
  function masteryLabel(value: number): string {
    if (value >= 0.75) return 'vững';
    if (value >= 0.5) return 'chắc';
    if (value > 0) return 'đang lên';
    return 'chưa bắt đầu';
  }
</script>

<main class="screen">
  <PageHeader
    title="Thống kê chi tiết"
    subtitle="Tiến độ toàn thư viện, bài Minna, nhóm Kanji và mẫu câu."
    onBack={() => app.back()}
  />

  <section class="card rise" style="--rise-delay: 0ms">
    <div class="section-head">
      <h2>Tổng quan</h2>
      <span class="section-tag">Overview</span>
    </div>

    <!-- Bốn ô là bốn trạng thái đếm được của thẻ: ba nhóm chưa học/đang học/nhớ
         lâu cộng lại ĐÚNG BẰNG tổng thư viện, còn "tới hạn" là con số hành động
         hôm nay. Nhiều ô hơn thế sẽ khiến mắt không biết nhìn đâu trước.

         Số đếm lên khi giá trị đổi (`AnimatedNumber`); lần dựng đầu hiện ngay giá
         trị cuối vì thống kê đã được nạp xong trước khi màn hình hiện ra. -->
    <div class="grid-stats">
      <div class="stat tint-due">
        <b><AnimatedNumber value={overview.due} /></b>
        <span>Tới hạn</span>
      </div>
      <div class="stat tint-new">
        <b><AnimatedNumber value={overview.new} /></b>
        <span>Chưa học</span>
      </div>
      <div class="stat tint-learning">
        <b><AnimatedNumber value={overview.learning} /></b>
        <span>Đang học</span>
      </div>
      <div class="stat tint-mature">
        <b><AnimatedNumber value={overview.mature} /></b>
        <span>Nhớ lâu</span>
      </div>
    </div>

    <ul class="breakdown">
      <li>
        <span class="dot dot-weak" aria-hidden="true"></span>
        <span>
          Chưa thuộc: <b class="tnum">{overview.weak}</b> thẻ —
          <span class="tnum">{overview.weakRating}</span> tự chấm yếu ·
          <span class="tnum">{overview.weakQuiz}</span> làm sai bài kiểm tra
        </span>
      </li>
      <li>
        <span class="dot dot-ok" aria-hidden="true"></span>
        <span>
          Đã thành thạo: <b class="tnum">{overview.mastered}</b> thẻ trong
          <span class="tnum">{overview.total}</span> thẻ
        </span>
      </li>
      <li>
        <span class="dot dot-graded" aria-hidden="true"></span>
        <span>
          Đã từng làm bài: <b class="tnum">{overview.graded}</b> thẻ
        </span>
      </li>
    </ul>

    <!-- Hai thanh ở hai dòng riêng, nhãn riêng: một cái đo TRÍ NHỚ DÀI HẠN (suy
         từ lịch ôn), một cái đo LẦN LÀM BÀI GẦN NHẤT. Trộn chúng thành một con
         số sẽ nói dối người học theo cả hai hướng. -->
    <div class="gauges">
      <div class="gauge" role="group" aria-label="Độ thành thạo">
        <div class="gauge-head">
          <span class="gauge-label">Thành thạo</span>
          <b class="tnum"><AnimatedNumber value={overview.masteryPercent} />%</b>
        </div>
        <div
          class="progress"
          role="progressbar"
          aria-valuenow={overview.masteryPercent}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label="Độ thành thạo trung bình"
        >
          <i style="width: {overview.masteryPercent}%"></i>
        </div>
        <span class="gauge-hint muted">
          Theo lịch ôn, tính cả thẻ chưa học · {masteryLabel(overview.mastery)} ·
          {overview.mastered} thẻ đạt ngưỡng
        </span>
      </div>
      <div class="gauge" role="group" aria-label="Độ chính xác khi làm bài">
        <div class="gauge-head">
          <span class="gauge-label">Làm bài</span>
          <b class="tnum"
            >{#if overview.hasAccuracy}<AnimatedNumber value={overview.accuracyPercent} />%{:else}—{/if}</b
          >
        </div>
        <div
          class="progress"
          role="progressbar"
          aria-valuenow={overview.hasAccuracy ? overview.accuracyPercent : 0}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label="Điểm làm bài gần nhất"
        >
          <i style="width: {overview.hasAccuracy ? overview.accuracyPercent : 0}%"></i>
        </div>
        <span class="gauge-hint muted">
          {overview.hasAccuracy
            ? `Điểm lần làm bài gần nhất · ${overview.graded} thẻ đã làm`
            : 'chưa làm bài lần nào'}
        </span>
      </div>
    </div>
  </section>

  <section class="card rise" style="--rise-delay: 80ms">
    <div class="section-head">
      <h2>Bài Minna</h2>
      <span class="section-tag">{lessonsWithCards.length}/{lessons.length} bài</span>
    </div>

    <p class="muted lesson-summary">
      <span class="tnum">{coveredCards}</span> thẻ trên
      <span class="tnum">{lessonsWithCards.length}</span> bài có nội dung.
      Các bài còn lại chưa có nội dung.
    </p>

    <label class="switch">
      <input type="checkbox" bind:checked={onlyWithCards} />
      <span class="track" aria-hidden="true"></span>
      <span class="switch-label">Chỉ bài có thẻ</span>
    </label>

    <div class="lesson-list">
      {#each visibleLessons as lesson (lesson.n)}
        <div class="lesson-row" class:empty={lesson.count === 0}>
          <span class="lesson-n tnum" aria-hidden="true">{lesson.n}</span>
          <span class="lesson-main">
            <span class="lesson-top">
              <strong>{lesson.label}</strong>
              {#if lesson.due > 0}
                <span class="lesson-badge tnum">{lesson.due} tới hạn</span>
              {:else if lesson.count > 0}
                <span class="lesson-badge badge-plain tnum">
                  {percent(lesson.mastered, lesson.count)}% thành thạo
                </span>
              {/if}
            </span>
            {#if lesson.count === 0}
              <span class="muted lesson-meta">Chưa có nội dung</span>
            {:else}
              <StructureBar
                small
                newCount={lesson.new}
                learning={lesson.learning}
                mature={lesson.mature}
                label={barLabel({
                  total: lesson.count,
                  new: lesson.new,
                  learning: lesson.learning,
                  mature: lesson.mature,
                })}
              />
              <span class="muted lesson-meta tnum">
                {lesson.count} thẻ · {lesson.new} chưa học · {lesson.learning} đang học ·
                {lesson.mature} nhớ lâu{#if lesson.weak > 0} · {lesson.weak} chưa thuộc{/if}{#if lesson.graded > 0} · làm bài {Math.round(lesson.accuracy * 100)}%{/if}
              </span>
            {/if}
          </span>
        </div>
      {/each}
    </div>
  </section>

  <!-- Hai mục theo chủ đề: cùng thứ bậc với "Bài Minna" và với "Danh mục học" ở
       màn Học (Từ vựng → Kanji → Mẫu câu). Bảy nhóm Kanji hiện đủ bảy hàng; bộ
       Mẫu câu gộp thành một hàng theo bộ. -->
  <section class="card rise" style="--rise-delay: 240ms">
    <div class="section-head">
      <h2>Kanji</h2>
      <span class="section-tag">{kanjiWithCards}/{KANJI_CATEGORIES.length} nhóm có nội dung</span>
    </div>
    <div class="list">
      {#each kanjiRows as row (row.id)}
        <DeckRow row={row} emptyText="Nhóm chưa có thẻ nào" />
      {/each}
    </div>
  </section>

  <section class="card rise" style="--rise-delay: 320ms">
    <div class="section-head">
      <h2>Mẫu câu</h2>
      <span class="section-tag">{patternsRow.total} thẻ</span>
    </div>
    <div class="list">
      <DeckRow row={patternsRow} emptyText="Bộ chưa có thẻ nào" />
    </div>
  </section>
</main>

<style>
  /* ── Tổng quan ───────────────────────────────────────────────────── */

  .tint-due {
    --stat-tint: var(--accent);
  }
  .tint-new {
    --stat-tint: var(--rate-easy);
  }
  .tint-learning {
    --stat-tint: var(--warn);
  }
  .tint-mature {
    --stat-tint: var(--ok);
  }

  .breakdown {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 14px 0 0;
    padding: 0;
    list-style: none;
    font-size: 0.8rem;
  }

  .breakdown li {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .dot {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    transform: translateY(-1px);
  }

  .dot-weak {
    background: var(--rate-again);
  }

  .dot-ok {
    background: var(--accent);
  }

  .dot-graded {
    background: var(--rate-hard);
  }

  .gauges {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 14px;
    margin-top: 16px;
  }

  .gauge {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .gauge-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .gauge-label {
    font-size: 0.82rem;
    font-weight: 600;
  }

  .gauge-head b {
    font-size: 0.95rem;
    color: var(--accent-strong);
  }

  .gauge-hint {
    font-size: 0.72rem;
  }

  /* ── Danh sách bộ thẻ và bài Minna ───────────────────────────────── */

  .list,
  .lesson-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
  }

  /* Hàng bài chỉ để ĐỌC: không phải nút, không hover, không `:active` — không có
     chỗ nào để bấm. Hàng bộ thẻ dùng chung `DeckRow.svelte` với Trang chủ. */
  .lesson-row {
    width: 100%;
    text-align: left;
    border: 1px solid var(--border);
    background: linear-gradient(180deg, var(--surface-2), color-mix(in srgb, var(--surface-2) 80%, var(--surface)));
    border-radius: var(--radius);
    padding: 12px;
  }

  /* Bài chưa có thẻ bị làm mờ để mắt bỏ qua khi quét danh sách. */
  .lesson-row.empty {
    opacity: 0.6;
  }

  .lesson-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    padding: 4px 8px;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
  }

  /* ── Danh sách bài Minna ─────────────────────────────────────────── */

  .lesson-summary {
    margin: 10px 0 12px;
    font-size: 0.8rem;
  }

  .lesson-row {
    display: flex;
    align-items: center;
    gap: 10px;
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

  .lesson-row.empty .lesson-n {
    background: var(--surface-3);
    color: var(--muted);
  }

  .lesson-main {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  .lesson-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .lesson-top strong {
    font-size: 0.9rem;
  }

  .lesson-badge {
    background: color-mix(in srgb, var(--accent) 16%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
    color: var(--ok);
  }

  .badge-plain {
    background: var(--surface);
    border-color: var(--border);
    color: var(--muted);
  }

  .lesson-meta {
    display: block;
    margin-top: 6px;
    font-size: 0.72rem;
    line-height: 1.4;
  }
</style>
