<script lang="ts">
  /**
   * Trang chủ — trả lời "học gì tiếp theo", rồi mới tới việc chọn nội dung.
   *
   * # Màn Học đã gộp vào đây
   *
   * Mục "Học" không còn là một tab riêng: việc chọn nội dung để học (ba chủ đề +
   * "Tất cả nội dung") và phiên đang dở nay nằm ngay trên Trang chủ. Nhờ vậy còn
   * đúng ba mục lớn — Trang chủ · Nhập/xuất · Cài đặt.
   *
   * # Thứ tự ưu tiên cố định
   *
   * 1. **Vùng hành động** (hero): một trạng thái duy nhất, theo đúng thứ tự
   *    thẻ tới hạn → thẻ mới → thẻ chưa thuộc → đã ôn hết → thư viện trống. Mỗi
   *    trạng thái có ĐÚNG một hành động chính, và mọi con số đều thật (đến từ lõi
   *    Rust hoặc từ phiên đã lưu), không có tiến độ giả.
   * 2. **Danh mục học**: ba chủ đề + hàng "Tất cả nội dung", dùng chung
   *    `StudyCategories`.
   * 3. **Phiên đang dở** (nếu có): thẻ "Tiếp tục phiên đang dở" với đúng tiến độ —
   *    lối vào DUY NHẤT của việc tiếp tục phiên, nên hero không lặp lại nó.
   * 4. **Bộ khác**: bộ người học tự tạo/nhập, KHÔNG thuộc ba chủ đề — hàng bấm mở
   *    thẳng Collection của bộ đó. Chỉ hiện khi có; thư viện lớn vẫn gọn vì đây là
   *    danh sách bộ, không phải danh sách thẻ.
   *
   * # Một chức năng, một nơi
   *
   * Trang chủ không chạy phiên, không quản lý nội dung, không đổi cài đặt: mỗi nút
   * ở đây hoặc mở phiên đang dở, hoặc mở Collection/Nhập-xuất. Số liệu thư viện
   * chi tiết đã chuyển sang Cài đặt cùng mục Thư viện.
   *
   * Mọi con số đến từ `deckStats` của lõi Rust (đã tải trong `app.stats`) hoặc từ
   * `app.openSession` đã đối chiếu — giao diện không tự đếm.
   */
  import { isStudyCatalogDeck } from '../app/content-sections.ts';
  import { catalogCards } from '../app/session-plan.ts';
  import { randomDrawSize } from '../app/random-study.ts';
  import { app } from '../app/store.svelte.ts';
  import { MULTI_DECK_SESSION_ID, type StudyFocus } from '../storage/session.ts';
  import AnimatedNumber from './AnimatedNumber.svelte';
  import DeckRow from './DeckRow.svelte';
  import { deckRow } from './deck-rows.ts';
  import Icon from './Icon.svelte';
  import StudyCategories from './StudyCategories.svelte';

  // Số liệu có thể đã cũ sau một phiên học ở tab khác hoặc sau khi khôi phục
  // backup; làm mới khi màn hình được dựng.
  $effect(() => {
    void app.refreshStats();
  });

  const stats = $derived(app.stats);
  const total = $derived(stats?.total ?? 0);
  const newCount = $derived(stats?.new ?? 0);
  /**
   * Thẻ mới CÓ THỂ học hôm nay. `stats.new` là toàn bộ thẻ chưa học trong thư
   * viện, không phải số thẻ giới hạn ngày cho phép — hiện nguyên con số đó lên
   * hero từng khiến Cài đặt 0 thẻ/ngày vẫn mời "Học thẻ mới" rồi mở Collection
   * trống. Tách hai con số để lời mời khớp với hàng đợi thật.
   */
  const newLimit = $derived(Math.max(0, Math.round(app.settings.dailyNewLimit)));
  const newToday = $derived(Math.min(newCount, newLimit));
  /**
   * Thẻ ĐÃ LÊN LỊCH và tới hạn. `due` của lõi bao gồm cả thẻ mới (`new ⊆ due`),
   * nên phải trừ đi mới biết phần "cần ôn lại" — nếu không, cùng một thẻ vừa được
   * đếm ở "thẻ mới" vừa được đếm ở "tới hạn".
   */
  const reviewDue = $derived(Math.max(0, (stats?.due ?? 0) - newCount));
  const weak = $derived(stats?.weak ?? 0);

  const resume = $derived(app.openSession);

  /** Phiên ngẫu nhiên chỉ bốc được khi danh mục có thẻ và giới hạn thẻ mới > 0. */
  const randomCount = $derived(
    randomDrawSize(catalogCards(app.cards).length, app.settings.dailyNewLimit),
  );

  const resumeLabel = $derived.by(() => {
    const session = resume;
    if (session === null) return '';
    if (session.lesson !== undefined) {
      return `${app.deckName(session.deckId)} · Bài ${session.lesson}`;
    }
    if (session.deckId === MULTI_DECK_SESSION_ID) {
      return session.focus === 'random' ? 'Cả ba chủ đề' : 'Tất cả nội dung';
    }
    return app.deckName(session.deckId);
  });

  const resumeProgress = $derived(
    resume === null || resume.queue.length === 0
      ? 0
      : (resume.index / resume.queue.length) * 100,
  );

  /**
   * Bộ KHÔNG thuộc danh mục học (Từ vựng / Kanji / Mẫu câu): bộ người học tự tạo
   * hoặc nhập vào. Ba chủ đề đã có mặt ở mục "Danh mục học" phía trên, nên ở đây
   * không lặp lại — một bộ không được sống ở hai mục cùng lúc.
   */
  const otherRows = $derived.by(() => {
    const byDeck = app.stats?.byDeck ?? {};
    return Object.keys(byDeck)
      .filter((id) => !isStudyCatalogDeck(id))
      .sort((a, b) => app.deckName(a).localeCompare(app.deckName(b), 'vi'))
      .map((id) => deckRow(app.stats, id, app.deckName(id)));
  });

  /** Mọi hành động bắt đầu học đều đi qua Collection — không có lối tắt. */
  function studyAll(focus: StudyFocus): void {
    app.goCollection({ kind: 'all' }, { focus });
  }
