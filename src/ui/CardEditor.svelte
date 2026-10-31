<script lang="ts">
  /**
   * Trình biên tập thẻ.
   *
   * # Hai việc khác nhau, hai chế độ riêng
   *
   * Trước đây màn này gộp cả sửa và tạo vào một ô chọn duyệt toàn bộ thư viện. Ô
   * chọn chỉ chứa được mặt trước, không tìm kiếm được, và phải cuộn qua hàng nghìn
   * mục mới tới đúng thẻ cần sửa. Giờ là hai tab, hai nháp độc lập:
   *
   * - **Sửa thẻ đã có**: tìm theo bộ + từ khoá rồi chọn một kết quả. Đổi tab rồi
   *   quay lại không mất chữ đang gõ.
   * - **Tạo thẻ mới**: một nháp trắng riêng; tạo xong các ô được xoá nhưng GIỮ bộ
   *   thẻ, vì tạo liên tiếp trong cùng một bộ là việc thường gặp.
   *
   * Mở màn không tự chọn thẻ nào — tự chọn hộ sẽ khiến người dùng tưởng mình đang
   * sửa đúng thẻ định sửa.
   *
   * # Tìm kiếm chạy trên JS, không gọi `cardsFilter` mỗi phím gõ
   *
   * Lý do hiệu năng nằm ở `src/app/card-search.ts`; quy tắc khớp được giữ khớp với
   * lõi Rust bằng test đối chiếu với ca của `search_matches_all_text_fields_and_tags`.
   *
   * # Ô "Bài Minna" phải nằm trong 1–50
   *
   * Lõi coi bài ngoài khoảng đó là không có bài (thẻ biến mất khỏi mọi bộ lọc
   * bài), và bản sao lưu từ chối cả tệp chứa thẻ như vậy — để lọt xuống lõi thì
   * người dùng chỉ phát hiện lúc khôi phục. Xem `isValidCard` trong `storage/backup.ts`.
   */
  import { fade } from 'svelte/transition';

  import { cardMatchesQuery } from '../app/card-search.ts';
  import { app } from '../app/store.svelte.ts';
  import type { Card, CardDraft } from '../core/index.ts';
  import Icon from './Icon.svelte';
  import LiquidTabs from './LiquidTabs.svelte';
  import { motionDuration, staggerDelay } from './motion.ts';
  import PageHeader from './PageHeader.svelte';

  type Mode = 'edit' | 'create';

  type DraftState = {
    deckId: string;
    front: string;
    back: string;
    furigana: string;
    romaji: string;
    tags: string;
    lesson: string;
  };

  /**
   * Số kết quả tối đa được dựng thành nút.
   *
   * Truy vấn rỗng khớp cả thư viện (hàng nghìn thẻ ở bản nội dung đầy đủ); dựng
   * hết thành phần tử chỉ làm màn hình nặng lên mà không ai cuộn tới. Người dùng
   * cần đủ kết quả để chọn hoặc thu hẹp tìm kiếm — và màn hình nói rõ khi bị ẩn.
   */
  const RESULT_LIMIT = 200;

  let mode = $state<Mode>('edit');
  let query = $state('');
  let deckFilter = $state('all');
  /** Thẻ đang sửa. `null` khi chưa chọn gì. */
  let selectedId = $state<string | null>(null);
  let busy = $state(false);
  let notice = $state<string | null>(null);
  let failed = $state(false);

  let editDraft = $state<DraftState>(emptyDraft());
  let createDraft = $state<DraftState>(emptyDraft());

  function emptyDraft(deckId = app.content?.bundles[0]?.deckId ?? 'vocabulary'): DraftState {
    return { deckId, front: '', back: '', furigana: '', romaji: '', tags: '', lesson: '' };
  }

  function draftFromCard(card: Card): DraftState {
    return {
      deckId: card.deckId,
      front: card.front,
      back: card.back,
      furigana: card.furigana,
      romaji: card.romaji,
      tags: card.tags.join(', '),
      lesson: card.lesson?.toString() ?? '',
    };
  }

  const selectedCard = $derived(app.cards.find((card) => card.id === selectedId) ?? null);

  /**
   * Kết quả tìm kiếm: lọc theo bộ và theo văn bản, sắp theo mặt trước.
   *
   * `filter` trả về mảng mới nên `sort` bên dưới không đụng tới `app.cards`.
   */
  const matches = $derived(
    app.cards
      .filter(
        (card) =>
          (deckFilter === 'all' || card.deckId === deckFilter) && cardMatchesQuery(card, query),
      )
      .sort((left, right) => left.front.localeCompare(right.front, 'vi')),
  );
  const visibleResults = $derived(matches.slice(0, RESULT_LIMIT));

  /**
   * Nháp sửa bám theo thẻ đang chọn.
   *
   * KHÔNG đọc `mode` ở đây: đổi tab rồi quay lại là để tiếp tục gõ, không phải để
   * nháp bị dựng lại. `selectedCard` là một mục trong `app.cards`, nên ngay sau khi
   * lưu, tham chiếu đổi và nháp được dựng lại từ giá trị ĐÃ CHUẨN HOÁ — đúng thứ
   * vừa được ghi.
   */
  $effect(() => {
    if (selectedCard !== null) editDraft = draftFromCard(selectedCard);
  });

  /** Chuyển tab. Hai nháp độc lập nên không xoá chữ nào. */
  function switchMode(next: Mode): void {
    mode = next;
    notice = null;
    failed = false;
  }

  /** Chọn một kết quả để sửa. */
  function chooseCard(nextId: string): void {
    selectedId = nextId;
    notice = null;
    failed = false;
  }

  /**
   * Về danh sách kết quả từ màn sửa thẻ.
   *
   * Danh sách bị ẨN khi đang sửa, không phải chỉ nằm dưới nháp: hàng trăm kết quả
   * chen giữa người dùng và thẻ đang sửa thì mỗi lần chọn thẻ phải cuộn qua hết
   * danh sách, và mọi phần tử trong một khung cuộn bên trong đều không chạm tới
   * được bằng cách cuộn TRANG. Truy vấn và bộ lọc còn nguyên, nên quay về là đúng
   * danh sách cũ.
   */
  function backToResults(): void {
    selectedId = null;
    notice = null;
    failed = false;
  }

  /**
   * Bài Minna chỉ có nghĩa với Từ vựng và Mẫu câu. Nhóm Kanji không nhận bài —
   * hiện ô này cho Kanji chỉ mời người dùng nhập dữ liệu sẽ bị lõi bỏ qua (và
   * từng làm thẻ Kanji lẫn vào thống kê bài trước khi các màn lọc theo bộ).
   */
  function usesLesson(deckId: string): boolean {
    return !deckId.startsWith('kanji-');
  }

  /** Nháp → `CardDraft` gửi xuống lõi. Chuỗi rỗng nghĩa là để trống trường đó. */
  function toDraft(draft: DraftState): CardDraft {
    const lessonValue = draft.lesson.trim();
    return {
      front: draft.front.trim(),
      back: draft.back.trim(),
      furigana: draft.furigana.trim(),
      romaji: draft.romaji.trim(),
      tags: draft.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      // Khoá `lesson` có mặt (kể cả undefined) là yêu cầu xoá bài. Với Kanji,
      // luôn gửi undefined để thẻ cũ có bài lạ được dọn khi lưu.
      lesson: usesLesson(draft.deckId) && lessonValue !== '' ? Number(lessonValue) : undefined,
    };
  }

  /** Lỗi của nháp, `null` nghĩa là hợp lệ. Chặn trước khi gọi vào lõi. */
  function draftError(draft: DraftState): string | null {
    if (draft.front.trim() === '' || draft.back.trim() === '') {
      return 'Cần điền ít nhất mặt trước và mặt sau.';
    }
    if (!usesLesson(draft.deckId)) return null;
    const lessonValue = draft.lesson.trim();
    const lesson = Number(lessonValue);
    if (draft.deckId === 'patterns' && lessonValue === '') {
      return 'Mẫu câu cần thuộc một bài từ 1 đến 50.';
    }
    if (lessonValue !== '' && (!/^\d+$/.test(lessonValue) || lesson < 1 || lesson > 50)) {
      return 'Bài Minna phải là số từ 1 đến 50.';
    }
    return null;
  }

  async function saveEdit(): Promise<void> {
    const card = selectedCard;
    if (card === null) return;
    const error = draftError(editDraft);
    if (error !== null) {
      notice = error;
      failed = true;
      return;
    }

    busy = true;
    notice = null;
    failed = false;
    try {
      const updated = await app.applyCardDraft(card, toDraft(editDraft));
      selectedId = updated.id;
      notice = `Đã lưu thẻ “${updated.front}”.`;
    } catch (cause) {
      failed = true;
      notice = cause instanceof Error ? cause.message : 'Không lưu được thẻ.';
    } finally {
      busy = false;
    }
  }

  async function createNew(): Promise<void> {
    const error = draftError(createDraft);
    if (error !== null) {
      notice = error;
      failed = true;
      return;
    }

    busy = true;
    notice = null;
    failed = false;
    try {
      const created = await app.createCard(createDraft.deckId, toDraft(createDraft));
      // Thẻ mới được chọn sẵn: chuyển sang tab "Sửa thẻ đã có" là đang đúng thẻ
      // vừa tạo, không phải tự tìm lại.
      selectedId = created.id;
      createDraft = emptyDraft(createDraft.deckId);
      notice = `Đã tạo thẻ “${created.front}” trong ${app.deckName(created.deckId)}.`;
    } catch (cause) {
      failed = true;
      notice = cause instanceof Error ? cause.message : 'Không tạo được thẻ.';
    } finally {
      busy = false;
    }
  }
