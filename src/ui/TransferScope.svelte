<script lang="ts">
  /**
   * Bộ chọn chủ đề + phạm vi của màn Nhập/xuất.
   *
   * # Vì sao là component dùng chung
   *
   * Nhập và Xuất phải hiểu phạm vi GIỐNG NHAU — người dùng chọn "Bài 12" một lần
   * và cả hai việc đều đọc đó là Bài 12. Trước đây mỗi tác vụ có thể có một bản
   * chọn riêng, nghĩa là hai nguồn sự thật cho cùng một câu hỏi. Nay chỉ có MỘT
   * bộ chọn, và trạng thái của nó nằm ở màn hình cha để đổi tác vụ không làm mất
   * phạm vi đang chọn.
   *
   * `mode` chỉ đổi CÂU CHỮ (nhập vào đâu / xuất từ đâu), không đổi hành vi: cùng
   * điều khiển, cùng giá trị, cùng luật gán bài.
   *
   * # Cử chỉ vuốt
   *
   * Thẻ này nhận cử chỉ vuốt ngang trên thiết bị cảm ứng: vuốt trái đi tới chủ đề
   * sau, vuốt phải lùi về trước — đúng chiều trượt mà `selectSection` chọn cho lần
   * chuyển đó, nên hiệu ứng không bao giờ ngược chiều với thao tác. Đặt trên cả
   * thẻ chứ không chỉ thanh chọn: thanh chọn chỉ cao 48px, vuốt trên đó khó trúng.
   */
  import { fly } from 'svelte/transition';

  import { KANJI_CATEGORIES } from '../app/content-sections.ts';
  import {
    SECTION_ORDER,
    type KanjiScope,
    type TransferSection,
  } from '../app/transfer.ts';
  import type { LessonInfo } from '../core/index.ts';
  import LiquidTabs from './LiquidTabs.svelte';
  import { motionDuration } from './motion.ts';

  interface Props {
    /** Nhập hay xuất — chỉ đổi câu chữ, không đổi hành vi. */
    mode: 'import' | 'export';
    section: TransferSection;
    lesson: string;
    kanjiDeckId: string;
    kanjiScope: KanjiScope;
    lessons: LessonInfo[];
    onSectionChange: (section: TransferSection) => void;
    onLessonChange: (lesson: string) => void;
    onKanjiDeckChange: (deckId: string) => void;
    onKanjiScopeChange: (scope: KanjiScope) => void;
  }

  let {
    mode,
    section,
    lesson,
    kanjiDeckId,
    kanjiScope,
    lessons,
    onSectionChange,
    onLessonChange,
    onKanjiDeckChange,
    onKanjiScopeChange,
  }: Props = $props();

  let direction = $state(1);

  /**
   * Hiệu ứng vào của khối nội dung theo chủ đề: trượt từ phía mục vừa rời đi.
   *
   * Thời lượng đi qua `motionDuration` (`motion.ts`): hiệu ứng của Svelte chạy bằng
   * JS nên khối `@media (prefers-reduced-motion)` trong `app.css` không phủ được nó
   * — về 0 nghĩa là khối hiện ra ngay, không còn chuyển động nào để giảm.
   */
  const slide = $derived({
    x: direction * 14,
    duration: motionDuration(200),
    opacity: 0,
  });

  const packageSwitchLabel = $derived(
    mode === 'import' ? 'Nhập nhiều nhóm Kanji cùng lúc' : 'Xuất nhiều nhóm Kanji cùng lúc',
  );

  function selectSection(next: TransferSection): void {
    // Chiều trượt lấy từ vị trí trên thanh chọn, không từ thứ tự bấm: nhảy từ
    // "Từ vựng" sang "Mẫu câu" phải trượt cùng chiều như đi qua "Kanji".
    const from = SECTION_ORDER.indexOf(section);
    const to = SECTION_ORDER.indexOf(next);
    if (to !== from) direction = to > from ? 1 : -1;
    if (to !== from) onSectionChange(next);
  }

  /** Đi một mục theo chiều vuốt, dừng lại ở hai đầu thay vì quay vòng. */
  function stepSection(step: 1 | -1): void {
    const next = SECTION_ORDER[SECTION_ORDER.indexOf(section) + step];
    if (next !== undefined) selectSection(next);
  }

  const SWIPE_MIN_PX = 44;
  let swipeFromX = 0;
  let swipeFromY = 0;
  let swipeTracking = false;

  function onSwipeStart(event: TouchEvent): void {
    // Nhiều ngón là cử chỉ khác (chụm/thu phóng), và ô chọn cùng khối mã cuộn
    // ngang của riêng chúng — hai chỗ đó không được cướp thao tác.
    const target = event.target;
    const busyTarget =
      target instanceof Element && target.closest('select, input, textarea, pre, .liquid-tabs') !== null;
    if (event.touches.length !== 1 || busyTarget) {
      swipeTracking = false;
      return;
    }
    const touch = event.touches[0]!;
    swipeFromX = touch.clientX;
    swipeFromY = touch.clientY;
    swipeTracking = true;
  }

  function onSwipeEnd(event: TouchEvent): void {
    if (!swipeTracking) return;
    swipeTracking = false;
    const touch = event.changedTouches[0];
    if (touch === undefined) return;
    const dx = touch.clientX - swipeFromX;
    const dy = touch.clientY - swipeFromY;
    // Ưu tiên cuộn dọc: chỉ coi là vuốt ngang khi dịch ngang đủ xa VÀ trội hơn
    // dịch dọc, nếu không một ngón tay hơi xiên lúc cuộn sẽ đổi chủ đề ngoài ý.
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    stepSection(dx < 0 ? 1 : -1);
  }

  function onSwipeCancel(): void {
    swipeTracking = false;
  }
