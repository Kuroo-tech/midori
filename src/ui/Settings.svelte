<script lang="ts">
  /**
   * Cài đặt.
   *
   * # Thứ bậc theo MỤC ĐÍCH, không theo cách triển khai
   *
   * Năm nhóm, theo đúng thứ tự người dùng cần tới:
   * 1. **Học tập** — ba thiết lập thay đổi thường xuyên, đặt ngay trên cùng, mỗi
   *    thiết lập là một HÀNG trong cùng một bề mặt (không phải một thẻ riêng).
   * 2. **Thư viện** — chỉ số gộp của thư viện, lối vào Thống kê chi tiết và Trình
   *    biên tập thẻ, cùng bản ghi cứu hộ. Mục này chuyển từ Trang chủ sang; nhóm
   *    "Công cụ" cũ đã gộp vào đây nên Trình biên tập thẻ chỉ còn một lối vào.
   * 3. **Cập nhật** — HAI loại tách biệt hẳn: Ứng dụng (cần tải lại trang) và Nội
   *    dung học (không cần tải lại, không mất tiến độ). Mỗi loại có phiên bản,
   *    trạng thái và nút riêng; tuỳ chọn ít dùng (quay lại bản trước, cài lại nội
   *    dung đi kèm) nằm trong vùng mở rộng.
   * 4. **Thông tin ứng dụng** — thông tin chẩn đoán, gập lại; phiên bản vẫn đọc
   *    được ngay ở dòng tiêu đề của mục.
   * 5. **Quản lý dữ liệu** — thao tác có rủi ro, tách hẳn xuống cuối, có bước xác
   *    nhận tại chỗ và nói rõ dữ liệu nào bị xoá, dữ liệu nào được giữ.
   *
   * # Một khuôn chung cho MỌI nhóm
   *
   * Rà lại toàn màn theo ba trục, để không nhóm nào đọc ra một luật riêng:
   *
   * - **Thứ tự** — việc thay đổi hằng ngày trước, việc hiếm dùng sau, thao tác
   *   không hoàn tác được xuống cuối cùng. Trong mỗi nhóm cũng vậy: hành động
   *   chính (hoặc hàng thiết lập) đứng trước, nội dung phụ gập lại đứng sau.
   * - **Bề mặt** — mỗi nhóm là `h2.group-title` + đúng MỘT `.panel`; nội dung bên
   *   trong panel là các hàng có đệm ngang 16px, hàng nối hàng bằng đường kẻ. Chỉ
   *   nhóm Quản lý dữ liệu đổi màu bề mặt (`.danger-panel`) — cố ý, vì đó là tín
   *   hiệu cảnh báo, không phải một kiểu trình bày khác.
   * - **Cách gập** — mọi nội dung phụ dùng CÙNG dòng `.advanced-toggle` (cùng chiều
   *   cao, cùng nhãn tự đổi khi mở: `Ẩn …`), mở bằng `{#if}` nên nội dung gập KHÔNG
   *   nằm trong DOM, và luôn đứng SAU hành động chính của nhóm.
   *
   * # Vì sao không còn mọi thứ là `.card`
   *
   * Bản trước bọc từng nhóm trong một thẻ có viền, tiêu đề và badge giống hệt
   * nhau, nên mắt không có tín hiệu nào để phân biệt "thiết lập tôi đổi hằng ngày"
   * với "phiên bản lõi Rust". Nay cả năm nhóm dùng chung một bề mặt `.panel`
   * phẳng, và Quản lý dữ liệu mang sắc cảnh báo riêng.
   *
   * # Trạng thái nào là trạng thái THẬT
   *
   * Không có trạng thái giả: "đang chạy phiên bản X" là phiên bản đang chạy thật,
   * "có bản mới" chỉ hiện khi service worker hoặc `/data/version.json` thực sự báo
   * có bản mới, và nút cập nhật chỉ xuất hiện khi đó. Kiểm tra thành công không có
   * nghĩa là đã cập nhật: cập nhật ứng dụng chỉ xong sau khi trang tải lại.
   */
  import { fly } from 'svelte/transition';

  import { app, type ContentStageResult } from '../app/store.svelte.ts';
  import type { ContentPreview, PreviewCard } from '../content/types.ts';
  import { MAX_DAILY_NEW_LIMIT, type AppSettings, type ThemeMode } from '../storage/settings.ts';
  import {
    APP_VERSION,
    applyAppUpdate,
    checkDeployedVersion,
    getAppUpdateState,
    subscribeAppUpdate,
  } from '../pwa/updates.ts';
  import Icon from './Icon.svelte';
  import LiquidTabs from './LiquidTabs.svelte';
  import { noticeFly } from './motion.ts';
  import PageHeader from './PageHeader.svelte';

  const THEMES: { value: ThemeMode; label: string }[] = [
    { value: 'auto', label: 'Hệ thống' },
    { value: 'light', label: 'Sáng' },
    { value: 'dark', label: 'Tối' },
  ];

  // ── Cài đặt học tập ──────────────────────────────────────────────────────
  let settingsError = $state<string | null>(null);
  /** Phản hồi của ô "Thẻ mới tối đa" — khác lỗi lưu cài đặt ở trên. */
  let limitError = $state<string | null>(null);
  /** `true` khi giá trị nhập không dùng được (không phải số), khác với "đã bị kẹp". */
  let limitInvalid = $state(false);

  /**
   * Ghi một phần cài đặt. Trả `false` khi ghi hỏng để điều khiển hiển thị tự trả
   * về giá trị cũ — một cài đặt trông như đã đổi mà thực ra chưa lưu còn tệ hơn
   * một thông báo lỗi.
   */
  async function persistSettings(patch: Partial<AppSettings>): Promise<boolean> {
    settingsError = null;
    try {
      await app.updateSettings(patch);
      return true;
    } catch (cause) {
      console.warn('Không lưu được cài đặt:', cause);
      settingsError = 'Không lưu được cài đặt. Giá trị đang dùng vẫn được giữ.';
      return false;
    }
  }

  async function setTheme(theme: ThemeMode): Promise<void> {
    if (theme === app.settings.theme) return;
    await persistSettings({ theme });
  }

  /**
   * Áp giới hạn thẻ mới. Không bao giờ ghi giá trị thô từ ô nhập:
   * - không phải số hữu hạn → từ chối, trả ô về giá trị đang dùng;
   * - ngoài 0…MAX_DAILY_NEW_LIMIT → kẹp lại (cùng luật với `normalizeSettings`,
   *   nhưng người dùng được báo thay vì im lặng).
   *
   * Logic lập lịch vì thế không bao giờ nhận `NaN`, số âm hay giá trị khổng lồ từ
   * giao diện.
   */
  async function commitDailyLimit(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const raw = input.value.trim();
    const parsed = Number(raw);

    if (raw === '' || !Number.isFinite(parsed)) {
      limitError = `Nhập một số từ 0 đến ${MAX_DAILY_NEW_LIMIT}.`;
      limitInvalid = true;
      input.value = String(app.settings.dailyNewLimit);
      return;
    }

    const rounded = Math.round(parsed);
    const clamped = Math.min(MAX_DAILY_NEW_LIMIT, Math.max(0, rounded));
    limitError =
      clamped !== parsed
        ? `Đã giới hạn trong khoảng 0–${MAX_DAILY_NEW_LIMIT} thẻ.`
        : null;
    limitInvalid = false;
    input.value = String(clamped);

    if (clamped === app.settings.dailyNewLimit) return;
    if (!(await persistSettings({ dailyNewLimit: clamped }))) {
      input.value = String(app.settings.dailyNewLimit);
    }
  }

  async function commitShuffle(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const next = input.checked;
    if (!(await persistSettings({ shuffleByDefault: next }))) {
      input.checked = app.settings.shuffleByDefault;
    }
  }

  // ── Cập nhật ứng dụng ────────────────────────────────────────────────────
  let appBusy = $state(false);
  let appNotice = $state<string | null>(null);
  let appUpdate = $state(getAppUpdateState());

  $effect(() => subscribeAppUpdate((state) => (appUpdate = state)));

  const appStatus = $derived.by(() => {
    if (appUpdate.applying) return 'Đang kích hoạt bản mới và tải lại trang…';
    if (appUpdate.available) {
      return appUpdate.version === null
        ? 'Bản dựng mới đã sẵn sàng để kích hoạt.'
        : `Bản ${appUpdate.version} đã sẵn sàng để kích hoạt.`;
    }
    if (appBusy) return 'Đang kiểm tra bản công bố…';
    return `Đang chạy phiên bản ${APP_VERSION}.`;
  });

  async function runCheckBuild(): Promise<void> {
    if (appBusy || appUpdate.applying) return;
    appBusy = true;
    appNotice = null;
    try {
      const deployed = await checkDeployedVersion();
      const state = getAppUpdateState();
      appUpdate = state;
      if (state.available) {
        appNotice =
          state.version === null
            ? 'Có bản dựng mới đang chờ kích hoạt.'
            : `Nguồn công bố có bản ${state.version}.`;
      } else if (deployed === null) {
        appNotice = 'Không kiểm tra được bản công bố (có thể đang ngoại tuyến).';
      } else {
        appNotice = `Đang chạy bản mới nhất (${deployed}).`;
      }
    } catch (cause) {
      console.warn('Không kiểm tra được bản công bố:', cause);
      appNotice = 'Không kiểm tra được bản công bố. Thử lại khi có mạng.';
    } finally {
      appBusy = false;
    }
  }

  // ── Cập nhật nội dung ────────────────────────────────────────────────────
  type ContentAction = 'check' | 'activate' | 'discard' | 'rollback' | 'reinstall' | 'sync';
  let contentBusy = $state(false);
  let contentAction = $state<ContentAction | null>(null);
  /**
   * Tuỳ chọn nội dung ít dùng.
   *
   * Mở bằng `{#if}` chứ không bằng `<details>`: nội dung gập KHÔNG được nằm trong
   * DOM. Nút nằm trong một khối `display: none` vẫn bị coi là "có mặt nhưng không
   * chạm tới được" — cả phép kiểm bố cục lẫn trình đọc màn hình đều đúng khi phàn
   * nàn về nó. Chỉ dựng khi người dùng thực sự mở.
   */
  let showAdvanced = $state(false);
  let contentResult = $state<ContentStageResult | null>(null);
  let contentNotice = $state<{ text: string; ok: boolean } | null>(null);
  /**
   * Danh sách thẻ của bước xem trước chỉ dựng khi người dùng mở.
   *
   * Cùng lý do với "Tuỳ chọn khác": nội dung gập không được nằm trong DOM. Một
   * lần cập nhật có thể kèm hàng trăm thẻ, và dựng hết chúng để `display: none`
   * vừa tốn vừa làm phép kiểm bố cục báo sai.
   */
  let showPreviewDetails = $state(false);

  /**
   * Bước 1 của quy trình: tải manifest, tải gói đã đổi, xác minh hash và đệm.
   *
   * Kết cục `staged` chỉ là bản NHÁP đã sẵn sàng; nó chưa chạm vào thư viện.
   */
  async function runContentUpdate(): Promise<void> {
    if (contentBusy) return;
    contentBusy = true;
    contentAction = 'check';
    contentNotice = null;
    // Mỗi lần kiểm tra là một bản xem trước mới; danh sách cũ không còn đúng.
    showPreviewDetails = false;
    try {
      contentResult = await app.stageContentUpdate();
    } catch (cause) {
      console.warn('Không kiểm tra được nội dung:', cause);
      contentNotice = {
        text: `Không kiểm tra được nội dung: ${cause instanceof Error ? cause.message : 'lỗi không xác định'}. Nội dung đang dùng vẫn nguyên vẹn.`,
        ok: false,
      };
    } finally {
      contentBusy = false;
      contentAction = null;
    }
  }

  /**
   * Bước 2: kích hoạt bản đã đệm, rồi đồng bộ thư viện và mốc phiên bản.
   *
   * Toàn bộ việc chuyển ngăn xảy ra trong một giao dịch của kho nội dung; sau đó
   * `content_reconcile` giữ lịch SRS của thẻ cũ, tạo thẻ mới và đánh dấu thẻ mồ
   * côi — không xoá gì.
   */
  async function runActivate(): Promise<void> {
    if (contentBusy) return;
    contentBusy = true;
    contentAction = 'activate';
    contentNotice = null;
    try {
      const result = await app.activateContentUpdate();
      contentResult = null;
      if (result.status === 'activated') {
        const { sync } = result;
        contentNotice = {
          text: `Đã kích hoạt nội dung ${result.contentVersion}: cập nhật ${sync.updated} thẻ, thêm ${sync.added} thẻ mới, ${sync.orphaned} thẻ bị bỏ (vẫn giữ trong thư viện).`,
          ok: true,
        };
      } else if (result.status === 'nothing-staged') {
        contentNotice = { text: 'Không còn bản nội dung nào đang chờ kích hoạt.', ok: false };
      } else if (result.status === 'sync-failed') {
        contentNotice = {
          text: `Đã kích hoạt nội dung ${result.contentVersion} nhưng chưa đồng bộ được thư viện: ${result.message}. Thẻ và tiến độ cũ vẫn được giữ; có thể thử đồng bộ lại.`,
          ok: false,
        };
      } else {
        contentNotice = {
          text: `Không kích hoạt được nội dung: ${result.message}. Nội dung đang dùng vẫn nguyên vẹn.`,
          ok: false,
        };
      }
    } catch (cause) {
      console.warn('Không kích hoạt được nội dung:', cause);
      contentNotice = {
        text: `Không kích hoạt được nội dung: ${cause instanceof Error ? cause.message : 'lỗi không xác định'}. Nội dung đang dùng vẫn nguyên vẹn.`,
        ok: false,
      };
    } finally {
      contentBusy = false;
      contentAction = null;
    }
  }

  /** Bỏ bản đã đệm. Nội dung đang dùng và thư viện không đổi. */
  async function runDiscard(): Promise<void> {
    if (contentBusy) return;
    contentBusy = true;
    contentAction = 'discard';
    contentNotice = null;
    try {
      await app.discardStagedContent();
      contentResult = null;
      contentNotice = { text: 'Đã bỏ bản nội dung vừa tải. Vẫn dùng bản đang có.', ok: true };
    } catch (cause) {
      console.warn('Không bỏ được bản nội dung đã tải:', cause);
      contentNotice = {
        text: `Không bỏ được bản nội dung đã tải: ${cause instanceof Error ? cause.message : 'lỗi không xác định'}.`,
        ok: false,
      };
    } finally {
      contentBusy = false;
      contentAction = null;
    }
  }

  async function runRollback(): Promise<void> {
    if (contentBusy) return;
    contentBusy = true;
    contentAction = 'rollback';
    contentNotice = null;
    try {
      const result = await app.rollbackContent();
      // Bản mới nhất vừa báo ở trên không còn đúng sau khi quay lại.
      if (result !== 'missing-previous') contentResult = null;
      contentNotice =
        result === 'rolled-back'
          ? { text: 'Đã quay lại bản nội dung trước và đồng bộ thư viện.', ok: true }
          : result === 'sync-failed'
            ? {
                text: 'Đã quay lại nội dung nhưng chưa đồng bộ thư viện. Thẻ và tiến độ cũ vẫn được giữ.',
                ok: false,
              }
            : { text: 'Không có bản nội dung trước để quay lại.', ok: false };
    } catch (cause) {
      console.warn('Không quay lại được nội dung trước:', cause);
      contentNotice = {
        text: `Không quay lại được bản nội dung trước: ${cause instanceof Error ? cause.message : 'lỗi không xác định'}.`,
        ok: false,
      };
    } finally {
      contentBusy = false;
      contentAction = null;
    }
  }

  async function runReinstallSeed(): Promise<void> {
    if (contentBusy) return;
    contentBusy = true;
    contentAction = 'reinstall';
    contentNotice = null;
    try {
      const synced = await app.reinstallSeed();
      contentNotice = synced
        ? { text: 'Đã cài lại cấu trúc nội dung đi kèm bản dựng; thư viện của bạn không bị đụng tới.', ok: true }
        : {
            text: 'Đã cài lại nội dung nhưng chưa đồng bộ thư viện. Thẻ và tiến độ cũ vẫn được giữ.',
            ok: false,
          };
    } catch (cause) {
      console.warn('Không cài lại được nội dung đi kèm:', cause);
      contentNotice = {
        text: `Không cài lại được nội dung đi kèm: ${cause instanceof Error ? cause.message : 'lỗi không xác định'}. Nội dung đang dùng vẫn nguyên vẹn.`,
        ok: false,
      };
    } finally {
      contentBusy = false;
      contentAction = null;
    }
  }

  async function runRetrySync(): Promise<void> {
    if (contentBusy) return;
    contentBusy = true;
    contentAction = 'sync';
    contentNotice = null;
    try {
      const synced = await app.retryContentSync();
      contentNotice = synced
        ? { text: 'Đã đồng bộ lại thư viện với nội dung đang dùng.', ok: true }
        : { text: 'Chưa đồng bộ được thư viện. Thẻ và tiến độ hiện có vẫn được giữ.', ok: false };
    } catch (cause) {
      console.warn('Không đồng bộ lại được thư viện:', cause);
      contentNotice = {
        text: `Chưa đồng bộ được thư viện: ${cause instanceof Error ? cause.message : 'lỗi không xác định'}. Thẻ và tiến độ hiện có vẫn được giữ.`,
        ok: false,
      };
    } finally {
      contentBusy = false;
      contentAction = null;
    }
  }

  const contentVersion = $derived(app.content?.contentVersion ?? '—');
  const bundleCount = $derived(app.content?.bundles.length ?? 0);

  /** Tổng số thẻ của bản đang chờ kích hoạt — 0 khi không có bước xem trước. */
  const previewTotal = $derived(
    contentResult !== null && contentResult.status === 'staged'
      ? contentResult.preview.updated + contentResult.preview.added + contentResult.preview.orphaned
      : 0,
  );

  /**
   * Ba nhóm thẻ của bước xem trước. Dựng từ CÙNG nguồn với các con số phía trên
   * (`ContentPreview`), nên danh sách không thể lệch với số đếm.
   */
  function previewGroups(preview: ContentPreview): {
    key: string;
    title: string;
    note: string;
    cards: PreviewCard[];
  }[] {
    return [
      {
        key: 'updated',
        title: 'Thẻ cập nhật',
        note: 'Nội dung đổi, giữ nguyên lịch ôn.',
        cards: preview.updatedCards,
      },
      {
        key: 'added',
        title: 'Thẻ mới',
        note: 'Tạo mới ở trạng thái chưa học.',
        cards: preview.addedCards,
      },
      {
        key: 'orphaned',
        title: 'Thẻ bị bỏ',
        note: 'Không còn trong nội dung nhưng vẫn giữ trong thư viện.',
        cards: preview.orphanedCards,
      },
    ];
  }

  // ── Xoá dữ liệu ──────────────────────────────────────────────────────────
  let confirmingErase = $state(false);
  let erasing = $state(false);
  let eraseNotice = $state<{ text: string; ok: boolean } | null>(null);

  /**
   * Chỉ xoá sau khi người dùng xác nhận trong ứng dụng, và báo đúng số thẻ đã bị
   * xoá. `eraseLibrary` xoá thẻ + phiên đang dở + mốc đồng bộ nội dung; cài đặt
   * và bản ghi cứu hộ được giữ (xem `AppStore.eraseLibrary`).
   */
  async function confirmErase(): Promise<void> {
    if (erasing) return;
    const count = app.cards.length;
    erasing = true;
    eraseNotice = null;
    try {
      await app.eraseLibrary();
      confirmingErase = false;
      eraseNotice = {
        text: `Đã xoá ${count} thẻ và toàn bộ tiến độ trên thiết bị này. Thư viện hiện trống; dữ liệu chỉ có lại khi bạn nhập hoặc tự tạo thẻ.`,
        ok: true,
      };
    } catch (cause) {
      console.warn('Không xoá được thư viện:', cause);
      eraseNotice = {
        text: `Chưa xoá xong dữ liệu: ${cause instanceof Error ? cause.message : 'lỗi không xác định'}. Kiểm tra lại thư viện trước khi thử lại.`,
        ok: false,
      };
    } finally {
      erasing = false;
    }
  }
  // ── Thư viện ─────────────────────────────────────────────────────────────
  //
  // Số liệu gộp của thư viện chuyển từ Trang chủ sang cùng mục Thư viện. Làm mới
  // khi màn được dựng, vì số có thể đã cũ sau khi tạo/sửa thẻ ở Trình biên tập.
  $effect(() => {
    void app.refreshStats();
  });

  const stats = $derived(app.stats);
  const total = $derived(stats?.total ?? 0);
  const newCount = $derived(stats?.new ?? 0);
  const seenTotal = $derived(Math.max(0, total - newCount));
  const mastered = $derived(stats?.mastered ?? 0);
  const masteryPercent = $derived(Math.round((stats?.mastery ?? 0) * 100));

  /**
   * Số liệu gộp gập lại cho nhóm Thư viện ngắn hơn.
   *
   * Mở bằng `{#if}` chứ không bằng `<details>`: nội dung gập KHÔNG được nằm trong
   * DOM, cùng lý do với "Tuỳ chọn khác" — nội dung nằm trong khối `display: none`
   * vẫn bị coi là "có mặt nhưng không chạm tới được". Hai nút hành động vì thế vẫn
   * đứng ngoài khối gập. Mặc định gập: đây là thông tin tham khảo, không phải việc
   * cần làm khi mở Cài đặt.
   */
  let showLibraryDetails = $state(false);

  /** Thông tin ứng dụng gập theo CÙNG khuôn với nhóm Thư viện (xem ghi chú trên). */
  let showAppInfo = $state(false);
