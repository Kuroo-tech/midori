<script lang="ts">
  /**
   * Phiên học — nơi DUY NHẤT một phiên được chạy.
   *
   * # Phiên nhận cấu hình, không tự chọn nội dung
   *
   * Màn này không có ô chọn bộ, chọn bài hay chọn phạm vi thẻ: mọi lựa chọn đó
   * thuộc Collection (màn Quản lý nội dung). `app.startSession` để lại một
   * {@link SessionRequest} một lần, màn này tiêu thụ nó rồi dựng hàng đợi bằng
   * ĐÚNG bộ lọc mà Collection đã đếm (`sessionFilter` + `cardsFilter` của lõi Rust),
   * nên con số trên nút Bắt đầu và hàng đợi thật không thể lệch nhau.
   *
   * # Yêu cầu mới thắng, phiên trùng cấu hình được tiếp tục
   *
   * Khi có yêu cầu mới, phiên đang dở được giữ lại nếu cấu hình TRÙNG KHỚP (cùng
   * phạm vi, cùng chế độ, cùng phạm vi thẻ) — người học quay lại đúng chỗ đang dở.
   * Khác cấu hình thì phiên cũ bị bỏ và nói rõ, thay vì im lặng trộn hai phiên.
   *
   * Không có yêu cầu nào (mở màn này bằng Back/Forward, hoặc từ thẻ "Tiếp tục
   * phiên"): khôi phục phiên đã lưu. Không có gì để khôi phục thì hiện trạng thái
   * trống trung thực — TUYỆT ĐỐI không tự bắt đầu một phiên mới.
   *
   * # Hai chế độ không lẫn vào nhau
   *
   * - **Lật thẻ + tự chấm**: chạy SM-2 thật, cập nhật lịch ôn. Đây là nguồn duy
   *   nhất làm thay đổi trạng thái SRS.
   * - **Tự trả lời**: chỉ ghi dấu đúng/sai cho bộ lọc "Chưa thuộc", KHÔNG đổi lịch
   *   ôn. Làm bài kiểm tra không được phép âm thầm dời lịch ôn.
   *
   * Chấm câu trả lời do lõi Rust làm (`quizCheck`), không viết lại ở JavaScript.
   *
   * # Phiên sống sót qua việc tải lại trang
   *
   * Phiên đang dở được ghi xuống IndexedDB sau mỗi thay đổi quan trọng. Bản lưu chỉ
   * chứa id thẻ; việc đối chiếu với thư viện hiện tại do lõi Rust làm
   * (`sessionRestore`), nên cập nhật nội dung không phá vỡ buổi học.
   */
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';

  import type { CollectionScope } from '../app/collection.ts';
  import { catalogCards, sessionFilter, type SessionRequest } from '../app/session-plan.ts';
  import { randomDrawSize } from '../app/random-study.ts';
  import { app, type RestoredSession } from '../app/store.svelte.ts';
  import {
    cardsFilter,
    quizCheck,
    quizPrompt,
    sessionShuffle,
    srsPreview,
    type AnswerVerdict,
    type Card,
    type Rating,
  } from '../core/index.ts';
  import { randomSeed } from '../platform/crypto.ts';
  import { MULTI_DECK_SESSION_ID, type StudyFocus, type StudyMode } from '../storage/session.ts';
  import Icon from './Icon.svelte';
  import { noticeFly, reducedMotion, staggerDelay } from './motion.ts';

  const RATINGS: { rating: Rating; label: string; hint: string }[] = [
    { rating: 'again', label: '1 · Again', hint: 'quên' },
    { rating: 'hard', label: '2 · Hard', hint: 'khó' },
    { rating: 'good', label: '3 · Good', hint: 'được' },
    { rating: 'easy', label: '4 · Easy', hint: 'dễ' },
  ];

  const RATING_KEYS: Record<string, Rating> = {
    '1': 'again',
    '2': 'hard',
    '3': 'good',
    '4': 'easy',
  };

  const FOCUS_LABELS: Record<StudyFocus, string> = {
    due: 'Thẻ tới hạn',
    weak: 'Thẻ chưa thuộc',
    random: 'Học ngẫu nhiên',
  };

  const MODE_LABELS: Record<StudyMode, string> = {
    flip: 'Lật thẻ',
    type: 'Tự trả lời',
  };

  function isEditing(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
  }

  // ── Trạng thái phiên ────────────────────────────────────────────────────

  /** Cấu hình của phiên ĐANG chạy — để "Làm lại" và thẻ kết thúc dùng lại. */
  let request = $state.raw<SessionRequest | null>(null);
  let started = $state(false);
  let busy = $state(false);
  /** Đang thử khôi phục phiên cũ; chặn nhấp nháy màn hình "chưa bắt đầu". */
  let restoring = $state(true);

  // `queue` PHẢI dùng `$state.raw`: thẻ trong hàng đợi được ghi xuống IndexedDB,
  // mà Proxy do `$state` bọc sâu thì không truyền được qua structured clone
  // (`DataCloneError` đã gặp thật). Hàng đợi cũng chỉ được thay CẢ KHỐI.
  let queue = $state.raw<Card[]>([]);
  let index = $state(0);
  let revealed = $state(false);
  let rated = $state(0);
  let mistakes = $state(0);
  let notice = $state<string | null>(null);
  let restoredNotice = $state<string | null>(null);

  // Hai cờ ghi nhận thẻ HIỆN TẠI đã có kết quả gì; số đếm chỉ tăng khi RỜI thẻ.
  // Nhờ vậy việc tải lại trang giữa chừng không đếm hai lần một thẻ.
  let answered = $state(false);
  let quizWrong = $state(false);

  let question = $state('');
  let typed = $state('');
  let feedback = $state.raw<{
    correct: boolean;
    score: number;
    verdict: AnswerVerdict;
    reference: string[];
  } | null>(null);
  /** Khoảng ôn mà mỗi mức chấm sẽ tạo ra — hiện trên nút, không phải bấm rồi mới biết. */
  let previews = $state.raw<Record<Rating, string> | null>(null);
  /** Khung thẻ, để khởi động lại hiệu ứng khi đổi sang thẻ khác. */
  let stageEl = $state<HTMLElement | null>(null);

  const current = $derived(index < queue.length ? (queue[index] ?? null) : null);
  const remaining = $derived(started ? Math.max(0, queue.length - index) : 0);
  const mode = $derived(request?.mode ?? 'flip');
  const focus = $derived(request?.focus ?? 'due');

  /** Bộ để suy câu hỏi/đáp án khi chưa có thẻ hiện tại. */
  const fallbackDeckId = $derived(
    request !== null && request.scope.kind !== 'all' ? request.scope.deckId : 'vocabulary',
  );
  /**
   * Chế độ hỏi lấy theo BỘ CỦA THẺ ĐANG HỎI, không theo một bộ cố định: phiên
   * nhiều bộ (ngẫu nhiên, toàn thư viện) trộn thẻ từ các bộ khác nhau.
   */
  const quiz = $derived(
    current === null ? app.quizForDeck(fallbackDeckId) : app.quizForDeck(current.deckId),
  );
  const deckLabel = $derived(
    current === null ? app.deckName(fallbackDeckId) : app.deckName(current.deckId),
  );
  const progress = $derived(queue.length === 0 ? 0 : (index / queue.length) * 100);

  /** Nhãn phạm vi đang học — để người học luôn biết mình đang ở đâu. */
  const scopeLabel = $derived.by(() => {
    const config = request;
    if (config === null) return '';
    if (config.scope.kind === 'all') {
      return config.focus === 'random' ? 'Cả ba chủ đề' : 'Tất cả nội dung';
    }
    if (config.scope.kind === 'lesson') {
      return `${app.deckName(config.scope.deckId)} · Bài ${config.scope.lesson}`;
    }
    return app.deckName(config.scope.deckId);
  });

  /**
   * Mặt đáp án có đang được nhìn thấy không — dùng cho CẢ lật thẻ lẫn `aria-hidden`.
   * `backface-visibility: hidden` chỉ giấu về mặt hình ảnh; nếu không đánh dấu
   * `aria-hidden`, trình đọc màn hình sẽ đọc luôn đáp án trước khi người học trả lời.
   */
  const answerShown = $derived(mode === 'flip' ? revealed : feedback !== null);

  /** Mặt đáp án chính: hỏi nghĩa thì đáp án là chữ Nhật, và ngược lại. */
  const answerMain = $derived(
    current === null ? '' : quiz === 'reading' ? current.front : current.back,
  );

  // ── Khởi động ───────────────────────────────────────────────────────────

  onMount(() => {
    window.addEventListener('keydown', onKeydown);
    void init();
    return () => window.removeEventListener('keydown', onKeydown);
  });

  async function init(): Promise<void> {
    try {
      const requested = app.takeRequestedSession();
      if (requested !== null) {
        await runRequest(requested);
        return;
      }
      // Không có yêu cầu: Back/Forward hoặc thẻ "Tiếp tục phiên". Chỉ khôi phục —
      // không tự bắt đầu phiên mới.
      const saved = await app.restoreSession();
      if (saved !== null) await adopt(saved);
    } finally {
      restoring = false;
    }
  }

  /** Cấu hình được yêu cầu có trùng với phiên đã lưu không. */
  function matchesRequest(next: SessionRequest, saved: RestoredSession): boolean {
    if (next.mode !== saved.mode || next.focus !== saved.focus) return false;
    if (next.scope.kind === 'all') return saved.deckId === MULTI_DECK_SESSION_ID;
    if (saved.deckId !== next.scope.deckId) return false;
    return next.scope.kind === 'lesson'
      ? saved.lesson === next.scope.lesson
      : saved.lesson === undefined;
  }

  /** Phạm vi suy ra từ một phiên đã lưu (bản lưu cũ cũng đọc được). */
  function scopeOfSession(saved: RestoredSession): CollectionScope {
    if (saved.deckId === MULTI_DECK_SESSION_ID) return { kind: 'all' };
    return saved.lesson === undefined
      ? { kind: 'deck', deckId: saved.deckId }
      : { kind: 'lesson', deckId: saved.deckId, lesson: saved.lesson };
  }

  /** Một yêu cầu bắt đầu phiên: trùng thì tiếp tục, khác thì bỏ phiên cũ và dựng mới. */
  async function runRequest(next: SessionRequest): Promise<void> {
    busy = true;
    try {
      const saved = await app.restoreSession();
      if (saved !== null && matchesRequest(next, saved)) {
        await adopt(saved);
        return;
      }
      if (saved !== null) {
        notice = 'Đã bỏ phiên học đang dở để áp dụng lựa chọn học mới.';
      }
      await buildQueue(next);
    } finally {
      busy = false;
    }
  }

  /** Dùng một phiên đã lưu làm phiên đang học. */
  async function adopt(saved: RestoredSession): Promise<void> {
    request = { scope: scopeOfSession(saved), mode: saved.mode, focus: saved.focus };
    queue = saved.queue;
    index = saved.index;
    revealed = saved.revealed;
    rated = saved.rated;
    mistakes = saved.mistakes;
    started = true;
    restoredNotice =
      saved.dropped > 0
        ? `Đã khôi phục phiên học đang dở. ${saved.dropped} thẻ không còn trong thư viện nên đã được bỏ.`
        : 'Đã khôi phục phiên học đang dở.';
    await ask();
    if (revealed) await loadPreviews();
  }

  // ── Dựng hàng đợi ───────────────────────────────────────────────────────

  /**
   * Dựng hàng đợi thật của phiên bằng ĐÚNG bộ lọc Collection đã dùng để đếm
   * (`sessionFilter`), rồi ghi bản lưu mới. Phiên ngẫu nhiên bốc thăm từ danh mục
   * ba chủ đề bằng `sessionShuffle` của lõi.
   */
  async function buildQueue(config: SessionRequest): Promise<void> {
    // Phiên cũ không còn ý nghĩa khi bắt đầu phiên mới — bỏ trước khi dựng.
    await app.discardSession();

    const limit = app.settings.dailyNewLimit;
    const filter = sessionFilter(config, limit);
    let list: Card[];

    if (filter === null) {
      const pool = catalogCards(app.cards);
      const order = await sessionShuffle(
        pool.map((card) => card.id),
        randomSeed(),
      );
      const lookup = new Map(pool.map((card) => [card.id, card]));
      list = order
        .slice(0, randomDrawSize(pool.length, limit))
        .map((id) => lookup.get(id))
        .filter((card): card is Card => card !== undefined);
    } else {
      const found = await cardsFilter(app.cards, filter, Date.now());
      const byId = new Map(app.cards.map((card) => [card.id, card]));
      list = found.ids
        .map((id) => byId.get(id))
        .filter((card): card is Card => card !== undefined);

      if (app.settings.shuffleByDefault && list.length > 1) {
        const order = await sessionShuffle(
          list.map((card) => card.id),
          randomSeed(),
        );
        const lookup = new Map(list.map((card) => [card.id, card]));
        list = order
          .map((id) => lookup.get(id))
          .filter((card): card is Card => card !== undefined);
      }
    }

    request = config;
    queue = list;
    index = 0;
    revealed = false;
    rated = 0;
    mistakes = 0;
    typed = '';
    feedback = null;
    previews = null;
    restoredNotice = null;
    answered = false;
    quizWrong = false;
    started = true;
    notice = list.length === 0 ? emptyReason(config) : null;
    await ask();
    persist();
  }

  /** Vì sao hàng đợi rỗng — nút chết phải nói được vì sao nó chết. */
  function emptyReason(config: SessionRequest): string {
    if (config.focus === 'weak') return 'Không có thẻ chưa thuộc trong phạm vi này.';
    if (config.focus === 'random') return 'Danh mục học chưa có thẻ nào để bốc.';
    return 'Không còn thẻ tới hạn trong phạm vi này.';
  }

  /** Làm lại với đúng cấu hình đang dùng — dùng cho nút "Làm lại" và màn kết thúc. */
  async function restart(): Promise<void> {
    const config = request;
    if (config === null || busy) return;
    busy = true;
    try {
      await buildQueue(config);
    } finally {
      busy = false;
    }
  }

  // ── Ghi phiên ───────────────────────────────────────────────────────────

  /** Ghi phiên đang dở. Gọi sau MỌI thay đổi làm tiến độ khác đi. */
  function persist(): void {
    const config = request;
    if (!started || queue.length === 0 || config === null) return;
    void app
      .persistSession({
        deckId: config.scope.kind === 'all' ? MULTI_DECK_SESSION_ID : config.scope.deckId,
        lesson: config.scope.kind === 'lesson' ? config.scope.lesson : undefined,
        mode: config.mode,
        focus: config.focus,
        queue: queue.map((card) => card.id),
        index,
        revealed,
        rated,
        mistakes,
        savedAt: Date.now(),
      })
      .then((saved) => {
        if (!saved) notice = 'Không lưu được phiên học đang dở. Tiến độ đã chấm vẫn được giữ.';
      });
  }

  // ── Hiệu ứng đổi thẻ ────────────────────────────────────────────────────
  //
  // Nội dung thẻ đổi ngay khi chấm điểm, trong lúc thẻ còn đang lật về mặt trước.
  // Một cú trượt lên kèm mờ dần trên cả khung thẻ che khoảnh khắc đó. Class được
  // gỡ rồi gắn lại bằng tay vì CSS không tự chạy lại một `animation` khi class vẫn
  // còn đó. Bỏ qua lần dựng đầu: chưa có gì để "đổi".
  let shownCardId: string | null = null;

  $effect(() => {
    const id = current?.id ?? null;
    if (id === null) {
      shownCardId = null;
      return;
    }
    if (shownCardId === id) return;
    const changed = shownCardId !== null;
    shownCardId = id;
    const stage = stageEl;
    if (!changed || stage === null || reducedMotion()) return;
    stage.classList.remove('swap');
    void stage.offsetWidth;
    stage.classList.add('swap');
  });

  /**
   * Phím tắt. `1`–`4` khớp đúng thứ tự bốn nút chấm điểm; không can thiệp khi con
   * trỏ đang ở trong ô nhập — ở chế độ Tự trả lời, dấu cách là ký tự hợp lệ.
   */
  function onKeydown(event: KeyboardEvent): void {
    if (isEditing(event.target)) return;
    if (!started || busy || current === null) return;

    const flipKey = event.key === ' ' || event.key === 'Enter';

    if (mode === 'flip') {
      if (!revealed) {
        if (!flipKey) return;
        event.preventDefault();
        void reveal();
        return;
      }
      const rating = RATING_KEYS[event.key];
      if (rating === undefined) return;
      event.preventDefault();
      void rate(rating);
      return;
    }

    if (feedback !== null && flipKey) {
      event.preventDefault();
      advance();
    }
  }

  // ── Thân phiên ──────────────────────────────────────────────────────────

  async function ask(): Promise<void> {
    const card = current;
    question = card === null ? '' : await quizPrompt(card, quiz);
  }

  function advance(): void {
    // Thẻ vừa rời được tính vào bộ đếm ở đây, và CHỈ ở đây.
    if (answered) rated += 1;
    if (quizWrong) mistakes += 1;
    answered = false;
    quizWrong = false;

    index += 1;
    revealed = false;
    typed = '';
    feedback = null;
    previews = null;
    void ask();
    if (index >= queue.length) {
      // Phiên đã đi hết: không còn gì để khôi phục.
      void app.discardSession();
      void app.refreshStats();
    } else {
      persist();
    }
  }

  /**
   * Lật thẻ và chuẩn bị trước khoảng ôn của cả bốn mức. Con số này lấy từ chính
   * `srsSchedule` mà nút sẽ gọi khi bấm, nên nó không thể lệch với kết quả thật.
   */
  async function reveal(): Promise<void> {
    revealed = true;
    persist();
    await loadPreviews();
  }

  async function loadPreviews(): Promise<void> {
    const card = current;
    if (card === null) return;
    const live = app.liveCard(card.id) ?? card;
    const next = await srsPreview(live.srs);
    previews = {
      again: formatInterval(next.again),
      hard: formatInterval(next.hard),
      good: formatInterval(next.good),
      easy: formatInterval(next.easy),
    };
  }

  async function rate(rating: Rating): Promise<void> {
    const card = current;
    if (card === null || busy) return;
    busy = true;
    try {
      await app.rate(card, rating);
      // Tự chấm Again/Hard là tín hiệu YẾU, không phải "trả lời sai ở bài kiểm
      // tra" — hai khái niệm khác nhau (ADR-008). `quizWrong` giữ nguyên `false`.
      answered = true;
      advance();
    } finally {
      busy = false;
    }
  }

  async function submitAnswer(): Promise<void> {
    const card = current;
    if (card === null || busy || feedback !== null) return;
    busy = true;
    try {
      const check = await quizCheck(typed, card, quiz);
      feedback = {
        correct: check.correct,
        score: check.score,
        verdict: check.verdict,
        reference: check.reference,
      };
      // Chỉ ghi dấu học tập kèm ĐIỂM của lần trả lời, không đụng lịch SRS.
      await app.markQuiz(card, check.correct, check.score);
      answered = true;
      quizWrong = !check.correct;
      persist();
    } finally {
      busy = false;
    }
  }

  /**
   * Nhãn cho từng kết luận. Ngắn, cụ thể, và nói rõ chuyện gì đã xảy ra:
   * "Đúng" khác "Đúng (thiếu dấu)" khác "Gần đúng".
   */
  function verdictLabel(verdict: AnswerVerdict): string {
    switch (verdict) {
      case 'exact':
        return 'Đúng';
      case 'accepted':
        return 'Đúng — thiếu dấu';
      case 'near':
        return 'Gần đúng — xem chính tả';
      case 'empty':
        return 'Chưa trả lời';
      default:
        return 'Chưa đúng';
    }
  }

  function formatInterval(days: number): string {
    if (days <= 0) return 'học lại';
    if (days === 1) return '1 ngày';
    if (days < 30) return `${days} ngày`;
    const months = Math.round(days / 30);
    return months <= 1 ? '1 tháng' : `${months} tháng`;
  }

  /** Không có phiên nào để chạy: mở Collection với đúng phạm vi đã dùng lần cuối. */
  function openCollection(): void {
    app.goCollection(app.collectionScope, {
      focus: app.collectionFocus,
      mode: app.collectionMode,
    });
  }
