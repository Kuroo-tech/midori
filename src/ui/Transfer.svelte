<script lang="ts">
  /**
   * Màn Nhập/xuất — tổ chức theo BA TÁC VỤ: Nhập, Xuất, Sao lưu.
   *
   * # Vì sao chia tác vụ
   *
   * Trước đây bốn khối (chọn phạm vi, nhập thẻ, xuất thẻ, backup) nằm chồng lên nhau
   * trong một cột dài: muốn nhập một file, người dùng phải cuộn qua cả biểu mẫu xuất
   * lẫn hai nút backup, và trên điện thoại màn hình cao hơn 1.300px. Ba việc đó không
   * bao giờ được làm cùng lúc, nên thanh chọn tác vụ ở trên cùng chỉ để MỘT tác vụ
   * hiện ra tại một thời điểm là đủ.
   *
   * Ba việc dùng CHUNG trạng thái phạm vi (`section`/`lesson`/`kanjiDeckId`/
   * `kanjiScope`) và chung một bộ chọn (`TransferScope.svelte`): chọn "Bài 12" một
   * lần thì cả Nhập lẫn Xuất đều hiểu đó là Bài 12. Đổi tác vụ KHÔNG xoá file đang
   * chờ kiểm tra — thẻ Nhập hiện một dấu chấm để nói rằng file đó vẫn ở đó.
   *
   * # Luồng nhập
   *
   * Chọn phạm vi → chọn file → KIỂM TRA (đọc file + lập kế hoạch nhập, chưa ghi gì)
   * → xem trước → xác nhận → thông báo kết quả THẬT. Con số ở bước xem trước và con
   * số sau khi nhập cùng đi qua một hàm lập kế hoạch của lớp điều phối, nên chúng
   * không thể lệch nhau; số bản ghi bị bỏ qua do lõi Rust đếm (`ImportResult.skipped`).
   *
   * # Kích thước file
   *
   * `file.text()` và `deckParse` chạy trên luồng chính, nên có trần kích thước: một
   * file vài chục MB sẽ làm giao diện đứng trước khi kịp hiện trạng thái "đang kiểm
   * tra". Trần đó là hằng số có tên, và vượt trần là một thông báo rõ ràng — không
   * phải một lần đọc file không bao giờ xong.
   */
  import { fade, fly } from 'svelte/transition';

  import { KANJI_CATEGORIES } from '../app/content-sections.ts';
  import { app, type BackupInspection } from '../app/store.svelte.ts';
  import {
    countCards,
    readImportFile,
    scopeLabel,
    selectExportGroups,
    type ImportBatch,
    type KanjiScope,
    type TransferScope as ScopeSelection,
    type TransferSection,
  } from '../app/transfer.ts';
  import { lessonSummary, type ExportFormat, type LessonInfo } from '../core/index.ts';
  import Icon from './Icon.svelte';
  import LiquidTabs from './LiquidTabs.svelte';
  import { motionDuration, noticeFly } from './motion.ts';
  import PageHeader from './PageHeader.svelte';
  import TransferScope from './TransferScope.svelte';

  /** Ba tác vụ của màn này. Chỉ MỘT tác vụ hiện ra tại một thời điểm. */
  type Task = 'import' | 'export' | 'backup';

  const TASKS: { id: Task; label: string; subtitle: string }[] = [
    {
      id: 'import',
      label: 'Nhập',
      subtitle: 'Thêm thẻ từ file. Thẻ đã có không bị ghi đè, tiến độ học giữ nguyên.',
    },
    {
      id: 'export',
      label: 'Xuất',
      subtitle: 'Tải thẻ ra file để chia sẻ hoặc lưu trữ. File không kèm lịch ôn tập.',
    },
    {
      id: 'backup',
      label: 'Sao lưu',
      subtitle: 'Bản sao lưu cá nhân: thư viện, cài đặt và (tuỳ chọn) tiến độ học.',
    },
  ];

  /** Số bản ghi đọc được đưa vào phần xem trước. Đủ để nhận ra file có đúng không. */
  const PREVIEW_LIMIT = 5;
  /** Trần kích thước file nhập — xem ghi chú đầu tệp. */
  const MAX_IMPORT_BYTES = 12 * 1024 * 1024;
  const MAX_BACKUP_BYTES = 32 * 1024 * 1024;

  let task = $state<Task>('import');

  // ── Phạm vi dùng chung cho Nhập và Xuất ─────────────────────────────────
  let section = $state<TransferSection>('vocabulary');
  let lesson = $state('all');
  let kanjiDeckId = $state(KANJI_CATEGORIES[0]!.deckId);
  let kanjiScope = $state<KanjiScope>('single');
  let lessons = $state.raw<LessonInfo[]>([]);

  // ── Trạng thái hành động ────────────────────────────────────────────────
  let format = $state<ExportFormat>('json');
  let includeProgress = $state(true);
  /** Một hành động đang ghi file / đọc file — mọi nút gửi bị khoá trong lúc đó. */
  let busy = $state(false);
  let notice = $state<{ kind: 'ok' | 'danger'; text: string } | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let backupInput = $state<HTMLInputElement | null>(null);
  let dragging = $state(false);

  /** File đang chờ nhập, kèm kết quả KIỂM TRA (chưa ghi gì xuống đĩa). */
  interface PendingImport {
    name: string;
    size: number;
    status: 'checking' | 'ready' | 'error';
    error: string | null;
    /** Nội dung file — cần lại mỗi lần đổi phạm vi để kiểm tra lại. */
    text: string;
    batches: ImportBatch[];
    added: number;
    skipped: number;
    /** Bản ghi có trong file nhưng lõi không đọc thành thẻ được. */
    skippedRecords: number;
    validRecords: number;
    preview: { deck: string; front: string; back: string; lesson: number | undefined }[];
  }

  let pending = $state.raw<PendingImport | null>(null);
  /** Tăng mỗi lần kiểm tra; kết quả về muộn của lần cũ bị bỏ qua. */
  let checkToken = 0;

  /** File backup đang chờ khôi phục, kèm kết quả kiểm tra hợp lệ. */
  interface RestoreCandidate {
    name: string;
    size: number;
    text: string;
    inspect: BackupInspection | null;
    error: string | null;
  }

  let restore = $state.raw<RestoreCandidate | null>(null);

  const scope = $derived<ScopeSelection>({ section, lesson, kanjiDeckId, kanjiScope });

  const taskCopy = $derived(TASKS.find((item) => item.id === task) ?? TASKS[0]!);

  /** CSV không mang số bài, nên chỉ khóa khi xuất toàn bộ cần giữ phân loại. */
  const csvBlocked = $derived(
    (section === 'kanji' && kanjiScope === 'package') ||
    ((section === 'vocabulary' || section === 'patterns') && lesson === 'all'),
  );

  const exportGroups = $derived(selectExportGroups(app.cards, scope, (deckId) => app.deckName(deckId)));
  const exportCount = $derived(countCards(exportGroups));

  const exportNote = $derived.by(() => {
    if (section === 'kanji' && kanjiScope === 'package') {
      return 'Gói JSON mang deckId cho từng nhóm và giữ nguyên bảy nhóm Kanji.';
    }
    if (format === 'csv') {
      return section === 'patterns'
        ? `CSV chỉ gồm mẫu câu bài ${lesson}; không kèm lịch ôn tập hoặc số bài trong từng dòng.`
        : 'CSV chỉ có nội dung thẻ: không kèm lịch ôn tập và không giữ số bài khi xuất toàn bộ từ vựng.';
    }
    if (section === 'patterns' && lesson === 'all') {
      return 'Xuất các mẫu câu thuộc cả 50 bài, giữ số bài trên từng thẻ trong JSON.';
    }
    if (section === 'patterns') {
      return `Chỉ xuất mẫu câu bài ${lesson}; file JSON giữ số bài để có thể nhập lại chính xác.`;
    }
    return 'JSON giữ số bài trên từng thẻ. File xuất không kèm lịch ôn tập — cần cả tiến độ thì dùng tab Sao lưu.';
  });

  $effect(() => {
    if (app.content !== null) {
      // Danh sách "Bài Minna" của Từ vựng; Mẫu câu đã có số bài nên phải tách bộ.
      const vocabulary = app.cards.filter((card) => card.deckId === 'vocabulary');
      void lessonSummary(vocabulary, Date.now()).then((summary) => (lessons = summary));
    }
  });

  // ── Phạm vi: mọi thay đổi đều kiểm tra lại file đang chờ ────────────────
  //
  // Kiểm tra lại là bắt buộc, không phải tiện ích: con số "sẽ thêm bao nhiêu thẻ"
  // phụ thuộc phạm vi (bài nào, nhóm nào), nên một con số cũ hiện cạnh phạm vi mới
  // là một lời nói dối. File vẫn được giữ nguyên — người dùng không mất thao tác.

  function changeSection(next: TransferSection): void {
    section = next;
    if (csvBlocked) format = 'json';
    recheckPending();
  }

  function changeLesson(next: string): void {
    lesson = next;
    if (csvBlocked) format = 'json';
    recheckPending();
  }

  function changeKanjiDeck(deckId: string): void {
    kanjiDeckId = deckId;
    recheckPending();
  }

  function changeKanjiScope(next: KanjiScope): void {
    kanjiScope = next;
    if (next === 'package') format = 'json';
    recheckPending();
  }

  function selectTask(next: Task): void {
    if (next === task) return;
    task = next;
    notice = null;
  }

  function transferContext() {
    return {
      ...scope,
      quizForDeck: (deckId: string) => app.quizForDeck(deckId),
      deckName: (deckId: string) => app.deckName(deckId),
    };
  }

  // ── Nhập: chọn file → kiểm tra → xác nhận ───────────────────────────────

  function pickFile(): void {
    fileInput?.click();
  }

  function describe(cause: unknown, fallback: string): string {
    return cause instanceof Error && cause.message !== '' ? cause.message : fallback;
  }

  async function prepareFile(file: File): Promise<void> {
    notice = null;
    if (file.size > MAX_IMPORT_BYTES) {
      pending = null;
      notice = {
        kind: 'danger',
        text: `File ${formatBytes(file.size)} vượt giới hạn ${formatBytes(MAX_IMPORT_BYTES)}. Hãy tách thành nhiều file nhỏ hơn.`,
      };
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch (cause) {
      notice = { kind: 'danger', text: describe(cause, 'Không đọc được file.') };
      return;
    }
    await runCheck(text, file.name, file.size);
  }

  /** Kiểm tra lại file đang chờ với phạm vi HIỆN TẠI (không ghi gì). */
  function recheckPending(): void {
    const current = pending;
    if (current === null) return;
    void runCheck(current.text, current.name, current.size);
  }

  async function runCheck(text: string, name: string, size: number): Promise<void> {
    const token = ++checkToken;
    pending = {
      name,
      size,
      status: 'checking',
      error: null,
      text,
      batches: [],
      added: 0,
      skipped: 0,
      skippedRecords: 0,
      validRecords: 0,
      preview: [],
    };
    try {
      const read = await readImportFile(text, name, transferContext());
      const plan = await app.previewImport(read.batches);
      if (token !== checkToken) return;
      const validRecords = read.batches.reduce((sum, batch) => sum + batch.drafts.length, 0);
      pending = {
        name,
        size,
        status: 'ready',
        error: null,
        text,
        batches: read.batches,
        added: plan.added,
        skipped: plan.skipped,
        skippedRecords: read.skippedRecords,
        validRecords,
        preview: read.batches
          .flatMap((batch) =>
            batch.drafts.map((draft) => ({
              deck: batch.name,
              front: draft.front,
              back: draft.back,
              lesson: draft.lesson,
            })),
          )
          .slice(0, PREVIEW_LIMIT),
      };
    } catch (cause) {
      if (token !== checkToken) return;
      pending = {
        ...(pending ?? {
          name,
          size,
          text,
          batches: [],
          added: 0,
          skipped: 0,
          skippedRecords: 0,
          validRecords: 0,
          preview: [],
        }),
        status: 'error',
        error: describe(cause, 'Không đọc được file này.'),
      };
    }
  }

  function clearPending(): void {
    checkToken += 1;
    pending = null;
  }

  async function onFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) return;
    await prepareFile(file);
  }

  function onDragOver(event: DragEvent): void {
    event.preventDefault();
    dragging = true;
  }

  function onDragLeave(): void {
    dragging = false;
  }

  function onDrop(event: DragEvent): void {
    event.preventDefault();
    dragging = false;
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped === undefined || dropped === null) return;
    void prepareFile(dropped);
  }

  async function confirmImport(): Promise<void> {
    const current = pending;
    if (current === null || current.status !== 'ready' || busy) return;
    busy = true;
    notice = null;
    try {
      const result = await app.importDraftBatches(current.batches);
      const scopeText = scopeLabel(scope);
      const skipped = result.skipped > 0 ? `, bỏ qua ${result.skipped} thẻ đã có` : '';
      notice = { kind: 'ok', text: `Đã thêm ${result.added} thẻ vào ${scopeText}${skipped}.` };
      clearPending();
    } catch (cause) {
      notice = { kind: 'danger', text: describe(cause, 'Không nhập được file này.') };
    } finally {
      busy = false;
    }
  }

  // ── Xuất ───────────────────────────────────────────────────────────────

  async function onExport(): Promise<void> {
    if (exportCount === 0 || busy) return;
    busy = true;
    notice = null;
    try {
      const count = exportCount;
      const filename = await app.exportCardGroups(
        exportGroups,
        format,
        section === 'kanji' && kanjiScope === 'package',
      );
      notice = {
        kind: 'ok',
        text: `Đã tải ${count} thẻ (${scopeLabel(scope)}) ra ${filename}.`,
      };
    } catch (cause) {
      notice = { kind: 'danger', text: describe(cause, 'Không xuất được file.') };
    } finally {
      busy = false;
    }
  }

  // ── Sao lưu ────────────────────────────────────────────────────────────

  async function onExportBackup(): Promise<void> {
    if (busy) return;
    busy = true;
    notice = null;
    try {
      const filename = await app.exportPersonalBackup(includeProgress);
      notice = {
        kind: 'ok',
        text: `Đã tải ${filename}${includeProgress ? ' (có lịch ôn tập và phiên đang dở)' : ' (không có tiến độ học)'}.`,
      };
    } catch (cause) {
      notice = { kind: 'danger', text: describe(cause, 'Không tạo được bản sao lưu.') };
    } finally {
      busy = false;
    }
  }

  async function onBackupFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) return;
    notice = null;
    if (file.size > MAX_BACKUP_BYTES) {
      restore = {
        name: file.name,
        size: file.size,
        text: '',
        inspect: null,
        error: `File vượt giới hạn ${formatBytes(MAX_BACKUP_BYTES)}.`,
      };
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch (cause) {
      restore = {
        name: file.name,
        size: file.size,
        text: '',
        inspect: null,
        error: describe(cause, 'Không đọc được file.'),
      };
      return;
    }

    // Kiểm tra TRƯỚC khi hỏi xác nhận: một file hỏng phải bị từ chối ở đây, chứ
    // không phải sau khi người dùng đã đồng ý ghi đè thư viện.
    try {
      const inspect = await app.inspectPersonalBackup(text);
      restore = { name: file.name, size: file.size, text, inspect, error: null };
    } catch (cause) {
      restore = {
        name: file.name,
        size: file.size,
        text: '',
        inspect: null,
        error: describe(cause, 'File backup không hợp lệ.'),
      };
    }
  }

  async function confirmRestore(): Promise<void> {
    const current = restore;
    if (current === null || current.inspect === null || current.error !== null || busy) return;
    busy = true;
    notice = null;
    try {
      const result = await app.restorePersonalBackup(current.text);
      restore = null;
      // Thông báo kết quả nằm ở thẻ cấp ứng dụng (`app.backupRestoreNotice`): khôi
      // phục đổi luôn màn hình đang mở theo file backup, nên một thông báo cục bộ
      // ở đây sẽ biến mất trước khi người dùng kịp đọc.
      notice = {
        kind: 'ok',
        text: `Đã khôi phục ${result.cards} thẻ từ ${current.name}.`,
      };
    } catch (cause) {
      notice = { kind: 'danger', text: describe(cause, 'Không khôi phục được backup.') };
    } finally {
      busy = false;
    }
  }

  function cancelRestore(): void {
    restore = null;
  }

  // ── Định dạng hiển thị ─────────────────────────────────────────────────

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function fileKind(name: string): string {
    const extension = name.slice(name.lastIndexOf('.') + 1).toUpperCase();
    return extension === name.toUpperCase() ? 'Tệp' : extension;
  }

  function formatDate(ms: number): string {
    return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(ms);
  }