</script>

<main class="screen">
  <!-- Vùng hành động: MỘT trạng thái, MỘT hành động chính. Thứ tự nhánh chính là
       thứ tự ưu tiên: tới hạn, thẻ mới, chưa thuộc, cuối cùng mới là "không còn gì
       gấp". Phiên đang dở không nằm ở đây mà có thẻ riêng ngay dưới danh mục. -->
  <section class="card hero rise" style="--rise-delay: 0ms">
    {#if total === 0}
      <span class="hero-tag">Bắt đầu</span>
      <h1 class="hero-title">Thư viện đang trống</h1>
      <p class="hero-body muted">
        Nhập bộ thẻ của bạn trong Nhập/xuất, hoặc tự tạo thẻ mới trong Trình biên tập.
      </p>
      <div class="hero-actions">
        <button class="btn btn-primary btn-inline" onclick={() => app.go('transfer')}>
          <Icon name="upload" size={18} />
          Nhập dữ liệu
        </button>
        <button class="btn btn-inline" onclick={() => app.go('editor')}>
          <Icon name="edit" size={18} />
          Tạo thẻ mới
        </button>
      </div>
    {:else if reviewDue > 0}
      <span class="hero-tag">Ưu tiên hôm nay</span>
      <h1 class="hero-title"><AnimatedNumber value={reviewDue} /> thẻ đã đến hạn ôn</h1>
      <p class="hero-body muted">
        Ôn hết phần đến hạn trước khi học thêm nội dung mới. Số thẻ mới mỗi ngày được
        giới hạn trong Cài đặt.
      </p>
      <div class="hero-actions">
        <button class="btn btn-primary btn-inline" onclick={() => studyAll('due')}>
          <Icon name="refresh" size={18} />
          Ôn thẻ tới hạn
        </button>
      </div>
    {:else if newToday > 0}
      <span class="hero-tag">Bắt đầu</span>
      <h1 class="hero-title"><AnimatedNumber value={newToday} /> thẻ mới hôm nay</h1>
      <p class="hero-body muted">
        Chưa có thẻ nào đến hạn ôn. Thư viện còn {newCount} thẻ mới; hôm nay bạn học
        tối đa {newLimit} thẻ theo giới hạn trong Cài đặt.
      </p>
      <div class="hero-actions">
        <button class="btn btn-primary btn-inline" onclick={() => studyAll('due')}>
          <Icon name="sparkle" size={18} />
          Học thẻ mới
        </button>
      </div>
    {:else if weak > 0}
      <span class="hero-tag">Cần củng cố</span>
      <h1 class="hero-title"><AnimatedNumber value={weak} /> thẻ chưa thuộc</h1>
      <p class="hero-body muted">
        Không còn thẻ tới hạn, nhưng còn thẻ bị đánh dấu chưa thuộc ở lần tự chấm hoặc
        bài kiểm tra gần nhất.
      </p>
      <div class="hero-actions">
        <button class="btn btn-primary btn-inline" onclick={() => studyAll('weak')}>
          <Icon name="refresh" size={18} />
          Củng cố thẻ chưa thuộc
        </button>
      </div>
    {:else if newCount > 0}
      <span class="hero-tag">Đã tắt thẻ mới</span>
      <h1 class="hero-title">Giới hạn thẻ mới đang là 0</h1>
      <p class="hero-body muted">
        Thư viện còn {newCount} thẻ mới, nhưng Cài đặt đang tắt học thẻ mới hôm nay.
        Tăng “Thẻ mới tối đa mỗi ngày” nếu muốn học tiếp.
      </p>
      <div class="hero-actions">
        <button class="btn btn-primary btn-inline" onclick={() => app.go('settings')}>
          <Icon name="settings" size={18} />
          Mở Cài đặt
        </button>
      </div>
    {:else}
      <span class="hero-tag">Đã xong</span>
      <h1 class="hero-title">Không còn thẻ tới hạn</h1>
      <p class="hero-body muted">
        Bạn đã ôn hết phần đến hạn hôm nay. Chọn một chủ đề ở dưới để học tiếp,
        hoặc bốc một phiên ngẫu nhiên từ ba chủ đề.
      </p>
      {#if randomCount > 0}
        <div class="hero-actions">
          <button class="btn btn-primary btn-inline" onclick={() => studyAll('random')}>
            <Icon name="shuffle" size={18} />
            Học ngẫu nhiên · {randomCount} thẻ
          </button>
        </div>
      {/if}
    {/if}
  </section>

  <!-- Ba chủ đề + hàng "Tất cả nội dung": nay là nơi DUY NHẤT chọn nội dung để
       học, vì mục Học đã gộp vào Trang chủ. Dùng chung component nên con số giữa
       các màn không bao giờ lệch. -->
  <StudyCategories showAll />

  <!-- Phiên đang dở: lối vào DUY NHẤT của việc tiếp tục phiên, nên vùng hành động
       phía trên không lặp lại cùng thông tin hai lần. -->
  {#if resume !== null}
    <section class="card continue-card rise" style="--rise-delay: 120ms">
      <div class="continue-head">
        <span class="continue-mark" aria-hidden="true"><Icon name="refresh" size={20} width={2.2} /></span>
        <div class="continue-body">
          <strong>Tiếp tục phiên đang dở</strong>
          <p class="muted tnum">
            {resumeLabel} · thẻ {Math.min(resume.index + 1, resume.queue.length)}/{resume.queue.length} · đã chấm {resume.rated}
          </p>
        </div>
      </div>
      <div
        class="continue-progress"
        role="progressbar"
        aria-label="Tiến độ phiên đang dở"
        aria-valuenow={Math.round(resumeProgress)}
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <i style="width: {resumeProgress}%"></i>
      </div>
      <button class="btn btn-primary btn-inline continue-btn" onclick={() => app.go('session')}>
        <Icon name="study" size={18} />
        Quay lại phiên học
      </button>
    </section>
  {/if}

  {#if otherRows.length > 0}
    <section class="card rise" style="--rise-delay: 180ms">
      <div class="section-head">
        <h2>Bộ khác</h2>
        <span class="section-tag tnum">{otherRows.length} bộ</span>
      </div>
      <p class="muted section-hint">
        Bộ bạn tự tạo hoặc nhập vào, không thuộc ba chủ đề ở trên. Bấm một bộ để mở
        Collection của nó.
      </p>
      <div class="list">
        {#each otherRows as row (row.id)}
          <DeckRow
            {row}
            emptyText="Bộ chưa có thẻ nào"
            openLabel="Mở {row.name}"
            onOpen={() => app.goCollection({ kind: 'deck', deckId: row.id })}
          />
        {/each}
      </div>
    </section>
  {/if}
</main>

<style>
  .hero {
    display: flex;
    flex-direction: column;
    gap: 10px;
    background:
      radial-gradient(120% 140% at 100% 0%, var(--accent-soft), transparent 55%),
      linear-gradient(180deg, var(--surface-2), var(--surface));
    border-color: color-mix(in srgb, var(--accent) 26%, var(--border));
  }

  .hero-tag {
    align-self: flex-start;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    background: var(--accent-soft);
    color: var(--ok);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .hero-title {
    margin: 0;
    font-size: 1.45rem;
    line-height: 1.25;
    letter-spacing: -0.015em;
    text-wrap: balance;
  }

  .hero-body {
    margin: 0;
    font-size: 0.86rem;
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }

  .hero-actions .btn {
    margin: 0;
  }

  .section-hint {
    margin: 4px 0 0;
    font-size: 0.78rem;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
  }

  /* ── Phiên đang dở ─────────────────────────────────────────────────────
     Cùng khuôn với thẻ "Tiếp tục" trước đây ở màn Học: viền và nền mang sắc
     nhấn để tách khỏi danh mục học bên trên, kèm thanh tiến độ thật của phiên. */
  .continue-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-color: color-mix(in srgb, var(--accent) 32%, transparent);
    background: linear-gradient(
      180deg,
      var(--accent-soft),
      color-mix(in srgb, var(--accent-soft) 55%, var(--surface))
    );
  }

  .continue-head {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .continue-mark {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    flex: 0 0 auto;
    border-radius: 12px;
    background: color-mix(in srgb, var(--accent) 18%, var(--surface));
    color: var(--ok);
  }

  .continue-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .continue-body strong {
    font-size: 0.95rem;
  }

  .continue-body .muted {
    margin: 0;
    font-size: 0.76rem;
  }

  .continue-progress {
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  }

  .continue-progress i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
    transition: width var(--dur-3) var(--ease-out);
  }

  .continue-btn {
    align-self: flex-start;
    margin: 0;
  }

  @media (min-width: 560px) {
    .continue-card {
      flex-direction: row;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }

    .continue-head {
      flex: 1;
      min-width: 0;
    }

    .continue-progress {
      width: 140px;
      flex: 0 0 auto;
    }

    .continue-btn {
      flex: 0 0 auto;
    }
  }
</style>