</script>

<!-- `role="group"` vì phần tử này nhận cử chỉ vuốt: svelte-check cảnh báo khi một
     phần tử không tương tác có trình xử lý chạm mà không khai báo vai trò. -->
<div
  class="swipe-surface"
  role="group"
  aria-label="Chủ đề và phạm vi dữ liệu"
  ontouchstart={onSwipeStart}
  ontouchend={onSwipeEnd}
  ontouchcancel={onSwipeCancel}
>
  <LiquidTabs
    items={[
      { id: 'vocabulary', label: 'Từ vựng' },
      { id: 'kanji', label: 'Kanji' },
      { id: 'patterns', label: 'Mẫu câu' },
    ]}
    activeId={section}
    ariaLabel="Chủ đề dữ liệu"
    className="section-picker"
    onSelect={(id) => selectSection(id as TransferSection)}
  />

  <!-- Đổi chủ đề dựng lại CẢ KHỐI (`{#key}`), nên hiệu ứng chạy lại mỗi lần đổi và
       chạy đúng chiều. Chỉ dùng `in:` mà không dùng `out:`: khối cũ biến mất ngay,
       nên hai khối không bao giờ cùng nằm trong luồng bố cục và bố cục không nhảy. -->
  {#key section}
    <div class="scope" in:fly={slide}>
      {#if section === 'vocabulary'}
        <label class="field">
          <span>Bài Minna</span>
          <select value={lesson} onchange={(event) => onLessonChange(event.currentTarget.value)}>
            <option value="all">Toàn bộ từ vựng</option>
            {#each lessons as item (item.n)}
              <option value={String(item.n)}>{item.label}</option>
            {/each}
          </select>
        </label>
        <p class="muted scope-note">
          {#if lesson === 'all'}
            {#if mode === 'import'}
              Giữ số bài trên từng thẻ — file phải có trường <code>lesson</code> (1–50).
            {:else}
              Giữ số bài trên từng thẻ. Dùng JSON để không mất cấu trúc bài.
            {/if}
          {:else if mode === 'import'}
            Gán mọi thẻ trong file vào bài {lesson}.
          {:else}
            Chỉ lấy thẻ của bài {lesson}.
          {/if}
        </p>
      {:else if section === 'kanji'}
        <label class="field">
          <span>{mode === 'import' ? 'Nhóm nhận thẻ' : 'Nhóm Kanji'}</span>
          <select
            value={kanjiDeckId}
            disabled={kanjiScope === 'package'}
            onchange={(event) => onKanjiDeckChange(event.currentTarget.value)}
          >
            {#each KANJI_CATEGORIES as category (category.deckId)}
              <option value={category.deckId}>{category.label}</option>
            {/each}
          </select>
        </label>
        <label class="switch package-switch">
          <input
            type="checkbox"
            checked={kanjiScope === 'package'}
            onchange={(event) => onKanjiScopeChange(event.currentTarget.checked ? 'package' : 'single')}
          />
          <span class="track" aria-hidden="true"></span>
          <span class="switch-label">{packageSwitchLabel}</span>
        </label>
        <p class="muted scope-note">
          {#if kanjiScope === 'package'}
            {#if mode === 'import'}
              File JSON cần mảng <code>bundles</code>, mỗi nhóm có <code>deckId</code> và <code>cards</code>.
            {:else}
              Gói JSON có <code>deckId</code> cho từng nhóm, giữ nguyên bảy nhóm.
            {/if}
          {:else}
            {#if mode === 'import'}
              Nhận thẻ vào đúng nhóm đang chọn. File gói nhiều nhóm vẫn đọc được — chỉ lấy nhóm này.
            {:else}
              Lấy toàn bộ thẻ của nhóm đang chọn.
            {/if}
          {/if}
        </p>
      {:else}
        <label class="field">
          <span>{mode === 'import' ? 'Collection nhận mẫu câu' : 'Collection mẫu câu'}</span>
          <select value={lesson} onchange={(event) => onLessonChange(event.currentTarget.value)}>
            <option value="all">Tất cả mẫu câu</option>
            {#each Array.from({ length: 50 }, (_, index) => index + 1) as lessonNumber (lessonNumber)}
              <option value={String(lessonNumber)}>Mẫu câu bài {lessonNumber}</option>
            {/each}
          </select>
        </label>
        <p class="muted scope-note">
          {#if mode === 'import'}
            {#if lesson === 'all'}
              Giữ bài 1–50 trên từng mẫu câu trong file; bản ghi thiếu trường <code>lesson</code> sẽ bị từ chối.
            {:else}
              Gán mọi mẫu câu trong file vào Mẫu câu bài {lesson}.
            {/if}
          {:else if lesson === 'all'}
            Xuất toàn bộ mẫu câu của cả 50 bài.
          {:else}
            Chỉ lấy mẫu câu thuộc bài {lesson}.
          {/if}
        </p>
      {/if}
    </div>
  {/key}
</div>

<style>
  /* `pan-y` để trình duyệt vẫn cuộn dọc bình thường nhưng nhường cử chỉ ngang cho
     ứng dụng — nếu không, Chrome Android có thể hiểu vuốt ngang là điều hướng lịch
     sử và rời trang giữa lúc đổi chủ đề. */
  .swipe-surface {
    touch-action: pan-y;
  }

  .scope {
    margin-top: 12px;
  }

  .scope-note {
    margin: 8px 0 0;
    font-size: 0.8rem;
  }

  @media (max-width: 420px) {
    .scope-note {
      font-size: 0.76rem;
    }
  }

  .package-switch {
    margin-top: 12px;
  }
</style>