</script>

<main class="screen settings-screen">
  <PageHeader title="Cài đặt" subtitle="Học tập, thư viện và dữ liệu trên máy." />

  <!-- ── Học tập ────────────────────────────────────────────────────────────
       Ba thiết lập thay đổi thường xuyên nhất, trên cùng và trong MỘT bề mặt.
       Không thẻ riêng cho từng thiết lập: đây là danh sách hàng có phân cách. -->
  <section class="group rise" style="--rise-delay: 0ms" aria-labelledby="settings-study">
    <h2 class="group-title" id="settings-study">Học tập</h2>
    <div class="panel">
      <div class="setting-row theme-row">
        <div class="setting-copy">
          <span class="setting-label" id="theme-label">Giao diện</span>
        </div>
        <LiquidTabs
          items={THEMES.map((option) => ({ id: option.value, label: option.label }))}
          activeId={app.settings.theme}
          ariaLabel="Giao diện"
          variant="segmented"
          className="segmented"
          onSelect={(id) => void setTheme(id as ThemeMode)}
        />
      </div>

      <div class="setting-row limit-row">
        <div class="setting-copy">
          <label class="setting-label" for="daily-limit">Thẻ mới tối đa mỗi ngày</label>
          <span class="setting-hint" id="daily-limit-hint">
            Giới hạn thẻ chưa học mỗi ngày; thẻ tới hạn vẫn được ôn đủ. 0 = chỉ ôn thẻ cũ.
          </span>
        </div>
        <span class="limit-field">
          <input
            id="daily-limit"
            type="number"
            inputmode="numeric"
            min="0"
            max={MAX_DAILY_NEW_LIMIT}
            step="1"
            value={app.settings.dailyNewLimit}
            aria-describedby="daily-limit-hint"
            aria-invalid={limitInvalid}
            oninput={() => {
              limitError = null;
              limitInvalid = false;
            }}
            onchange={(event) => void commitDailyLimit(event)}
          />
          <span class="limit-unit" aria-hidden="true">thẻ</span>
        </span>
        {#if limitError !== null}
          <p class:row-error={limitInvalid} class:row-note={!limitInvalid} role="status">
            {limitError}
          </p>
        {/if}
      </div>

      <label class="setting-row toggle-row">
        <span class="setting-copy">
          <span class="setting-label">Trộn thứ tự khi bắt đầu phiên học</span>
          <span class="setting-hint">Chỉ đổi thứ tự hàng đợi, không đổi lịch ôn.</span>
        </span>
        <span class="switch">
          <input
            type="checkbox"
            checked={app.settings.shuffleByDefault}
            onchange={(event) => void commitShuffle(event)}
          />
          <span class="track" aria-hidden="true"></span>
        </span>
      </label>
    </div>
    {#if settingsError !== null}
      <p class="notice notice-danger" role="alert">{settingsError}</p>
    {/if}
  </section>

  <!-- ── Thư viện ────────────────────────────────────────────────────────────
       Mục "Thư viện" chuyển từ Trang chủ sang và được rút gọn: hai lối vào (Thống
       kê chi tiết, Trình biên tập thẻ) luôn hiện, còn số liệu gộp + độ thành thạo
       nằm trong MỘT khối gập nên nhóm chỉ cao hai dòng. Nhóm "Công cụ" cũ đã gộp
       vào đây, nên Trình biên tập thẻ chỉ có MỘT lối vào — đó cũng là lý do nút
       "Tất cả nội dung" cũ ở Trang chủ được thay bằng lối vào này. -->
  <section class="group rise" style="--rise-delay: 45ms" aria-labelledby="settings-library">
    <h2 class="group-title" id="settings-library">Thư viện</h2>
    <div class="panel">
      <div class="library-body">
        <!-- Hai việc thật sự làm được để ở trên, luôn hiện: số liệu gộp bên dưới
             chỉ để tham khảo nên không được chiếm chỗ của chúng. -->
        <div class="actions">
          <button type="button" class="btn btn-inline" onclick={() => app.go('stats')}>
            <Icon name="chart" size={17} />
            Thống kê chi tiết
          </button>
          <button type="button" class="btn btn-inline" onclick={() => app.go('editor')}>
            <Icon name="edit" size={17} />
            Trình biên tập thẻ
          </button>
        </div>

        {#if app.recoveryCount > 0}
          <div class="notice notice-danger" role="status">
            <Icon name="alert" size={16} />
            <span>{app.recoveryCount} bản ghi không hợp lệ đã được cách ly, không bị xoá.</span>
            <button class="btn btn-inline" onclick={() => void app.exportRecoveryRecords()}>
              Tải dữ liệu cứu hộ
            </button>
          </div>
        {/if}

        <!-- Một khối gập cho CẢ độ thành thạo lẫn thống kê thư viện: nhóm Thư viện
             từ đó chỉ còn hai nút và một dòng mở rộng. -->
        <button
          type="button"
          class="advanced-toggle"
          aria-expanded={showLibraryDetails}
          aria-controls="settings-library-detail"
          onclick={() => (showLibraryDetails = !showLibraryDetails)}
        >
          <span>{showLibraryDetails ? 'Ẩn chi tiết thư viện' : 'Chi tiết thư viện'}</span>
          <span class="advanced-tail" class:open={showLibraryDetails} aria-hidden="true">
            <Icon name="chevron" size={16} width={2.2} />
          </span>
        </button>
        {#if showLibraryDetails}
          <div class="library-detail" id="settings-library-detail">
            <p class="muted tnum lib-line">
              {total} thẻ · {seenTotal} đã học · {stats?.learning ?? 0} đang học · {mastered} thành thạo
            </p>
            <div
              class="progress"
              role="progressbar"
              aria-label="Độ thành thạo trung bình của thư viện"
              aria-valuenow={masteryPercent}
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <i style="width: {masteryPercent}%"></i>
            </div>
            <p class="muted tnum gauge-hint">
              {masteryPercent}% độ thành thạo trung bình · {mastered}/{total} thẻ đạt ngưỡng
            </p>
          </div>
        {/if}
      </div>
    </div>
  </section>

  <!-- ── Cập nhật ───────────────────────────────────────────────────────────
       Hai loại cập nhật có đường đi khác nhau nên đứng thành hai khối riêng,
       không phải hai tab: cả hai trạng thái đều đọc được cùng lúc, mỗi loại có
       phiên bản và hành động riêng. -->
  <section class="group rise" style="--rise-delay: 90ms" aria-labelledby="settings-updates">
    <h2 class="group-title" id="settings-updates">Cập nhật</h2>
    <div class="panel">
      <div class="update-block">
        <div class="update-head">
          <h3>Ứng dụng</h3>
          {#if appUpdate.available}
            <span class="chip">
              <Icon name="sparkle" size={13} />
              Có bản mới
            </span>
          {/if}
        </div>
        <p class="setting-hint">Giao diện và lõi xử lý; cần tải lại trang.</p>
        <p class="update-status tnum" role="status">{appStatus}</p>

        {#if appUpdate.error !== null}
          <p class="notice notice-danger" role="alert">
            Không kích hoạt được bản mới: {appUpdate.error}. Thử lại hoặc tải lại trang.
          </p>
        {/if}
        {#if appNotice !== null}
          <p class="notice" role="status" in:fly={noticeFly()}>{appNotice}</p>
        {/if}

        <div class="actions">
          <button
            type="button"
            class="btn btn-inline"
            disabled={appBusy || appUpdate.applying}
            onclick={() => void runCheckBuild()}
          >
            <Icon name="refresh" size={17} />
            {appBusy ? 'Đang kiểm tra…' : 'Kiểm tra bản mới'}
          </button>
          {#if appUpdate.available}
            <button
              type="button"
              class="btn btn-primary btn-inline"
              disabled={appUpdate.applying}
              onclick={() => void applyAppUpdate()}
            >
              <Icon name="download" size={17} />
              {appUpdate.applying ? 'Đang cập nhật…' : 'Cập nhật và tải lại'}
            </button>
          {/if}
        </div>
      </div>

      <div class="update-block">
        <div class="update-head">
          <h3>Nội dung học</h3>
        </div>
        <p class="setting-hint">Dữ liệu thẻ học; không cần tải lại, không mất tiến độ.</p>
        <p class="update-status tnum">
          Đang dùng {contentVersion} · {bundleCount} gói thẻ.
        </p>

        {#if contentResult !== null && contentResult.status === 'staged'}
          <!--
            Bước xem trước: bản mới đã tải, xác minh và đệm nhưng CHƯA kích hoạt.
            Con số ở đây do chính `content_reconcile` tính trên bản đã đệm, nên nó
            là thay đổi thật sẽ xảy ra khi bấm Kích hoạt — không phải ước lượng.
          -->
          <div class="content-preview" role="status" in:fly={noticeFly()}>
            <p class="notice notice-preview">
              Bản {contentResult.from ?? 'đầu tiên'} → <strong>{contentResult.to}</strong> đã tải và
              xác minh toàn vẹn, đang chờ kích hoạt.
            </p>
            <ul class="preview-counts tnum">
              <li>
                <strong>{contentResult.preview.updated}</strong>
                thẻ cập nhật
              </li>
              <li>
                <strong>{contentResult.preview.added}</strong>
                thẻ mới
              </li>
              <li>
                <strong>{contentResult.preview.orphaned}</strong>
                thẻ bị bỏ
              </li>
            </ul>

            {#if previewTotal > 0}
              <button
                type="button"
                class="preview-toggle"
                aria-expanded={showPreviewDetails}
                aria-controls="content-preview-detail"
                onclick={() => (showPreviewDetails = !showPreviewDetails)}
              >
                <span>
                  {showPreviewDetails ? 'Ẩn chi tiết thẻ' : `Xem chi tiết ${previewTotal} thẻ`}
                </span>
                <span class="preview-tail" class:open={showPreviewDetails} aria-hidden="true">
                  <Icon name="chevron" size={16} width={2.2} />
                </span>
              </button>
              {#if showPreviewDetails}
                <div class="preview-detail" id="content-preview-detail">
                  {#each previewGroups(contentResult.preview) as group (group.key)}
                    {#if group.cards.length > 0}
                      <section class="preview-group">
                        <h4 class="preview-title">
                          {group.title}
                          <span class="tnum">({group.cards.length})</span>
                        </h4>
                        <p class="preview-note">{group.note}</p>
                        <ul class="preview-list">
                          {#each group.cards as card (card.id)}
                            <li>
                              <span class="preview-front">{card.front}</span>
                              <span class="preview-back">{card.back}</span>
                            </li>
                          {/each}
                        </ul>
                      </section>
                    {/if}
                  {/each}
                </div>
              {/if}
            {/if}

            <p class="setting-hint">
              Tải mới {contentResult.downloaded.length} gói, dùng lại {contentResult.reused.length}
              gói. Kích hoạt sẽ đổi nội dung trong một giao dịch: thẻ cũ giữ nguyên lịch ôn, thẻ
              mới được tạo, thẻ bị bỏ chỉ được đánh dấu và <strong>không bị xoá</strong>.
            </p>
            <div class="actions">
              <button
                type="button"
                class="btn btn-primary btn-inline"
                disabled={contentBusy}
                onclick={() => void runActivate()}
              >
                <Icon name="check" size={17} />
                {contentAction === 'activate' ? 'Đang kích hoạt…' : 'Kích hoạt'}
              </button>
              <button
                type="button"
                class="btn btn-inline"
                disabled={contentBusy}
                onclick={() => void runDiscard()}
              >
                <Icon name="close" size={17} />
                {contentAction === 'discard' ? 'Đang bỏ…' : 'Bỏ qua'}
              </button>
            </div>
          </div>
        {:else if contentResult !== null}
          <p
            class="notice"
            class:notice-danger={contentResult.status === 'failed'}
            role="status"
            in:fly={noticeFly()}
          >
            {#if contentResult.status === 'up-to-date'}
              Đang là bản mới nhất ({contentResult.contentVersion}).
            {:else if contentResult.status === 'offline'}
              Không có mạng. Vẫn dùng nội dung đang có trên thiết bị.
            {:else}
              Thất bại: {contentResult.message}
            {/if}
          </p>
        {/if}

        {#if app.contentSyncError !== null}
          <p class="notice notice-danger" role="alert">
            Đồng bộ thư viện chưa hoàn tất. Thẻ và tiến độ hiện có vẫn được giữ.
            {app.contentSyncError}
          </p>
          <div class="actions">
            <button
              type="button"
              class="btn btn-inline"
              disabled={contentBusy}
              onclick={() => void runRetrySync()}
            >
              <Icon name="refresh" size={17} />
              {contentAction === 'sync' ? 'Đang đồng bộ…' : 'Thử đồng bộ lại'}
            </button>
          </div>
        {/if}

        {#if contentNotice !== null}
          <p
            class="notice"
            class:notice-ok={contentNotice.ok}
            class:notice-danger={!contentNotice.ok}
            role={contentNotice.ok ? 'status' : 'alert'}
            in:fly={noticeFly()}
          >
            {contentNotice.text}
          </p>
        {/if}

        <div class="actions">
          <button
            type="button"
            class="btn btn-primary btn-inline"
            disabled={contentBusy}
            onclick={() => void runContentUpdate()}
          >
            <Icon name="layers" size={17} />
            {contentAction === 'check' ? 'Đang kiểm tra…' : 'Kiểm tra cập nhật nội dung'}
          </button>
        </div>

        <!-- Tuỳ chọn ít dùng: gập lại để không tranh chỗ với hành động chính. -->
        <button
          type="button"
          class="advanced-toggle"
          aria-expanded={showAdvanced}
          aria-controls="content-advanced"
          onclick={() => (showAdvanced = !showAdvanced)}
        >
          <span>{showAdvanced ? 'Ẩn tuỳ chọn khác' : 'Tuỳ chọn khác'}</span>
          <span class="advanced-tail" class:open={showAdvanced} aria-hidden="true">
            <Icon name="chevron" size={16} width={2.2} />
          </span>
        </button>
        {#if showAdvanced}
          <div class="advanced-body" id="content-advanced">
            <p class="setting-hint">
              Quay lại bản nội dung trước nếu bản mới có lỗi, hoặc cài lại nội dung đi
              kèm bản dựng. Cả hai đều không xoá thẻ hay tiến độ.
            </p>
            <div class="actions">
              <button
                type="button"
                class="btn btn-inline"
                disabled={contentBusy}
                onclick={() => void runRollback()}
              >
                <Icon name="refresh" size={17} />
                {contentAction === 'rollback' ? 'Đang quay lại…' : 'Quay lại bản trước'}
              </button>
              <button
                type="button"
                class="btn btn-inline"
                disabled={contentBusy}
                onclick={() => void runReinstallSeed()}
              >
                <Icon name="download" size={17} />
                {contentAction === 'reinstall' ? 'Đang cài lại…' : 'Cài lại nội dung đi kèm'}
              </button>
            </div>
            {#if app.contentSync?.skipped === false}
              <p class="setting-hint tnum">
                Lần đồng bộ gần nhất: cập nhật {app.contentSync.updated} thẻ, thêm
                {app.contentSync.added} thẻ, {app.contentSync.orphaned} thẻ không còn trong
                nội dung (vẫn được giữ).
              </p>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </section>

  <!-- ── Thông tin ứng dụng ─────────────────────────────────────────────────
       Thông tin chẩn đoán, không phải thiết lập. Dùng CÙNG khuôn gập với nhóm Thư
       viện — một hàng mở rộng trong bề mặt nhóm, nội dung gập mở bằng `{#if}` nên
       không nằm trong DOM. Phiên bản ứng dụng vẫn nằm ngay trên hàng đó, để vẫn
       đọc được khi cần báo lỗi mà không phải mở ra. -->
  <section class="group rise" style="--rise-delay: 135ms" aria-labelledby="settings-about">
    <h2 class="group-title" id="settings-about">Thông tin ứng dụng</h2>
    <div class="panel">
      <div class="about-body">
        <button
          type="button"
          class="advanced-toggle"
          aria-expanded={showAppInfo}
          aria-controls="settings-about-detail"
          onclick={() => (showAppInfo = !showAppInfo)}
        >
          <span>{showAppInfo ? 'Ẩn chi tiết kỹ thuật' : 'Chi tiết kỹ thuật'}</span>
          <span class="about-meta">
            <span class="tnum">{APP_VERSION}</span>
            <span class="advanced-tail" class:open={showAppInfo} aria-hidden="true">
              <Icon name="chevron" size={16} width={2.2} />
            </span>
          </span>
        </button>
        {#if showAppInfo}
          <dl class="facts" id="settings-about-detail">
            <div>
              <dt>Phiên bản ứng dụng</dt>
              <dd class="tnum">{APP_VERSION}</dd>
            </div>
            <div>
              <dt>Lõi xử lý (Rust/WASM)</dt>
              <dd class="tnum">{app.coreVersion || '—'}</dd>
            </div>
            <div>
              <dt>Nội dung học</dt>
              <dd class="tnum">{contentVersion}</dd>
            </div>
            <div>
              <dt>Số thẻ trong thư viện</dt>
              <dd class="tnum">{app.cards.length}</dd>
            </div>
          </dl>
        {/if}
      </div>
    </div>
  </section>

  <!-- ── Quản lý dữ liệu ────────────────────────────────────────────────────
       Thao tác không hoàn tác được nên tách hẳn khỏi các thiết lập phía trên:
       bề mặt riêng, sắc cảnh báo, bước xác nhận tại chỗ và mô tả đúng phạm vi. -->
  <section class="group rise" style="--rise-delay: 180ms" aria-labelledby="settings-data">
    <h2 class="group-title" id="settings-data">Quản lý dữ liệu</h2>
    <div class="panel danger-panel">
      <div class="danger-head">
        <span class="danger-icon" aria-hidden="true"><Icon name="alert" size={18} /></span>
        <div>
          <h3>Xoá thư viện trên thiết bị</h3>
          <p class="setting-hint">Không thể hoàn tác. Chỉ áp dụng cho thiết bị này.</p>
        </div>
      </div>

      <dl class="impact">
        <div>
          <dt>Bị xoá</dt>
          <dd>Toàn bộ thẻ (kể cả thẻ tự tạo hoặc đã nhập), lịch ôn và phiên học đang dở.</dd>
        </div>
        <div>
          <dt>Được giữ</dt>
          <dd>Cài đặt giao diện và bản ghi hỏng đã cách ly. Thư viện sau khi xoá là trống.</dd>
        </div>
      </dl>

      {#if eraseNotice !== null}
        <p
          class="notice"
          class:notice-ok={eraseNotice.ok}
          class:notice-danger={!eraseNotice.ok}
          role={eraseNotice.ok ? 'status' : 'alert'}
          in:fly={noticeFly()}
        >
          {eraseNotice.text}
        </p>
      {/if}

      {#if confirmingErase}
        <div class="confirm" role="group" aria-label="Xác nhận xoá dữ liệu">
          <p class="confirm-title" role="status">
            Xoá {app.cards.length} thẻ và toàn bộ tiến độ? Không thể hoàn tác.
          </p>
          <div class="actions">
            <button
              type="button"
              class="btn btn-danger btn-inline"
              disabled={erasing}
              onclick={() => void confirmErase()}
            >
              <Icon name="trash" size={17} />
              {erasing ? 'Đang xoá…' : 'Xác nhận xoá'}
            </button>
            <button
              type="button"
              class="btn"
              disabled={erasing}
              onclick={() => (confirmingErase = false)}
            >
              Huỷ
            </button>
          </div>
        </div>
      {:else}
        <div class="actions">
          <button
            type="button"
            class="btn btn-danger btn-inline"
            disabled={erasing || app.cards.length === 0}
            onclick={() => {
              eraseNotice = null;
              confirmingErase = true;
            }}
          >
            <Icon name="trash" size={17} />
            {app.cards.length === 0 ? 'Thư viện đang trống' : 'Xoá thư viện…'}
          </button>
        </div>
      {/if}
    </div>
  </section>
</main>

<style>
  /* ── Nhịp của màn hình ──────────────────────────────────────────────────
     Khoảng cách giữa các NHÓM lớn hơn khoảng cách trong một nhóm, nên mắt đọc
     được ranh giới nhóm mà không cần thêm đường kẻ hay tiêu đề có badge. */
  .settings-screen {
    gap: 14px;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .group-title {
    margin: 0 0 0 2px;
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  /* Bề mặt phẳng, không đổ bóng: đây là danh sách, không phải thẻ nổi. Chỉ nhóm
     Cập nhật và Công cụ còn dùng bề mặt; không lặp lại ở mọi khối. */
  .panel {
    background: var(--surface-container);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  /* ── Hàng cài đặt ─────────────────────────────────────────────────────── */
  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 12px 16px;
    min-height: 52px;
  }

  .setting-row + .setting-row {
    border-top: 1px solid var(--border);
  }

  .setting-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .setting-label {
    font-size: 0.92rem;
    font-weight: 650;
  }

  .setting-hint {
    margin: 0;
    color: var(--muted);
    font-size: 0.78rem;
    line-height: 1.45;
    text-wrap: pretty;
  }

  .theme-row {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  /* Ba chế độ giao diện dùng chung thanh Liquid Glass; trạng thái vẫn là aria-pressed. */
  :global(.liquid-tabs--segmented.segmented) {
    --tab-count: 3;
    min-width: 0;
  }

  :global(.liquid-tabs--segmented.segmented > button) {
    min-height: 38px;
    padding: 6px;
    font-size: 0.8rem;
  }

  :global(.liquid-tabs--segmented.segmented > button[aria-pressed='true']) {
    color: var(--accent-strong);
  }

  .limit-row {
    flex-wrap: wrap;
  }

  .limit-field {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
  }

  .limit-field input {
    width: 82px;
    padding: 9px 10px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    text-align: right;
    transition:
      border-color var(--dur-2) var(--ease-out),
      box-shadow var(--dur-2) var(--ease-out);
  }

  .limit-field input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .limit-unit {
    color: var(--muted);
    font-size: 0.78rem;
  }

  .row-error,
  .row-note {
    flex-basis: 100%;
    margin: 0;
    font-size: 0.76rem;
  }

  .row-error {
    color: var(--danger);
  }

  .row-note {
    color: var(--muted);
  }

  .toggle-row {
    cursor: pointer;
    user-select: none;
  }

  .toggle-row .switch {
    flex: 0 0 auto;
  }

  /* ── Thư viện ─────────────────────────────────────────────────────────── */
  .library-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
  }

  .lib-line {
    margin: 0;
    font-size: 0.86rem;
  }

  .gauge-hint {
    margin: 0;
    font-size: 0.74rem;
  }

  .library-body .notice {
    margin: 0;
  }

  /* Khối gập chỉ chứa chữ và một thanh tiến độ — không có nút nào bị ẩn. */
  .library-detail {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* ── Cập nhật ─────────────────────────────────────────────────────────── */
  .update-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
  }

  .update-block + .update-block {
    border-top: 1px solid var(--border);
  }

  .update-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .update-head h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
  }

  .update-status {
    margin: 0;
    font-size: 0.82rem;
    color: var(--text);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
    padding: 3px 8px;
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--ok);
    font-size: 0.72rem;
    font-weight: 700;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 2px;
  }

  .actions .btn {
    padding: 10px 14px;
    border-radius: 13px;
    font-size: 0.86rem;
  }

  .update-block .notice {
    margin: 0;
  }

  /* Bước xem trước nằm TRONG luồng sao cho ba con số là thứ đập vào mắt trước,
     rồi mới tới nút Kích hoạt — quyết định dựa trên số liệu, không dựa vào thói
     quen bấm nút. */
  .content-preview {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid color-mix(in srgb, var(--accent) 32%, var(--border));
    border-radius: var(--radius);
    background: var(--accent-soft);
  }

  .content-preview .notice,
  .content-preview .setting-hint {
    margin: 0;
  }

  .notice-preview {
    border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
    background: var(--surface);
    color: var(--text);
  }

  .preview-counts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.84rem;
  }

  .preview-counts li {
    display: flex;
    align-items: baseline;
    gap: 5px;
  }

  .preview-counts strong {
    font-size: 1.1rem;
    font-weight: 750;
  }

  /* Danh sách chi tiết: mặc định gập, cùng lý do với "Tuỳ chọn khác" — nội dung
     gập không nằm trong DOM, nên lần cập nhật vài trăm thẻ không dựng vài trăm
     dòng vô hình. */
  .preview-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    min-height: 36px;
    padding: 6px 0 0;
    border: 0;
    border-top: 1px dashed color-mix(in srgb, var(--accent) 30%, var(--border));
    background: transparent;
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 650;
    text-align: left;
  }

  .preview-tail {
    display: grid;
    place-items: center;
    transition: transform var(--dur-2) var(--ease-out);
  }

  .preview-tail.open {
    transform: rotate(180deg);
  }

  .preview-detail {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 300px;
    overflow-y: auto;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .preview-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .preview-title {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin: 0;
    font-size: 0.82rem;
    font-weight: 700;
  }

  .preview-note {
    margin: 0;
    color: var(--muted);
    font-size: 0.76rem;
  }

  .preview-list {
    display: flex;
    flex-direction: column;
    margin: 2px 0 0;
    padding: 0;
    list-style: none;
  }

  .preview-list li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding: 3px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    font-size: 0.82rem;
  }

  .preview-list li:last-child {
    border-bottom: 0;
  }

  .preview-back {
    flex: 0 0 auto;
    color: var(--muted);
    text-align: right;
  }

  /* ── Dòng gập dùng chung ───────────────────────────────────────────────
     MỌI nhóm gập nội dung phụ bằng ĐÚNG dòng này: cao 52px bằng đúng hàng cài đặt
     (`.setting-row`), cùng cỡ chữ, cùng mũi chevron, và mở bằng `{#if}` nên nội
     dung gập không nằm trong DOM. Đệm ngang để TRỐNG: bề ngang do khối chứa quyết
     định (`padding: …16px`), nhờ vậy dòng không bị thụt vào 32px khi nằm trong một
     khối đã có đệm. Đường kẻ nét đứt ở trên là ranh giới với nội dung chính —
     nhóm nào đặt dòng này ở đầu bề mặt thì bỏ đường kẻ đó (xem `.about-body`). */
  .advanced-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    min-height: 52px;
    margin: 0;
    padding: 12px 0;
    border: 0;
    border-top: 1px dashed var(--border);
    background: transparent;
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 650;
    text-align: left;
  }

  .advanced-toggle[aria-expanded='true'] {
    color: var(--text);
  }

  .advanced-tail {
    display: grid;
    place-items: center;
    transition: transform var(--dur-2) var(--ease-out);
  }

  .advanced-tail.open {
    transform: rotate(180deg);
  }

  .advanced-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 2px 0 2px;
  }

  /* ── Thông tin ứng dụng ───────────────────────────────────────────────── */
  .about-body {
    display: flex;
    flex-direction: column;
    padding: 0 16px;
  }

  /* Dòng gập đứng đầu bề mặt nên không có gì phía trên để phân cách. */
  .about-body .advanced-toggle {
    border-top: 0;
  }

  .about-meta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 0.8rem;
  }

  /* Đệm ngang để trống cho khớp với `.about-body`; nhờ vậy đường kẻ phân cách
     cũng thụt vào đúng 16px như các nhóm khác. */
  .facts {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px 16px;
    margin: 0;
    padding: 12px 0 14px;
    border-top: 1px solid var(--border);
  }

  .facts dt {
    color: var(--muted);
    font-size: 0.8rem;
  }

  .facts dd {
    margin: 0;
    text-align: right;
    font-size: 0.84rem;
    font-weight: 600;
  }

  /* ── Quản lý dữ liệu ─────────────────────────────────────────────────── */
  .danger-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    border-color: color-mix(in srgb, var(--danger) 30%, var(--border));
    background: color-mix(in srgb, var(--danger-soft) 45%, var(--surface));
  }

  .danger-head {
    display: flex;
    gap: 10px;
  }

  .danger-head h3 {
    margin: 0 0 2px;
    font-size: 0.95rem;
    font-weight: 700;
  }

  .danger-icon {
    flex: 0 0 auto;
    margin-top: 1px;
    color: var(--danger);
  }

  .impact {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
  }

  .impact > div {
    display: flex;
    gap: 8px;
    font-size: 0.78rem;
    line-height: 1.45;
  }

  .impact dt {
    flex: 0 0 58px;
    color: var(--muted);
    font-weight: 650;
  }

  .impact dd {
    margin: 0;
  }

  .confirm {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--danger) 35%, var(--border));
    border-radius: var(--radius);
    background: var(--surface);
  }

  .confirm-title {
    margin: 0;
    font-size: 0.86rem;
    font-weight: 650;
  }

  .danger-panel .notice {
    margin: 0;
  }

  /* ── Hover chỉ trên thiết bị có con trỏ ───────────────────────────────── */
  @media (hover: hover) {
    :global(.liquid-tabs--segmented.segmented > button:hover:not([aria-pressed='true']):not(:disabled)) {
      color: var(--text);
    }

    .advanced-toggle:hover {
      color: var(--text);
    }
  }

  /* ── Màn rộng: vẫn một cột, nhưng hàng giao diện không cần xếp dọc ───── */
  @media (min-width: 720px) {
    .theme-row {
      flex-direction: row;
      align-items: center;
    }

    .theme-row .setting-copy {
      flex: 1;
    }

    .theme-row :global(.liquid-tabs--segmented.segmented) {
      flex: 0 0 300px;
      width: 300px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .advanced-tail,
    .preview-tail {
      transition: none;
    }
  }
</style>