</script>

{#snippet noticeBlock()}
  {#if notice !== null}
    <p
      class="notice notice-with-icon"
      class:notice-danger={notice.kind === 'danger'}
      class:notice-ok={notice.kind === 'ok'}
      role="status"
      transition:fly={noticeFly(-8, 220)}
    >
      <Icon name={notice.kind === 'danger' ? 'alert' : 'check'} size={17} />
      <span>{notice.text}</span>
    </p>
  {/if}
{/snippet}

<main class="screen">
  <PageHeader title="Nhập / xuất" subtitle={taskCopy.subtitle} />

  <LiquidTabs
    items={TASKS.map((item) => ({
      id: item.id,
      label: item.label,
      badge: item.id === 'import' && pending !== null,
    }))}
    activeId={task}
    ariaLabel="Việc cần làm"
    className="task-picker"
    onSelect={(id) => selectTask(id as Task)}
  />

  {#if task === 'import'}
    <section
      class="card rise"
      style="--rise-delay: 0ms"
      aria-label="Nhập thẻ từ file"
      in:fade={{ duration: motionDuration(160) }}
    >
      <div class="task-grid">
        <div class="scope-column">
          <TransferScope
            mode="import"
            {section}
            {lesson}
            {kanjiDeckId}
            {kanjiScope}
            {lessons}
            onSectionChange={changeSection}
            onLessonChange={changeLesson}
            onKanjiDeckChange={changeKanjiDeck}
            onKanjiScopeChange={changeKanjiScope}
          />
        </div>

        <div class="action-block">
          {#if pending === null}
            <button
              class="dropzone"
              class:dragging
              type="button"
              disabled={busy}
              onclick={pickFile}
              ondragover={onDragOver}
              ondragleave={onDragLeave}
              ondrop={onDrop}
            >
              <span class="drop-icon" aria-hidden="true"><Icon name="upload" size={20} /></span>
              <span class="drop-copy">
                <b>Chọn file để nhập</b>
                <span>JSON · CSV · TSV</span>
              </span>
              <span class="drop-extra">hoặc kéo thả file vào đây</span>
            </button>
          {:else}
            <div class="file-card" class:failed={pending.status === 'error'}>
              <div class="file-head">
                <span class="file-badge" aria-hidden="true">
                  <Icon
                    name={pending.status === 'error' ? 'alert' : pending.status === 'checking' ? 'refresh' : 'check'}
                    size={17}
                  />
                </span>
                <span class="file-copy">
                  <b class="file-name">{pending.name}</b>
                  <span class="file-sub">{fileKind(pending.name)} · {formatBytes(pending.size)}</span>
                </span>
                <button
                  class="icon-btn"
                  type="button"
                  aria-label="Bỏ file đang chọn"
                  disabled={busy}
                  onclick={clearPending}
                >
                  <Icon name="close" size={17} />
                </button>
              </div>

              {#if pending.status === 'checking'}
                <p class="checking" role="status">
                  <span class="spinner" aria-hidden="true"></span>
                  Đang kiểm tra dữ liệu…
                </p>
              {:else if pending.status === 'error'}
                <p class="check-error" role="alert">{pending.error}</p>
                <div class="toolbar-row">
                  <button class="btn btn-inline" type="button" onclick={pickFile}>Chọn file khác</button>
                  <button class="btn btn-inline" type="button" onclick={clearPending}>Huỷ</button>
                </div>
              {:else}
                <ul class="checks">
                  <li>
                    <b class="tnum">{pending.added}</b> thẻ sẽ được thêm vào
                    <b>{scopeLabel(scope)}</b>
                  </li>
                  <li class="muted">
                    {pending.validRecords} bản ghi hợp lệ trong file
                    {#if pending.skipped > 0} · <b class="tnum">{pending.skipped}</b> thẻ đã có, bỏ qua{/if}
                  </li>
                  {#if pending.skippedRecords > 0}
                    <li class="warn">
                      <b class="tnum">{pending.skippedRecords}</b> bản ghi trong file thiếu mặt thẻ hoặc mặt nghĩa — không nhập
                    </li>
                  {/if}
                  {#if pending.batches.length > 1}
                    <li class="muted">
                      {pending.batches.length} nhóm: {pending.batches
                        .map((batch) => `${batch.name} (${batch.drafts.length})`)
                        .join(' · ')}
                    </li>
                  {/if}
                </ul>

                {#if pending.preview.length > 0}
                  <details class="preview">
                    <summary>Xem trước {pending.preview.length} thẻ đầu</summary>
                    <ul class="preview-list">
                      {#each pending.preview as row, index (index)}
                        <li>
                          <span class="preview-front">{row.front}</span>
                          <span class="preview-arrow" aria-hidden="true">→</span>
                          <span class="preview-back">{row.back}</span>
                          {#if row.lesson !== undefined}
                            <span class="preview-lesson">Bài {row.lesson}</span>
                          {/if}
                        </li>
                      {/each}
                    </ul>
                  </details>
                {/if}

                <div class="toolbar-row">
                  <button
                    class="btn btn-primary btn-inline"
                    type="button"
                    disabled={busy || pending.added === 0}
                    onclick={() => void confirmImport()}
                  >
                    <Icon name="upload" size={17} />
                    {busy ? 'Đang nhập…' : `Nhập ${pending.added} thẻ`}
                  </button>
                  <button class="btn btn-inline" type="button" disabled={busy} onclick={pickFile}>
                    Chọn file khác
                  </button>
                  <button class="btn btn-inline" type="button" disabled={busy} onclick={clearPending}>
                    Huỷ
                  </button>
                </div>

                {#if pending.added === 0}
                  <p class="muted hint">
                    Không có thẻ mới để thêm: mọi thẻ trong file đã có trong thư viện.
                  </p>
                {/if}
              {/if}
            </div>
          {/if}

          {@render noticeBlock()}

          <details class="help">
            <summary>Định dạng file và quy tắc trùng</summary>
            <div class="help-body">
              <p>
                <b>JSON</b> — mảng thẻ <code>[&#123;…&#125;]</code> hoặc đối tượng
                <code>&#123;"cards": […&#125;</code>. Gói nhiều nhóm Kanji dùng
                <code>&#123;"bundles": [&#123;"deckId": …, "cards": …&#125;]&#125;</code> với <code>deckId</code> và <code>cards</code> cho từng nhóm.
              </p>
              <p>
                <b>CSV / TSV</b> — có header
                <code>front,back,furigana,romaji,tags,lesson</code> (nhận cả
                <code>vietnamese,kanji,hiragana,romaji,category</code>), hoặc không header theo đúng thứ tự
                <code>front,back,furigana,romaji,tags</code>. Dòng thiếu mặt thẻ hoặc mặt nghĩa bị bỏ qua.
              </p>
              <p>
                <b>Trùng lặp</b> — thẻ trùng nội dung trong cùng một bộ bị bỏ qua, thẻ đã có không bao giờ bị ghi đè,
                và tiến độ học không đổi. Nhập lại cùng một file vì thế không thay đổi gì.
              </p>
              <pre class="example"><code>&#123;
  "cards": [
    &#123; "front": "Xin chào", "back": "こんにちは", "furigana": "こんにちは", "romaji": "konnichiwa", "tags": ["bài 1"] &#125;
  ]
&#125;</code></pre>
            </div>
          </details>
        </div>
      </div>
    </section>
  {:else if task === 'export'}
    <section
      class="card rise"
      style="--rise-delay: 0ms"
      aria-label="Xuất thẻ ra file"
      in:fade={{ duration: motionDuration(160) }}
    >
      <div class="task-grid">
        <div class="scope-column">
          <TransferScope
            mode="export"
            {section}
            {lesson}
            {kanjiDeckId}
            {kanjiScope}
            {lessons}
            onSectionChange={changeSection}
            onLessonChange={changeLesson}
            onKanjiDeckChange={changeKanjiDeck}
            onKanjiScopeChange={changeKanjiScope}
          />
        </div>

        <div class="action-block">
          <label class="field">
            <span>Định dạng file</span>
            <select bind:value={format}>
              <option value="json">JSON — giữ danh tính thẻ và số bài</option>
              <option value="csv" disabled={csvBlocked}>CSV — mở bằng bảng tính</option>
            </select>
          </label>
          <p class="muted action-note">{exportNote}</p>

          <button
            class="btn btn-primary btn-inline btn-block export-button"
            type="button"
            disabled={busy || exportCount === 0}
            onclick={() => void onExport()}
          >
            <Icon name="download" size={18} />
            {busy ? 'Đang dựng file…' : `Xuất ${exportCount} thẻ · ${scopeLabel(scope)}`}
          </button>

          {#if exportCount === 0}
            <p class="muted hint">
              Phạm vi này chưa có thẻ. Chọn phạm vi khác, hoặc nhập thẻ ở tab Nhập.
            </p>
          {/if}

          {@render noticeBlock()}
        </div>
      </div>
    </section>
  {:else}
    <section
      class="card rise"
      style="--rise-delay: 0ms"
      aria-label="Sao lưu cá nhân"
      in:fade={{ duration: motionDuration(160) }}
    >
      <div class="task-grid backup-grid">
        <div class="backup-block">
          <div class="section-head">
            <h2>Tạo bản sao lưu</h2>
            <span class="section-tag">{app.cards.length} thẻ</span>
          </div>
          <p class="muted action-note">
            Gồm thư viện thẻ, cài đặt và metadata nội dung — khác file bộ thẻ ở tab Xuất.
          </p>
          <label class="switch progress-switch">
            <input type="checkbox" bind:checked={includeProgress} />
            <span class="track" aria-hidden="true"></span>
            <span class="switch-label">Kèm lịch ôn tập và phiên học đang dở</span>
          </label>
          <p class="muted hint">
            {#if includeProgress}
              Khôi phục lại được tiến độ từng thẻ. File chứa dữ liệu riêng tư — chỉ mở trên thiết bị tin cậy.
            {:else}
              File nhẹ hơn, nhưng khôi phục xong mọi thẻ bắt đầu lại từ lịch ôn mới.
            {/if}
          </p>
          <button
            class="btn btn-primary btn-inline btn-block"
            type="button"
            disabled={busy}
            onclick={() => void onExportBackup()}
          >
            <Icon name="download" size={18} />
            {busy ? 'Đang tạo…' : 'Tải bản sao lưu'}
          </button>
        </div>

        <hr class="split" />

        <div class="backup-block">
          <div class="section-head">
            <h2>Khôi phục từ bản sao lưu</h2>
          </div>

          {#if restore === null}
            <p class="muted action-note">
              Khôi phục <b>thay toàn bộ</b> thư viện và cài đặt hiện tại ({app.cards.length} thẻ) bằng nội dung của
              file. Muốn thêm thẻ từ file bộ thẻ thì dùng tab Nhập.
            </p>
            <button class="btn btn-inline btn-block" type="button" disabled={busy} onclick={() => backupInput?.click()}>
              <Icon name="refresh" size={17} />
              Chọn file backup để kiểm tra
            </button>
          {:else}
            <div class="file-card" class:failed={restore.error !== null}>
              <div class="file-head">
                <span class="file-badge" aria-hidden="true">
                  <Icon name={restore.error === null ? 'check' : 'alert'} size={17} />
                </span>
                <span class="file-copy">
                  <b class="file-name">{restore.name}</b>
                  <span class="file-sub">{fileKind(restore.name)} · {formatBytes(restore.size)}</span>
                </span>
                <button
                  class="icon-btn"
                  type="button"
                  aria-label="Bỏ file backup đang chọn"
                  disabled={busy}
                  onclick={cancelRestore}
                >
                  <Icon name="close" size={17} />
                </button>
              </div>

              {#if restore.error !== null}
                <p class="check-error" role="alert">
                  {restore.error} Thư viện hiện tại chưa bị thay đổi.
                </p>
                <div class="toolbar-row">
                  <button class="btn btn-inline" type="button" onclick={() => backupInput?.click()}>
                    Chọn file khác
                  </button>
                  <button class="btn btn-inline" type="button" onclick={cancelRestore}>Huỷ</button>
                </div>
              {:else if restore.inspect !== null}
                <ul class="checks">
                  <li>
                    Bản sao lưu hợp lệ · <b class="tnum">{restore.inspect.cards}</b> thẻ ·
                    {restore.inspect.includeProgress ? 'có tiến độ học' : 'không có tiến độ học'}
                  </li>
                  <li class="muted">Tạo lúc {formatDate(restore.inspect.createdAt)}</li>
                  {#if restore.inspect.invalidCards > 0}
                    <li class="warn">
                      <b class="tnum">{restore.inspect.invalidCards}</b> thẻ trong file không đọc được — khôi phục sẽ bị
                      từ chối để không làm hỏng thư viện hiện tại.
                    </li>
                  {/if}
                  {#if restore.inspect.sessionExpired}
                    <li class="warn">Phiên học trong file đã quá hạn lưu, sẽ không được khôi phục.</li>
                  {/if}
                </ul>

                <p class="warn-text">
                  Khôi phục sẽ xoá {app.cards.length} thẻ hiện có và thay bằng file này, rồi mở lại màn hình đã lưu
                  trong bản sao lưu.
                </p>

                <div class="toolbar-row">
                  <button
                    class="btn btn-primary btn-inline"
                    type="button"
                    disabled={busy || restore.inspect.invalidCards > 0}
                    onclick={() => void confirmRestore()}
                  >
                    <Icon name="refresh" size={17} />
                    {busy ? 'Đang khôi phục…' : `Khôi phục ${restore.inspect.cards} thẻ`}
                  </button>
                  <button
                    class="btn btn-inline"
                    type="button"
                    disabled={busy}
                    onclick={() => void onExportBackup()}
                  >
                    Tải bản sao lưu hiện tại trước
                  </button>
                  <button class="btn btn-inline" type="button" disabled={busy} onclick={cancelRestore}>Huỷ</button>
                </div>
              {/if}
            </div>
          {/if}

          {@render noticeBlock()}
        </div>
      </div>
    </section>
  {/if}
</main>

<input
  bind:this={fileInput}
  class="hidden-input"
  type="file"
  accept=".json,.csv,.tsv,.txt,application/json,text/csv"
  onchange={(event) => void onFile(event)}
/>
<input
  bind:this={backupInput}
  class="hidden-input"
  type="file"
  accept=".json,application/json"
  onchange={(event) => void onBackupFile(event)}
/>

<style>
  h2 {
    font-size: 1rem;
  }

  .hidden-input {
    display: none;
  }

  /* ── Bố cục trong thẻ ───────────────────────────────────────────────
     Một cột trên điện thoại; từ 1000px tách hai cột để không kéo giãn các khối
     mobile thành những dải trống ngang. Cùng thành phần, cùng thứ tự thao tác. */
  .task-grid {
    display: grid;
    gap: 16px;
  }

  .action-block {
    min-width: 0;
  }

  @media (min-width: 1000px) {
    .task-grid {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
      gap: 24px;
      align-items: start;
    }

    .backup-grid .split {
      display: none;
    }
  }

  /* Chọn giao diện theo breakpoint và khả năng hover thực tế: máy lai có con
     trỏ sẽ dùng drag zone khi đủ bề rộng; thiết bị hẹp luôn ưu tiên nút chạm gọn. */
  .dropzone {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 52px;
    padding: 8px 14px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface-2);
    color: var(--text);
    text-align: left;
    transition:
      border-color var(--dur-2) var(--ease-out),
      background-color var(--dur-2) var(--ease-out);
  }

  .dropzone:disabled {
    opacity: 0.6;
  }

  @media (max-width: 719px), (any-hover: none) {
    .drop-extra {
      display: none;
    }
  }

  .dropzone.dragging {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .drop-icon {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--surface);
    color: var(--accent);
    box-shadow: var(--shadow-1);
  }

  .drop-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .drop-copy b {
    font-weight: 600;
  }

  .drop-copy span {
    color: var(--muted);
    font-size: 0.8rem;
  }

  .drop-extra {
    display: none;
    margin-left: auto;
    color: var(--muted);
    font-size: 0.82rem;
  }

  @media (min-width: 720px) and (any-hover: hover) {
    .dropzone {
      flex-direction: column;
      justify-content: center;
      gap: 6px;
      min-height: 150px;
      padding: 26px 18px;
      border-style: dashed;
      text-align: center;
    }

    .drop-extra {
      display: block;
      margin: 0;
    }
  }

  /* ── Thẻ file đang chờ ──────────────────────────────────────────────
     Sau khi chọn file, vùng chọn file TRỐNG được thay bằng trạng thái của file
     đó — không còn một khung tải file rỗng nằm cạnh kết quả kiểm tra. */
  .file-card {
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
  }

  .file-card.failed {
    border-color: color-mix(in srgb, var(--danger) 40%, var(--border));
    background: var(--danger-soft);
  }

  .file-head {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .file-badge {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--surface);
    color: var(--accent);
    box-shadow: var(--shadow-1);
  }

  .file-card.failed .file-badge {
    color: var(--danger);
  }

  .file-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }

  .file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-sub {
    color: var(--muted);
    font-size: 0.78rem;
  }

  .icon-btn {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    border: 1px solid transparent;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
  }

  .icon-btn:disabled {
    opacity: 0.5;
  }

  @media (hover: hover) {
    .icon-btn:hover:not(:disabled) {
      border-color: var(--border);
      background: var(--surface);
      color: var(--text);
    }
  }

  .checking {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 12px 0 0;
    color: var(--muted);
    font-size: 0.86rem;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid var(--border-strong);
    border-top-color: var(--accent);
    animation: spin 900ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
  }

  .check-error {
    margin: 12px 0 0;
    color: var(--danger);
    font-size: 0.86rem;
  }

  .checks {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.86rem;
  }

  .checks li {
    display: flex;
    gap: 8px;
    align-items: baseline;
  }

  /* Vạch nhỏ thay cho badge: phân cấp bằng khoảng cách và một điểm nhấn, không
     bằng thêm một lớp viền nữa. */
  .checks li::before {
    content: '';
    flex: 0 0 auto;
    width: 3px;
    align-self: stretch;
    border-radius: 999px;
    background: var(--accent-line);
  }

  .checks li.muted::before {
    background: var(--border-strong);
  }

  .checks li.warn::before {
    background: var(--warn);
  }

  .checks li.warn {
    color: var(--warn);
  }

  .preview {
    margin-top: 10px;
    border-top: 1px solid var(--border);
    padding-top: 8px;
  }

  .preview summary {
    cursor: pointer;
    color: var(--muted);
    font-size: 0.82rem;
    font-weight: 600;
  }

  .preview-list {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.84rem;
  }

  .preview-list li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px;
  }

  .preview-front {
    color: var(--muted);
  }

  .preview-arrow {
    color: var(--border-strong);
  }

  .preview-back {
    font-weight: 600;
  }

  .preview-lesson {
    margin-left: auto;
    color: var(--muted);
    font-size: 0.76rem;
  }

  .hint {
    margin: 10px 0 0;
    font-size: 0.8rem;
  }

  .warn-text {
    margin: 12px 0 0;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: var(--warn-soft);
    color: var(--warn);
    font-size: 0.82rem;
  }

  /* ── Trợ giúp định dạng ─────────────────────────────────────────────
     Hướng dẫn dài nằm sau một dòng gập: người mới mở được, người đã quen không
     phải cuộn qua nó mỗi lần nhập file. */
  .help {
    margin-top: 12px;
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }

  .help summary {
    cursor: pointer;
    color: var(--muted);
    font-size: 0.84rem;
    font-weight: 600;
  }

  .help-body {
    margin-top: 10px;
    font-size: 0.84rem;
    color: var(--muted);
  }

  .help-body p {
    margin: 0 0 8px;
  }

  .help-body code {
    color: var(--text);
  }

  .example {
    overflow: auto;
    margin: 10px 0 0;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
    font-size: 0.75rem;
    color: var(--text);
  }

  /* ── Xuất ─────────────────────────────────────────────────────────── */
  .action-note {
    margin: 10px 0 0;
    font-size: 0.82rem;
  }

  .export-button {
    margin-top: 12px;
  }

  /* ── Sao lưu ──────────────────────────────────────────────────────── */
  .backup-block {
    min-width: 0;
  }

  .split {
    border: 0;
    border-top: 1px solid var(--border);
    margin: 18px 0;
  }

  .progress-switch {
    margin-top: 12px;
  }

  .switch-label {
    font-size: 0.88rem;
  }

  .backup-block .btn {
    margin-top: 12px;
  }

  .notice-with-icon {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-top: 12px;
  }
</style>