</script>

<main class="screen">
  <PageHeader
    title="Trình biên tập thẻ"
    subtitle="Tìm thẻ đang có để sửa, hoặc tạo thẻ mới. Lịch ôn không bị đụng tới."
    onBack={() => app.back()}
  />

  <!-- `role="tablist"` để trình đọc màn hình biết đây là vùng chuyển nội dung,
       không phải hai nút hành động rời. -->
  <LiquidTabs
    items={[
      { id: 'edit', label: 'Sửa thẻ đã có' },
      { id: 'create', label: 'Tạo thẻ mới' },
    ]}
    activeId={mode}
    ariaLabel="Chế độ biên tập"
    className="mode-switch"
    onSelect={(id) => switchMode(id as Mode)}
  />

  {#snippet cardFields(draft: DraftState)}
    <label class="field">
      <span>Mặt trước · nghĩa tiếng Việt</span>
      <input bind:value={draft.front} placeholder="Ví dụ: Cảm ơn" />
    </label>
    <label class="field">
      <span>Mặt sau · chữ Nhật</span>
      <input bind:value={draft.back} placeholder="Ví dụ: ありがとう" />
    </label>
    <label class="field">
      <span>Furigana</span>
      <input bind:value={draft.furigana} placeholder="ありがとう" />
    </label>
    <label class="field">
      <span>Romaji</span>
      <input bind:value={draft.romaji} placeholder="arigatou" />
    </label>
    <label class="field">
      <span>Tags</span>
      <input bind:value={draft.tags} placeholder="mẫu câu, lễ hội — phân cách bằng dấu phẩy" />
    </label>
    {#if usesLesson(draft.deckId)}
      <label class="field">
        <span>Bài Minna (1–50)</span>
        <input
          bind:value={draft.lesson}
          placeholder="Bỏ trống nếu không thuộc bài nào"
          inputmode="numeric"
        />
      </label>
    {/if}
  {/snippet}

  {#if mode === 'edit'}
    <section class="card rise" in:fade={{ duration: motionDuration(160) }}>
      {#if selectedCard === null}
        <div class="section-head">
          <h2>Sửa thẻ đã có</h2>
          <span class="section-tag tnum">{matches.length} kết quả</span>
        </div>

        <div class="filters">
          <label class="field">
            <span>Tìm kiếm</span>
            <input
              type="search"
              bind:value={query}
              placeholder="nghĩa, chữ Nhật, romaji, tag…"
              autocomplete="off"
              spellcheck="false"
            />
          </label>
          <label class="field">
            <span>Bộ thẻ</span>
            <select bind:value={deckFilter}>
              <option value="all">Tất cả bộ</option>
              {#each app.content?.bundles ?? [] as bundle (bundle.deckId)}
                <option value={bundle.deckId}>{bundle.name}</option>
              {/each}
            </select>
          </label>
        </div>

        {#if matches.length === 0}
          <p class="muted results-empty">Không thẻ nào khớp. Thử từ khoá khác hoặc đổi bộ thẻ.</p>
        {:else}
          <ul class="results">
            <!-- Kết quả vào so le (trần 8 bước, bước ngắn 24ms): danh sách tối đa
                 200 hàng, nên độ trễ phải có trần — không thì hàng cuối chờ hàng
                 giây và người dùng cuộn tới chỉ thấy khung đứng im. -->
            {#each visibleResults as card, i (card.id)}
              <li class="rise" style="--rise-delay: {staggerDelay(i, 24, 8)}">
                <button class="result" onclick={() => chooseCard(card.id)}>
                  <strong>{card.front}</strong>
                  <span class="muted">{card.back} · {app.deckName(card.deckId)}</span>
                </button>
              </li>
            {/each}
          </ul>
          {#if matches.length > RESULT_LIMIT}
            <p class="muted results-more">
              Hiện {RESULT_LIMIT} trong <span class="tnum">{matches.length}</span> kết quả — thu
              hẹp tìm kiếm để thấy phần còn lại.
            </p>
          {/if}
        {/if}
      {:else}
        {@const card = selectedCard}
        <div class="section-head">
          <h2>Sửa thẻ đã có</h2>
          <span class="section-tag">{app.deckName(card.deckId)}</span>
        </div>

        <button class="btn btn-inline back-to-results" onclick={backToResults}>
          <Icon name="search" size={16} />
          Chọn thẻ khác
        </button>

        <div class="stack" style="margin-top: 12px">
          <p class="muted form-title">Đang sửa: <b>{card.front}</b></p>
          {@render cardFields(editDraft)}
        </div>

        <div class="toolbar-row">
          <button class="btn btn-primary btn-inline" disabled={busy} onclick={() => void saveEdit()}>
            <Icon name="check" size={17} />
            {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
          </button>
        </div>

        {#if notice !== null}
          <p
            class="notice"
            class:notice-danger={failed}
            class:notice-ok={!failed}
            style="margin-top: 12px"
          >
            {notice}
          </p>
        {/if}
      {/if}
    </section>
  {:else}
    <section class="card rise" in:fade={{ duration: motionDuration(160) }}>
      <div class="section-head">
        <h2>Tạo thẻ mới</h2>
        <span class="section-tag">Nháp trắng</span>
      </div>

      <label class="field" style="margin-top: 12px">
        <span>Bộ thẻ</span>
        <select bind:value={createDraft.deckId}>
          {#each app.content?.bundles ?? [] as bundle (bundle.deckId)}
            <option value={bundle.deckId}>{bundle.name}</option>
          {/each}
        </select>
      </label>

      <div class="stack" style="margin-top: 14px">
        {@render cardFields(createDraft)}
      </div>

      <div class="toolbar-row">
        <button class="btn btn-primary btn-inline" disabled={busy} onclick={() => void createNew()}>
          <Icon name="check" size={17} />
          {busy ? 'Đang lưu…' : 'Tạo thẻ'}
        </button>
      </div>

      {#if notice !== null}
        <p
          class="notice"
          class:notice-danger={failed}
          class:notice-ok={!failed}
          style="margin-top: 12px"
        >
          {notice}
        </p>
      {/if}
    </section>
  {/if}
</main>

<style>
  .filters {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }

  @media (min-width: 560px) {
    .filters {
      grid-template-columns: minmax(0, 1fr) minmax(0, 230px);
      align-items: end;
    }
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 6px;
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
  }

  .result {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    min-height: 48px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
    color: var(--text);
    text-align: left;
    transition:
      border-color var(--dur-2) var(--ease-out),
      background-color var(--dur-2) var(--ease-out);
  }

  .result strong {
    font-size: 0.86rem;
  }

  .result span {
    font-size: 0.76rem;
    overflow-wrap: anywhere;
  }

  @media (hover: hover) {
    .result:hover {
      border-color: var(--accent-line);
      background: var(--surface-3);
    }
  }

  .results-empty,
  .results-more {
    margin: 12px 0 0;
  }

  .form-title {
    margin: 0;
  }
</style>