</script>

<main class="screen">
  <header class="study-top">
    <div class="study-top-line">
      <div class="study-heading">
        <h1>{started ? `Thẻ ${Math.min(index + 1, queue.length)} / ${queue.length}` : 'Phiên học'}</h1>
        <p class="muted">
          {started
            ? `Còn ${remaining} · đã chấm ${rated} · sai ${mistakes}`
            : 'Chạy một phiên đã cấu hình bằng Collection.'}
        </p>
      </div>
      {#if started && current !== null}
        <div class="study-actions">
          <button class="btn btn-inline restart" disabled={busy} onclick={() => void restart()}>
            Làm lại
          </button>
          <button
            class="btn btn-primary btn-inline next-top"
            disabled={busy || (mode === 'type' && feedback === null)}
            onclick={advance}
          >
            Thẻ tiếp theo
          </button>
        </div>
      {/if}
    </div>
    {#if started && request !== null}
      <!-- Nhắc lại đúng cấu hình đang chạy: phạm vi, phạm vi thẻ và chế độ. Người
           học không phải nhớ mình đã chọn gì ở Collection. -->
      <p class="session-chips">
        <span class="chip">{scopeLabel}</span>
        <span class="chip chip-soft">{FOCUS_LABELS[request.focus]}</span>
        <span class="chip chip-soft">{MODE_LABELS[request.mode]}</span>
      </p>
    {/if}
    {#if started}
      <div
        class="study-progress"
        role="progressbar"
        aria-label="Tiến độ phiên học"
        aria-valuenow={Math.round(progress)}
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <i style="width: {progress}%"></i>
      </div>
    {/if}
  </header>

  {#if restoring}
    <!-- Chờ khôi phục phiên: im lặng, không hiện màn hình "chưa bắt đầu" rồi đổi
         ngay sau đó — như vậy trông như phiên bị mất. -->
    <section class="card skeleton" aria-busy="true" aria-label="Đang khôi phục phiên học">
      <i></i><i></i><i></i>
    </section>
  {:else if !started}
    <!-- Không có yêu cầu và không có phiên đã lưu: trạng thái trống trung thực.
         Màn này không tự chọn nội dung — nội dung được chọn ở Collection. -->
    <section class="card rise">
      <div class="done">
        <span class="done-mark" aria-hidden="true"><Icon name="study" size={22} width={2.2} /></span>
        <h2>Không có phiên học nào đang mở</h2>
      </div>
      <p class="muted">
        Phiên học bắt đầu từ Collection: chọn nội dung, xem trước số thẻ, rồi bấm Bắt đầu.
      </p>
      <div class="toolbar-row">
        <button class="btn btn-primary btn-inline" onclick={openCollection}>
          <Icon name="study" size={18} />
          Mở Collection
        </button>
        <button class="btn btn-inline" onclick={() => app.go('home')}>
          <Icon name="home" size={18} />
          Về Trang chủ
        </button>
      </div>
    </section>
  {:else if current === null}
    <section class="card rise">
      <div class="done">
        <span class="done-mark" aria-hidden="true"><Icon name="check" size={26} width={2.4} /></span>
        <h2>{notice === null ? 'Xong phiên học' : 'Phiên học trống'}</h2>
      </div>
      <!-- Đếm theo thẻ ĐÃ CHẤM, không theo thẻ đã đi qua: bỏ qua một thẻ không
           phải là một lần trả lời, và thanh tiến độ ở trên đã đếm số thẻ đã đi
           qua rồi. -->
      <p class="muted">
        {#if notice !== null}
          {notice}
        {:else}
          Đã chấm {rated} thẻ, {mistakes} lần trả lời chưa đúng.
        {/if}
      </p>
    </section>
    <div class="toolbar-row">
      <button class="btn btn-inline" disabled={busy} onclick={() => void restart()}>
        {#if focus === 'random'}
          <Icon name="shuffle" size={18} />
          Bốc phiên ngẫu nhiên mới
        {:else if focus === 'weak'}
          <Icon name="refresh" size={18} />
          Kiểm tra lại thẻ chưa thuộc
        {:else}
          <Icon name="refresh" size={18} />
          Kiểm tra lại thẻ tới hạn
        {/if}
      </button>
      <button class="btn btn-inline" onclick={openCollection}>
        <Icon name="layers" size={18} />
        Mở Collection
      </button>
    </div>
  {:else}
    {#if restoredNotice !== null}
      <p class="notice notice-ok" role="status" transition:fly={noticeFly(-8, 220)}>{restoredNotice}</p>
    {/if}

    <!-- Thân phiên học: trên màn hình đứng là một cột; trên điện thoại nằm ngang
         thành hai cột (thẻ bên trái, điều khiển bên phải). -->
    <div class="study-body">
      <div class="stage" bind:this={stageEl}>
        <!-- Lật 3D thật: hai mặt nằm chồng nhau trong khung giãn hết chiều cao còn
             lại; nội dung dài hơn khung thì mặt thẻ tự cuộn. -->
        <div class="flipper" class:flipped={answerShown}>
          <div class="face front" aria-hidden={answerShown}>
            <p class="face-label muted">
              {deckLabel} · {quiz === 'reading' ? 'hỏi chữ Nhật' : 'hỏi nghĩa'}
            </p>
            <p class="prompt">{question}</p>
          </div>
          <div class="face back" aria-hidden={!answerShown}>
            <p class="face-label muted">Đáp án</p>
            <p class="answer">{answerMain}</p>
            {#if current.furigana}<p class="muted reading">{current.furigana}</p>{/if}
            {#if current.romaji}<p class="muted reading">{current.romaji}</p>{/if}
          </div>
        </div>
      </div>

      <div class="study-controls">
        {#if mode === 'flip'}
          {#if revealed}
            <!-- Bốn mức vào so le (trần 6 bước): mắt đọc theo thứ tự 1→4. -->
            <div class="ratings">
              {#each RATINGS as option, i (option.rating)}
                <button
                  class="btn rate rate-{option.rating} rise"
                  style="--rise-delay: {staggerDelay(i, 45, 6)}"
                  disabled={busy}
                  onclick={() => void rate(option.rating)}
                >
                  <span class="rate-label">{option.label}</span>
                  <small>{previews?.[option.rating] ?? option.hint}</small>
                </button>
              {/each}
            </div>
          {:else}
            <div class="toolbar-row">
              <button class="btn btn-primary" onclick={() => void reveal()}>
                Hiện đáp án
              </button>
            </div>
            <p class="muted key-hint">Phím cách/Enter lật thẻ, 1–4 để chấm điểm.</p>
          {/if}
        {:else}
          <form
            class="answer-form"
            onsubmit={(event) => {
              event.preventDefault();
              void submitAnswer();
            }}
          >
            <label class="field answer-field">
              <span>Câu trả lời</span>
              <input
                bind:value={typed}
                disabled={feedback !== null}
                autocomplete="off"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                enterkeyhint="done"
                placeholder="gõ nghĩa, kana hoặc romaji"
              />
            </label>
            <button
              class="btn btn-primary btn-inline answer-submit"
              type="submit"
              disabled={busy || feedback !== null}
            >
              Kiểm tra
            </button>
          </form>

          {#if feedback !== null}
            <p
              class="notice"
              role="status"
              class:notice-ok={feedback.verdict === 'exact' || feedback.verdict === 'accepted'}
              class:notice-warn={feedback.verdict === 'near'}
              class:notice-danger={feedback.verdict === 'wrong' || feedback.verdict === 'empty'}
              transition:fly={noticeFly(-6, 200)}
            >
              <Icon
                name={feedback.verdict === 'exact'
                  ? 'check'
                  : feedback.verdict === 'accepted'
                    ? 'sparkle'
                    : feedback.verdict === 'near'
                      ? 'alert'
                      : 'close'}
                size={15}
                width={2.2}
              />
              <span>
                {verdictLabel(feedback.verdict)}
                {#if feedback.verdict !== 'exact' && feedback.reference.length > 0}
                  · đáp án: {feedback.reference.join(' / ')}
                {/if}
              </span>
            </p>
          {/if}
        {/if}
      </div>
    </div>
  {/if}

  {#if notice !== null && started && current !== null}
    <p class="notice" transition:fly={noticeFly(-6, 200)}>{notice}</p>
  {/if}
</main>

<style>
  .study-top {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 4px 0 2px;
  }

  .study-top-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 46px;
  }

  .study-heading {
    min-width: 0;
  }

  .study-heading h1 {
    font-size: 1.16rem;
  }

  .study-heading p {
    margin: 3px 0 0;
    font-size: 0.78rem;
  }

  .study-actions {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    gap: 6px;
  }

  .study-actions .btn {
    min-height: 40px;
    margin: 0;
    padding: 7px 10px;
    font-size: 0.78rem;
    white-space: nowrap;
  }

  .restart {
    border-color: transparent;
    background: transparent;
    color: var(--muted);
  }

  /* ── Cấu hình đang chạy ──────────────────────────────────────────── */

  .session-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: -2px 0 0;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    background: var(--accent-soft);
    color: var(--text);
    font-size: 0.72rem;
    font-weight: 700;
  }

  .chip-soft {
    border-color: var(--border);
    background: var(--surface-2);
    color: var(--muted);
    font-weight: 600;
  }

  .study-progress {
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--surface-3);
  }

  .study-progress i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 72%, white));
    transition: width var(--dur-3) var(--ease-out);
  }

  /* ── Khung lật 3D ────────────────────────────────────────────────── */

  /* Khung thẻ giãn hết phần chiều cao còn lại; sàn co theo chiều cao khung nhìn
     để màn hình thấp không đẩy phần điều khiển xuống dưới thanh điều hướng. */
  .stage {
    perspective: 1400px;
    flex: 1 1 auto;
    display: flex;
    min-height: clamp(140px, 25vh, 216px);
  }

  /* Đổi thẻ: cả khung trượt lên kèm mờ dần vào. Class `swap` do JS gỡ rồi gắn lại
     mỗi lần đổi thẻ — CSS không tự chạy lại một `animation` khi class còn nguyên. */
  @keyframes stage-swap {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }

  .stage.swap {
    animation: stage-swap var(--dur-3) var(--ease-out);
  }

  .study-body {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
  }

  .study-controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
  }

  .study-controls > :first-child {
    margin-top: 0;
  }

  .flipper {
    position: relative;
    flex: 1 1 auto;
    min-height: clamp(140px, 25vh, 216px);
    transform-style: preserve-3d;
    transition: transform var(--dur-4) var(--ease-in-out);
  }

  .flipper.flipped {
    transform: rotateY(180deg);
  }

  .face {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 22px 20px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: linear-gradient(180deg, var(--surface), color-mix(in srgb, var(--surface-2) 82%, var(--surface)));
    box-shadow: var(--shadow-2);
    backface-visibility: hidden;
    overflow: auto;
    text-align: center;
    transition: box-shadow var(--dur-3) var(--ease-out), border-color var(--dur-2) var(--ease-out);
  }

  @media (max-height: 620px) {
    .face {
      padding: 12px 16px;
      gap: 6px;
    }
  }

  .face p {
    margin: 0;
    max-width: 32ch;
  }

  .face-label {
    font-size: 0.78rem;
    letter-spacing: 0.01em;
  }

  .face.back {
    transform: rotateY(180deg);
    border-color: var(--accent-line);
    box-shadow:
      var(--shadow-2),
      inset 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent);
  }

  /* Nội dung mặt đáp án hiện dần SAU khi bề mặt đã lật tới: nhãn, rồi đáp án, rồi
     chữ đọc. `backwards` giữ nội dung ẩn trong lúc chờ. */
  @keyframes face-reveal {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }

  .flipper.flipped .face.back > * {
    animation: face-reveal var(--dur-2) var(--ease-out) backwards;
  }

  .flipper.flipped .face.back > :nth-child(1) {
    animation-delay: 140ms;
  }

  .flipper.flipped .face.back > :nth-child(2) {
    animation-delay: 200ms;
  }

  .flipper.flipped .face.back > :nth-child(3) {
    animation-delay: 260ms;
  }

  .flipper.flipped .face.back > :nth-child(4) {
    animation-delay: 320ms;
  }

  .prompt {
    font-size: clamp(1.4rem, 6vw, 1.8rem);
    font-weight: 700;
    line-height: 1.3;
    letter-spacing: -0.02em;
    text-wrap: balance;
  }

  .answer {
    font-size: clamp(1.3rem, 5.6vw, 1.6rem);
    font-weight: 700;
    color: var(--ok);
    letter-spacing: -0.01em;
    text-wrap: balance;
    line-height: 1.25;
  }

  .reading {
    font-size: 0.95rem;
    line-height: 1.4;
  }

  /* ── Bốn mức tự chấm ─────────────────────────────────────────────── */

  .ratings {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  /* Màn hình thấp NHƯNG rộng (điện thoại nằm ngang): hai cột. Thẻ bên trái, điều
     khiển bên phải, nên thẻ VÀ bốn nút cùng nằm trong tầm mắt. */
  @media (min-width: 560px) and (max-height: 560px) {
    .screen {
      padding-top: 10px;
      padding-bottom: calc(var(--nav-height) + 12px);
      gap: 12px;
    }

    .study-top {
      padding: 0;
      gap: 6px;
    }

    .study-top-line {
      min-height: 40px;
    }

    .screen > .notice {
      padding: 6px 10px;
      font-size: 0.8rem;
    }

    .study-body {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
      gap: 14px;
      align-items: stretch;
    }

    .study-controls {
      margin-top: 0;
      justify-content: center;
      min-height: 0;
    }

    .stage {
      min-height: 150px;
    }

    .answer-form {
      grid-template-columns: 1fr;
    }
  }

  /* Mỗi mức mang một sắc thái riêng để phân biệt bằng mắt trước khi đọc chữ. */
  .rate {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    border-color: color-mix(in srgb, var(--rate-color) 40%, var(--border));
    color: var(--rate-color);
    background: color-mix(in srgb, var(--rate-color) 8%, var(--surface));
  }

  .rate-label {
    font-weight: 700;
  }

  .rate small {
    color: var(--muted);
    font-weight: 500;
    font-size: 0.75rem;
  }

  .rate-again {
    --rate-color: var(--rate-again);
  }
  .rate-hard {
    --rate-color: var(--rate-hard);
  }
  .rate-good {
    --rate-color: var(--rate-good);
  }
  .rate-easy {
    --rate-color: var(--rate-easy);
  }

  /* ── Trạng thái chờ và hoàn thành ────────────────────────────────── */

  .notice {
    display: flex;
    align-items: center;
    gap: 8px;
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

  .done {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .toolbar-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }

  .done-mark {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    color: var(--accent-ink);
    background: var(--accent);
    box-shadow: 0 8px 20px color-mix(in srgb, var(--accent) 35%, transparent);
    animation: mark-pop 480ms var(--ease-spring) backwards;
  }

  @keyframes mark-pop {
    from {
      transform: scale(0.5);
      opacity: 0;
    }
  }

  /* Cụm trả lời: một cột trên màn hình hẹp, hai cột khi đủ chỗ. */
  .answer-form {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    margin-top: 14px;
  }

  .answer-field input {
    min-height: 46px;
    font-size: 1rem;
  }

  .answer-submit {
    min-height: 46px;
    white-space: nowrap;
  }

  @media (min-width: 430px) {
    .answer-form {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: end;
    }

    .answer-submit {
      padding-inline: 24px;
    }
  }

  /* Gợi ý bàn phím chỉ có nghĩa khi thật sự có bàn phím. */
  @media (hover: none) {
    .key-hint {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton i {
      animation: none;
    }
  }
</style>
