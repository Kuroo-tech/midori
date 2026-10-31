/**
 * Trạng thái ứng dụng.
 *
 * Đây là lớp **điều phối**: nó biết thứ tự các bước, nhưng không tự làm việc
 * nghiệp vụ (thuộc lõi Rust), không tự đọc/ghi IndexedDB (thuộc `src/storage`),
 * và không tự tải mạng (thuộc `src/content`). Nhờ vậy mỗi lớp vẫn kiểm thử được
 * riêng.
 *
 * Dùng lớp có `$state` thay vì biến rời vì Svelte 5 chỉ giữ tính phản ứng khi
 * trạng thái được truy cập qua thuộc tính của đối tượng.
 */

import {
  cardApplyDraft,
  cardMake,
  cardMarkAttempt,
  cardsNormalize,
  contentReconcile,
  deckExport,
  deckParse,
  deckPlanImport,
  deckStats,
  loadCore,
  sessionRestore,
  srsSchedule,
  type Card,
  type CardDraft,
  type DeckStats,
  type ExportFormat,
  type Quiz,
  type Rating,
} from '../core/index.ts';
import {
  createBackup,
  parseBackup,
  validateAndCommitBackup,
  type ParsedBackup,
} from '../storage/backup.ts';
import { mergeCardDraft } from './card-edit.ts';
import { normalizeCollectionScope, type CollectionScope } from './collection.ts';
import { backFallback, navEntry, readNavEntry } from './navigation.ts';
import { type Screen } from './screen.ts';
import type { SessionRequest } from './session-plan.ts';
import { createContentService } from '../content/service.ts';
import { previewReconciliation, reconcilePublishedContent } from '../content/reconciliation.ts';
import type { ActiveContent, ContentPreview, StageOutcome } from '../content/types.ts';
import { todayStamp } from '../platform/crypto.ts';
import { saveTextFile } from '../platform/download.ts';
import {
  clearCards,
  commitContentReconciliation,
  loadCards,
  loadRecoveryRecords,
  putCard,
  putCards,
  replaceUserLibrary,
} from '../storage/cards.ts';
import {
  clearSession,
  loadCollectionScope,
  loadScreen,
  loadSession,
  persistScreenSafely,
  persistSessionSafely,
  saveCollectionScope,
  type PersistedSession,
  type StudyFocus,
  type StudyMode,
} from '../storage/session.ts';
import {
  loadContentSync,
  loadSettings,
  saveContentSync,
  saveSettings,
  type AppSettings,
} from '../storage/settings.ts';
import { META_KEYS } from '../storage/db.ts';
import { initAppUpdates } from '../pwa/updates.ts';

/** Màn hình của ứng dụng (điều hướng đơn giản, không dùng router). */
export type { Screen };

/**
 * Chiều của lần chuyển màn hình gần nhất.
 *
 * `'forward'` là đi tới (bấm tab dưới, mở màn con), `'back'` là quay lại (nút Back,
 * cử chỉ Back của hệ điều hành). Lớp giao diện dùng giá trị này để chọn hướng trượt
 * của màn hình — chuyển động khớp với thao tác, thay vì luôn cùng một hướng.
 */
export type NavDirection = 'forward' | 'back';

/**
 * Phiên học đã sẵn sàng để dựng giao diện.
 *
 * `queue` chứa **thẻ thật** đã tra lại từ thư viện hiện tại, không phải bản sao
 * trong bản lưu — nên nội dung thẻ luôn là bản mới nhất.
 */
export interface RestoredSession {
  deckId: string;
  lesson?: number;
  mode: StudyMode;
  focus: StudyFocus;
  queue: Card[];
  index: number;
  revealed: boolean;
  rated: number;
  mistakes: number;
  /** Số thẻ trong bản lưu không còn trong thư viện. */
  dropped: number;
}

/** Kết quả kiểm tra một file backup trước khi khôi phục — chưa ghi gì. */
export interface BackupInspection {
  /** Số thẻ có trong file. */
  cards: number;
  /** Số thẻ đọc và chuẩn hoá được. */
  usableCards: number;
  /** Số thẻ không chuẩn hoá được — khác 0 nghĩa là khôi phục sẽ bị từ chối. */
  invalidCards: number;
  /** File có kèm lịch ôn tập / phiên học hay không. */
  includeProgress: boolean;
  /** Thời điểm tạo bản sao lưu (ms kể từ epoch). */
  createdAt: number;
  /** Bản sao lưu có phiên học nhưng đã quá hạn lưu. */
  sessionExpired: boolean;
  /** Bản sao lưu có mang phiên học đang dở. */
  hasSession: boolean;
}

/** Kết quả một lần đồng bộ nội dung vào thư viện. */
export interface SyncSummary {
  contentVersion: string;
  updated: number;
  added: number;
  orphaned: number;
  skipped: boolean;
}

/**
 * Kết quả bước tải + đệm: chưa kích hoạt, kèm con số xem trước.
 *
 * `preview` được tính bằng `content_reconcile` trên bản vừa đệm, nên đúng bằng
 * thay đổi sẽ xảy ra khi bấm Kích hoạt.
 */
export type ContentStageResult =
  | (Extract<StageOutcome, { status: 'staged' }> & { preview: ContentPreview })
  | Exclude<StageOutcome, { status: 'staged' }>;

/** Kết quả bước kích hoạt bản đã đệm. */
export type ContentActivationResult =
  | { status: 'activated'; contentVersion: string; sync: SyncSummary }
  /** Không còn gì trong vùng đệm — có thể đã kích hoạt hoặc đã bỏ trước đó. */
  | { status: 'nothing-staged' }
  /** Nội dung đã kích hoạt nhưng thư viện chưa đồng bộ; có thể thử lại. */
  | { status: 'sync-failed'; contentVersion: string; message: string }
  /** Kích hoạt thất bại — nội dung đang dùng vẫn nguyên vẹn. */
  | { status: 'failed'; message: string };

class AppStore {
  /** WASM đã nạp, thư viện đã đọc, nội dung đã sẵn sàng. */
  ready = $state(false);
  /** Lỗi chặn khởi động — hiển thị nguyên nhân thay vì màn hình trắng. */
  bootError = $state<string | null>(null);
  /** Bước đang chạy trong lúc khởi động, để hiển thị tiến độ. */
  bootStep = $state('Đang khởi động…');

  // Các trường dưới đây dùng `$state.raw` chứ KHÔNG dùng `$state`, vì hai lý do:
  //
  // 1. `$state` bọc sâu mọi đối tượng được gán vào thành Proxy. Proxy KHÔNG
  //    truyền được qua `structured clone`, nên ghi một mảng đã bị bọc vào
  //    IndexedDB sẽ ném `DataCloneError` (đã gặp thật khi chạy ứng dụng).
  // 2. Những giá trị này luôn được THAY CẢ KHỐI, không bao giờ sửa từng phần tử,
  //    nên bọc sâu chỉ tốn kém mà không đem lại lợi ích.
  cards = $state.raw<Card[]>([]);
  settings = $state.raw<AppSettings>({
    theme: 'auto',
    dailyNewLimit: 20,
    shuffleByDefault: false,
  });
  stats = $state.raw<DeckStats | null>(null);
  /** Bản ghi không đọc nổi trong thư viện, nếu có. */
  rejected = $state(0);
  recoveryCount = $state(0);

  content = $state.raw<ActiveContent | null>(null);
  contentSync = $state.raw<SyncSummary | null>(null);
  contentSyncError = $state<string | null>(null);
  backupRestoreNotice = $state<string | null>(null);
  screenPersistenceError = $state<string | null>(null);
  screen = $state<Screen>('home');
  /** Chiều của lần chuyển màn hình gần nhất — xem {@link NavDirection}. */
  navDirection = $state<NavDirection>('forward');

  /** Phiên bản lõi do WASM khai báo, hiển thị ở Cài đặt. */
  coreVersion = $state('');

  /**
   * Cổng để lớp giao diện cắm bộ nạp màn hình vào bước khởi động.
   *
   * Màn hình được nạp theo nhu cầu (`src/ui/screens.ts`), nên phải nạp xong màn
   * hình ĐẦU TIÊN trước khi `ready` bật lên — nếu không, khung đầu tiên sẽ trống.
   *
   * Vì sao là cổng chứ không phải `import` trực tiếp: lớp điều phối này không được
   * biết tới component Svelte (xem ghi chú đầu file). `main.ts` — điểm vào, nơi
   * duy nhất được phép biết cả hai lớp — cắm hàm thật vào. Mặc định là hàm rỗng để
   * lớp này vẫn dùng được trong kiểm thử mà không cần trình duyệt.
   */
  screenLoader: (screen: Screen) => Promise<unknown> = async () => {};

  /**
   * Nạp trước các màn hình khác, theo thứ tự ưu tiên. Tiêm từ `main.ts`.
   *
   * Lỗi ở đây không được làm hỏng gì: đây là tối ưu, không phải chức năng.
   */
  screenPrefetcher: (current: Screen) => Promise<void> = async () => {};

  #service = createContentService();
  #screenSaveSequence = 0;

  // ── History ─────────────────────────────────────────────────────────────
  //
  // Điều hướng phải đi qua History API, nếu không nút Back của Android (và cử
  // chỉ Back) sẽ thoát ứng dụng thay vì quay lại màn hình trước. `#historyDepth`
  // đếm số entry do ứng dụng tự đẩy, để phân biệt "còn gì phía sau" với "đây là
  // entry đầu tiên" — cần thiết vì History API không cho biết điều đó.
  #historyReady = false;
  #historyDepth = 0;
  // ── Khởi động ───────────────────────────────────────────────────────────

  async boot(): Promise<void> {
    try {
      // Đọc cài đặt SONG SONG với nạp WASM: hai việc độc lập nhau, mà biên dịch
      // và khởi tạo WebAssembly là bước tốn thời gian nhất của lần chạy đầu.
      // Trước đây chúng chạy nối tiếp nên thời gian khởi động bằng TỔNG hai bước.
      const corePending = loadCore();
      // Nếu bước sau ném lỗi, lời hứa này không được await nữa. Gắn một handler
      // rỗng để lỗi WASM không nổi lên thành "unhandled rejection" che mất lỗi
      // thật; `await corePending` ở dưới vẫn nhận đúng lỗi đó.
      void corePending.catch(() => {});
      const settingsPending = loadSettings();

      this.bootStep = 'Đang đọc cài đặt…';
      this.settings = await settingsPending;
      applyTheme(this.settings.theme);

      this.bootStep = 'Đang nạp lõi xử lý…';
      const core = await corePending;
      this.coreVersion = String(JSON.parse(core.version()).data ?? '');

      // Màn hình đang mở cũng được khôi phục: nếu trang vừa bị tải lại vì cập
      // nhật ứng dụng, người dùng phải quay về đúng chỗ đang làm dở.
      this.screen = (await loadScreen()) ?? this.screen;
      this.#initHistory();

      // Gói JavaScript của màn hình đầu tiên phải có TRƯỚC khi giao diện hiện ra.
      // Nạp song song với phần còn lại của khởi động (thư viện, nội dung) thay vì
      // nối tiếp, để việc tách gói không làm chậm thêm bước nào.
      const screenPending = this.screenLoader(this.screen);
      void screenPending.catch(() => {});

      this.bootStep = 'Đang đọc thư viện…';
      const library = await loadCards();
      this.cards = library.cards;
      this.rejected = library.rejected.length;
      this.recoveryCount = (await loadRecoveryRecords()).length;

      this.bootStep = 'Đang chuẩn bị nội dung…';
      this.content = await this.#service.ensureActive();
      try {
        this.contentSync = await this.#syncContent(this.content);
      } catch (cause) {
        this.contentSyncError = describe(cause);
        console.warn('Nội dung đã sẵn sàng nhưng thư viện chưa đồng bộ; sẽ thử lại:', cause);
      }

      await this.refreshStats();
      // Phạm vi Collection và phiên đang dở được đọc ngay tại đây: màn Trang chủ
      // và màn Học dựng thẻ "Tiếp tục" từ `openSession`, và việc khôi phục phải
      // xong trước khi giao diện hiện ra — nếu không, hai màn đó sẽ nháy trạng
      // thái "không có phiên nào" rồi đổi ngay sau đó.
      this.collectionScope = (await loadCollectionScope()) ?? this.collectionScope;
      await this.restoreSession();
      // Chờ gói màn hình đầu tiên rồi mới bật `ready` — đây là điều giữ cho lần
      // dựng đầu tiên không có khung trắng khi màn hình đã bị tách gói.
      await screenPending;
      this.ready = true;

      // Không chặn giao diện: theo dõi cập nhật ứng dụng chạy nền.
      void initAppUpdates();
      // và nạp trước các màn hình còn lại, để lần chuyển tab sau không phải chờ.
      void this.screenPrefetcher(this.screen);
    } catch (cause) {
      this.bootError = describe(cause);
    }
  }

  // ── Điều hướng ──────────────────────────────────────────────────────────

  /**
   * Phạm vi nội dung của Collection đang mở.
   *
   * Đây là trạng thái ĐIỀU HƯỚNG, không phải trạng thái cục bộ của màn hình: nó
   * phải sống sót qua mỗi lần dựng lại component (Back từ phiên học về Collection
   * dựng lại cả cây màn hình), qua tải lại trang (được ghi xuống đĩa cạnh màn
   * hình đang mở), và là thứ duy nhất nói Collection đang quản lý nội dung nào.
   */
  collectionScope = $state.raw<CollectionScope>({ kind: 'all' });
  /** Lựa chọn cấu hình gần nhất trong Collection — để Back từ phiên về không mất. */
  collectionFocus = $state<StudyFocus>('due');
  collectionMode = $state<StudyMode>('flip');

  /**
   * Yêu cầu bắt đầu phiên học, do Collection đặt trước khi chuyển sang màn phiên.
   *
   * Chỉ có giá trị trong đúng một lần dựng màn phiên: màn phiên **tiêu thụ** nó
   * qua {@link takeRequestedSession}. Nhờ vậy lần Back/Forward của trình duyệt
   * sau đó không vô tình khởi động lại một phiên đã kết thúc.
   */
  requestedSession = $state.raw<SessionRequest | null>(null);

  go(screen: Screen): void {
    const changed = screen !== this.screen;
    // Chiều trượt ghi TRƯỚC khi đổi màn hình: lần dựng lại của cây màn hình đọc
    // giá trị này để chọn hướng, nên nó phải đúng ngay trong cùng một lượt cập nhật.
    if (changed) this.navDirection = 'forward';
    this.#setScreen(screen);
    // Chỉ đẩy một entry khi màn hình THỰC SỰ đổi: bấm lại tab đang mở không được
    // tạo ra một lần Back "rỗng".
    if (changed) {
      window.history.pushState(navEntry(screen), '');
      this.#historyDepth += 1;
    }
  }

  /**
   * Mở Collection cho một phạm vi nội dung.
   *
   * Mọi lối vào Collection đều đi qua đây — hàng bài Minna, hàng nhóm Kanji, hàng
   * chủ đề ở Trang chủ/màn Học, bộ do người học tạo — nên không có nơi nào phải
   * biết Collection nhận tham số thế nào. `focus`/`mode` là cấu hình GỢI Ý: nút
   * "Củng cố thẻ chưa thuộc" ở Trang chủ mở sẵn bộ lọc chưa thuộc, còn lối vào
   * thông thường mở với mặc định tới hạn + lật thẻ.
   */
  goCollection(
    scope: CollectionScope,
    options?: { focus?: StudyFocus; mode?: StudyMode },
  ): void {
    // Phiên ngẫu nhiên chỉ có nghĩa với phạm vi toàn thư viện — nó bốc từ cả ba
    // chủ đề, không thuộc một bộ nào. Gợi ý `random` cho phạm vi hẹp bị bỏ qua
    // thay vì tạo ra một lựa chọn không hợp lệ trong Collection.
    const focus =
      options?.focus === 'random' && scope.kind !== 'all' ? 'due' : (options?.focus ?? 'due');
    this.collectionScope = normalizeCollectionScope(scope) ?? { kind: 'all' };
    this.collectionFocus = focus;
    this.collectionMode = options?.mode ?? 'flip';
    this.#persistCollectionScope();
    this.go('collection');
  }

  /** Cập nhật cấu hình phiên trong Collection mà không đổi màn hình. */
  setCollectionOptions(options: { focus?: StudyFocus; mode?: StudyMode }): void {
    if (options.focus !== undefined) this.collectionFocus = options.focus;
    if (options.mode !== undefined) this.collectionMode = options.mode;
  }

  /** Bắt đầu một phiên học MỚI cho cấu hình đã chọn, rồi mở màn phiên. */
  startSession(request: SessionRequest): void {
    this.requestedSession = request;
    this.go('session');
  }

  /** Đọc và xoá yêu cầu bắt đầu phiên. `null` nghĩa là màn phiên phải tự khôi phục. */
  takeRequestedSession(): SessionRequest | null {
    const request = this.requestedSession;
    this.requestedSession = null;
    return request;
  }

  /**
   * Trở về màn hình trước — hành vi của nút Back và cử chỉ Back của hệ điều hành.
   *
   * Ưu tiên lịch sử thật khi còn entry phía sau. Khi không còn (ứng dụng vừa khôi
   * phục thẳng vào một màn hình con), quay về màn hình cha theo mô hình điều hướng
   * thay vì để nền tảng thoát ứng dụng một cách bất ngờ.
   */
  back(): void {
    if (this.#historyDepth > 0) {
      window.history.back();
      return;
    }
    const fallback = backFallback(this.screen);
    if (fallback !== null) this.#applyScreen(fallback);
  }

  /** Trở về Trang chủ một cách CHỦ ĐỘNG — khác hẳn Back, luôn đẩy một entry mới. */
  home(): void {
    this.go('home');
  }

  #initHistory(): void {
    if (this.#historyReady) return;
    this.#historyReady = true;
    // Entry đầu tiên được THAY thế, không đẩy: nếu đẩy, lần Back đầu tiên sẽ rời
    // ứng dụng ngay cả khi người dùng vừa mới vào một màn hình con.
    window.history.replaceState(navEntry(this.screen), '');
    window.addEventListener('popstate', this.#onPopState);
  }

  #onPopState = (event: PopStateEvent): void => {
    this.#historyDepth = Math.max(0, this.#historyDepth - 1);
    const entry = readNavEntry(event.state);
    if (entry !== null && entry.screen !== this.screen) this.#applyScreen(entry.screen);
  };

  /** Đổi màn hình như một lần LÙI: bỏ yêu cầu bắt đầu phiên còn sót lại. */
  #applyScreen(screen: Screen): void {
    this.navDirection = 'back';
    this.requestedSession = null;
    this.#setScreen(screen);
    // Giữ entry hiện tại khớp với màn hình đang hiện. Cần khi `back()` dùng đường
    // dự phòng (không có entry phía sau) hoặc khi một entry overlay được "tiêu"
    // thành màn hình: nếu không, lần đẩy kế tiếp sẽ lùi về một màn hình đã cũ.
    window.history.replaceState(navEntry(screen), '');
  }

  /** Đặt màn hình và ghi lựa chọn xuống đĩa, không đụng tới các yêu cầu đang chờ. */
  #setScreen(screen: Screen): void {
    this.screen = screen;
    this.screenPersistenceError = null;
    const sequence = ++this.#screenSaveSequence;
    // Ghi nền: chuyển màn hình không được phép chậm vì một lần ghi đĩa, nhưng
    // một lỗi cũng không được làm như thể lựa chọn đã được lưu.
    void persistScreenSafely(screen).then((result) => {
      if (sequence !== this.#screenSaveSequence || result.ok) return;
      this.screenPersistenceError =
        'Không lưu được màn hình đang mở. Nếu tải lại, Midori có thể trở về màn hình trước.';
      console.warn('Không lưu được màn hình đang mở vào IndexedDB:', result.error);
    });
  }

  /**
   * Ghi phạm vi Collection. Thất bại chỉ ghi log — khác màn hình, phạm vi hỏng
   * không đưa người dùng tới một chỗ sai, chỉ khiến lần tải lại sau quay về phạm
   * vi toàn thư viện, nên không đáng làm phiền bằng một thông báo.
   */
  #persistCollectionScope(): void {
    void saveCollectionScope(this.collectionScope).catch((cause: unknown) => {
      console.warn('Không lưu được phạm vi Collection vào IndexedDB:', cause);
    });
  }

  dismissScreenPersistenceError(): void {
    this.screenPersistenceError = null;
  }

  // ── Phiên học đang dở ───────────────────────────────────────────────────

  /**
   * Phiên đang dở đã đối chiếu với thư viện hiện tại, hoặc `null`.
   *
   * Được giữ ở lớp điều phối (không phải trong màn phiên) vì hai màn KHÁC cũng
   * cần biết có phiên đang dở: Trang chủ và màn Học hiện thẻ "Tiếp tục phiên" với
   * đúng tiến độ. Nhờ vậy thẻ đó chỉ đọc một nguồn, không tự mở IndexedDB.
   *
   * Cập nhật ở mọi đường làm phiên đổi: khôi phục lúc khởi động, ghi sau mỗi
   * thay đổi trong phiên, và xoá khi phiên kết thúc.
   */
  openSession = $state.raw<RestoredSession | null>(null);

  /**
   * Khôi phục phiên học đang dở, đối chiếu với thư viện **hiện tại**.
   *
   * Trả `null` khi không có phiên nào, bản lưu hỏng/quá cũ, hoặc không thẻ nào
   * trong bản lưu còn tồn tại. Mọi lỗi đọc đều được coi là "không có phiên":
   * đây là dữ liệu phụ, không được cản ứng dụng khởi động.
   */
  async restoreSession(): Promise<RestoredSession | null> {
    try {
      const saved = await loadSession();
      if (saved === null) {
        this.openSession = null;
        return null;
      }

      // Bước đối chiếu do lõi Rust làm: bỏ id đã biến mất và **tính lại vị trí**.
      const restored = await sessionRestore(
        { queue: saved.queue, index: saved.index },
        this.cards.map((card) => card.id),
      );
      if (restored.queue.length === 0) {
        await clearSession();
        this.openSession = null;
        return null;
      }

      const byId = new Map(this.cards.map((card) => [card.id, card]));
      const queue = restored.queue
        .map((id) => byId.get(id))
        .filter((card): card is Card => card !== undefined);
      if (queue.length === 0) {
        this.openSession = null;
        return null;
      }

      const result: RestoredSession = {
        deckId: saved.deckId,
        lesson: saved.lesson,
        mode: saved.mode,
        focus: saved.focus ?? 'due',
        queue,
        index: Math.min(restored.index, queue.length),
        revealed: saved.revealed,
        rated: saved.rated,
        mistakes: saved.mistakes,
        dropped: restored.dropped,
      };
      this.openSession = result;
      return result;
    } catch (cause) {
      console.warn('Không khôi phục được phiên học đã lưu:', cause);
      return null;
    }
  }

  /**
   * Ghi phiên đang dở. Lỗi ghi không được làm gián đoạn việc học.
   *
   * Bản tóm tắt trong bộ nhớ được cập nhật cùng lúc để thẻ "Tiếp tục phiên" trên
   * Trang chủ/màn Học luôn khớp với thứ vừa ghi xuống đĩa — không phải đọc lại
   * IndexedDB sau mỗi thẻ vừa chấm.
   */
  async persistSession(session: PersistedSession): Promise<boolean> {
    const saved = await persistSessionSafely(session);
    if (!saved) {
      console.warn('Không lưu được phiên học đang dở vào IndexedDB.');
      return false;
    }
    const byId = new Map(this.cards.map((card) => [card.id, card]));
    const queue = session.queue
      .map((id) => byId.get(id))
      .filter((card): card is Card => card !== undefined);
    this.openSession =
      queue.length === 0
        ? null
        : {
            deckId: session.deckId,
            lesson: session.lesson,
            mode: session.mode,
            focus: session.focus ?? 'due',
            queue,
            index: Math.min(session.index, queue.length),
            revealed: session.revealed,
            rated: session.rated,
            mistakes: session.mistakes,
            dropped: 0,
          };
    return true;
  }

  /** Xoá phiên đang dở — phiên đã kết thúc, hoặc người dùng bắt đầu phiên mới. */
  async discardSession(): Promise<void> {
    this.openSession = null;
    try {
      await clearSession();
    } catch (cause) {
      console.warn('Không xoá được bản lưu phiên học:', cause);
    }
  }

  // ── Học ─────────────────────────────────────────────────────────────────

  /**
   * Lấy bản **mới nhất** của một thẻ từ thư viện.
   *
   * Hàng đợi phiên học có thể đã cũ so với thư viện — ví dụ phiên được khôi phục
   * sau khi cập nhật nội dung, hoặc sau khi đồng bộ lại thư viện. Mọi thao tác GHI
   * phải đi qua hàm này, nếu không bản cũ trong hàng đợi sẽ đè lên nội dung mới
   * và người học mất phần nội dung vừa cập nhật.
   */
  liveCard(id: string): Card | null {
    return this.cards.find((existing) => existing.id === id) ?? null;
  }

  /** Chấm điểm một thẻ: chạy SM-2 trong lõi Rust rồi lưu lại. */
  async rate(card: Card, rating: Rating): Promise<Card> {
    const live = this.liveCard(card.id) ?? card;
    const updated: Card = { ...live, srs: await srsSchedule(live.srs, rating) };
    await this.saveCard(updated);
    return updated;
  }

  /**
   * Ghi dấu kết quả chế độ Tự trả lời, kèm điểm của lần trả lời.
   *
   * Chỉ đụng dấu vết học tập, KHÔNG đổi lịch SRS. Cũng đi qua {@link liveCard} vì
   * cùng lý do như {@link rate}.
   *
   * `score` mặc định suy từ `correct` để lời gọi cũ vẫn đúng nghĩa; đường học thật
   * truyền điểm mà lõi đã chấm (`AnswerCheck.score`), nhờ vậy "thiếu dấu" (0.9) và
   * "gần đúng" (0.5) không bị ghi thành 0 như trước.
   */
  async markQuiz(card: Card, correct: boolean, score?: number): Promise<Card> {
    const live = this.liveCard(card.id) ?? card;
    const updated = await cardMarkAttempt(live, correct, score ?? (correct ? 1 : 0), Date.now());
    await this.saveCard(updated);
    return updated;
  }

  /** Tạo thẻ mới từ nháp trong một bộ đã chọn. */
  async createCard(deckId: string, draft: Partial<CardDraft>): Promise<Card> {
    const next: CardDraft = {
      front: draft.front?.trim() ?? '',
      back: draft.back?.trim() ?? '',
      furigana: draft.furigana?.trim() ?? '',
      romaji: draft.romaji?.trim() ?? '',
      tags: Array.isArray(draft.tags) ? draft.tags.map((tag) => tag.trim()).filter(Boolean) : [],
      lesson: draft.lesson ?? undefined,
    };
    const card = await cardMake(next, crypto.randomUUID(), deckId, Date.now());
    await this.saveCard(card);
    await this.refreshStats();
    return card;
  }

  /**
   * Áp nháp sửa vào thẻ đang có, giữ nguyên id và lịch SRS.
   *
   * Quy tắc ghép nằm ở {@link mergeCardDraft}: trường thiếu trong nháp giữ
   * nguyên từ thẻ, còn khoá `lesson` có mặt — kể cả mang `undefined` do ô
   * "Bài Minna" bị xoá trắng — là yêu cầu XOÁ bài của trình biên tập.
   */
  async applyCardDraft(card: Card, draft: Partial<CardDraft>): Promise<Card> {
    const next = mergeCardDraft(card, draft);
    const updated = await cardApplyDraft(card, next);
    await this.saveCard(updated);
    await this.refreshStats();
    return updated;
  }

  /**
   * Lưu một thẻ đã thay đổi vào thư viện.
   *
   * Thay thế thẻ cùng `id` nếu đã có, và THÊM thẻ mới nếu chưa có — trước đây chỉ
   * thay thế, nên thẻ vừa tạo nằm trong IndexedDB nhưng không xuất hiện trong thư
   * viện đang dùng cho tới khi tải lại trang (trình biên tập chọn thẻ mới sẽ thấy
   * ô chọn nhảy về thẻ khác). Không bao giờ tạo bản sao cho cùng một id.
   */
  async saveCard(card: Card): Promise<void> {
    await putCard(card);
    const exists = this.cards.some((existing) => existing.id === card.id);
    this.cards = exists
      ? this.cards.map((existing) => (existing.id === card.id ? card : existing))
      : [...this.cards, card];
  }

  /** Chế độ hỏi của một bộ, lấy từ nội dung xuất bản; mặc định là hỏi nghĩa. */
  quizForDeck(deckId: string): Quiz {
    const bundle = this.content?.bundles.find((entry) => entry.deckId === deckId);
    return bundle?.quiz ?? (deckId.startsWith('kanji-') ? 'reading' : 'meaning');
  }

  /** Tên hiển thị của một bộ. */
  deckName(deckId: string): string {
    const bundle = this.content?.bundles.find((entry) => entry.deckId === deckId);
    return bundle?.name ?? deckId.replaceAll('-', ' ');
  }

  async refreshStats(): Promise<void> {
    this.stats = await deckStats(this.cards, 'meaning');
  }

  // ── Cài đặt ─────────────────────────────────────────────────────────────

  /**
   * Hàng đợi ghi cài đặt.
   *
   * `saveSettings` là đọc–gộp–ghi, nên hai lần gọi chồng nhau sẽ cùng đọc một
   * bản cũ và lần sau ghi đè mất thay đổi của lần trước. Giao diện cho phép đổi
   * liên tiếp (ví dụ chọn giao diện rồi gõ ngay số thẻ mới), nên các lần ghi
   * phải xếp hàng thay vì chạy song song — và cũng không cần khoá điều khiển
   * trong lúc chờ, vốn làm mất phím người dùng vừa bấm.
   */
  #settingsWrites: Promise<unknown> = Promise.resolve();

  async updateSettings(patch: Partial<AppSettings>): Promise<void> {
    const write = this.#settingsWrites.then(async () => {
      this.settings = await saveSettings(patch);
      applyTheme(this.settings.theme);
    });
    // Nuốt lỗi ở BẢN SAO dùng làm mốc xếp hàng, không nuốt ở lời hứa trả về:
    // lần ghi sau vẫn phải chạy tiếp, còn nơi gọi vẫn nhận đúng lỗi của mình.
    this.#settingsWrites = write.catch(() => {});
    return write;
  }

  // ── Nhập / xuất ─────────────────────────────────────────────────────────

  /** Nhập một file bộ thẻ vào một bộ đích. */
  async importFile(
    text: string,
    filename: string,
    deckId: string,
  ): Promise<{ added: number; skipped: number }> {
    const parsed = await deckParse(text, filename, this.quizForDeck(deckId));
    return this.importDraftBatches([{ deckId, drafts: parsed.cards }]);
  }

  /** Nhập nhiều bộ trong một giao dịch, không ghi đè thẻ hoặc tiến độ hiện có. */
  async importDraftBatches(
    batches: { deckId: string; drafts: CardDraft[] }[],
  ): Promise<{ added: number; skipped: number }> {
    const plan = await this.#planImportBatches(batches);
    await putCards(plan.fresh);
    await this.reloadLibrary();
    await this.refreshStats();
    return { added: plan.fresh.length, skipped: plan.skipped };
  }

  /**
   * Kiểm tra một lượt nhập mà KHÔNG ghi gì — dùng cho bước xem trước trước khi
   * người dùng xác nhận.
   *
   * Con số trả về không thể lệch với kết quả nhập thật: cả hai đường đi qua CÙNG
   * một hàm lập kế hoạch (`deckPlanImport`, tức luật bỏ trùng của lõi Rust) trên
   * cùng một thư viện. Đây là lý do không có phép đếm thứ hai trong giao diện.
   */
  async previewImport(
    batches: { deckId: string; drafts: CardDraft[] }[],
  ): Promise<{ added: number; skipped: number; perDeck: { deckId: string; added: number }[] }> {
    const plan = await this.#planImportBatches(batches);
    return {
      added: plan.fresh.length,
      skipped: plan.skipped,
      perDeck: plan.perDeck.map((entry) => ({ deckId: entry.deckId, added: entry.added })),
    };
  }

  /**
   * Lập kế hoạch nhập: thẻ nào sẽ được thêm, bao nhiêu thẻ bị bỏ.
   *
   * Một chỗ duy nhất cho cả đường GHI và đường CHỈ ĐỌC. Id mới được sinh ngay ở
   * đây (Rust không tự sinh id); ở đường chỉ đọc chúng bị bỏ đi — chúng chỉ dùng
   * để lõi dựng thẻ, không ảnh hưởng tới việc bỏ trùng.
   */
  async #planImportBatches(batches: { deckId: string; drafts: CardDraft[] }[]): Promise<{
    fresh: Card[];
    skipped: number;
    perDeck: { deckId: string; added: number; skipped: number }[];
  }> {
    const plannedCards = [...this.cards];
    const fresh: Card[] = [];
    const perDeck: { deckId: string; added: number; skipped: number }[] = [];
    let skipped = 0;
    for (const batch of batches) {
      const plan = await deckPlanImport(
        plannedCards,
        batch.drafts,
        batch.deckId,
        batch.drafts.map(() => crypto.randomUUID()),
      );
      fresh.push(...plan.fresh);
      plannedCards.push(...plan.fresh);
      skipped += plan.skipped;
      perDeck.push({ deckId: batch.deckId, added: plan.fresh.length, skipped: plan.skipped });
    }
    return { fresh, skipped, perDeck };
  }

  /**
   * Đọc và XÁC THỰC một file backup mà KHÔNG đụng tới thư viện.
   *
   * Nhờ vậy giao diện nói được file có hợp lệ không, có bao nhiêu thẻ, có tiến độ
   * học hay không TRƯỚC khi người dùng đồng ý ghi đè. Thẻ không chuẩn hoá được bị
   * đếm riêng — `validateAndCommitBackup` từ chối cả file trong trường hợp đó,
   * nên nếu để người dùng bấm Khôi phục rồi mới báo lỗi thì thao tác đã vô ích.
   *
   * @throws {Error} khi file không phải backup cá nhân của Midori.
   */
  async inspectPersonalBackup(text: string): Promise<BackupInspection> {
    const backup: ParsedBackup = parseBackup(text);
    const normalized = await cardsNormalize(backup.cards, Date.now());
    return {
      cards: backup.cards.length,
      usableCards: normalized.cards.length,
      invalidCards: normalized.rejected.length,
      includeProgress: backup.includeProgress,
      createdAt: backup.createdAt,
      sessionExpired: backup.sessionExpired,
      hasSession: backup.session !== null,
    };
  }

  /** Xuất thư viện ra file và tải về. */
  async exportLibrary(format: ExportFormat): Promise<string> {
    const file = await deckExport(this.cards, format, 'Midori', todayStamp());
    saveTextFile(file);
    return file.filename;
  }

  /** Xuất một bộ hoặc gói nhiều bộ; gói nhiều bộ luôn giữ deckId trong JSON. */
  async exportCardGroups(
    groups: { deckId: string; name: string; cards: Card[] }[],
    format: ExportFormat,
    asPackage = false,
  ): Promise<string> {
    if (groups.length === 0) throw new Error('Không có thẻ để xuất.');
    if (groups.length === 1 && !asPackage) {
      const group = groups[0]!;
      const file = await deckExport(group.cards, format, group.name, todayStamp());
      saveTextFile(file);
      return file.filename;
    }
    if (format !== 'json') {
      throw new Error('Gói nhiều bộ Kanji chỉ hỗ trợ định dạng JSON.');
    }

    const date = todayStamp();
    const file = {
      filename: `midori-kanji-${date}.json`,
      mime: 'application/json',
      text: JSON.stringify(
        {
          name: 'Kanji Midori',
          bundles: groups.map((group) => ({
            deckId: group.deckId,
            name: group.name,
            cards: group.cards.map(({ id, front, back, furigana, romaji, tags, lesson }) => ({
              id,
              front,
              back,
              furigana,
              romaji,
              tags,
              ...(lesson === undefined ? {} : { lesson }),
            })),
          })),
        },
        null,
        2,
      ),
    };
    saveTextFile(file);
    return file.filename;
  }

  /** Tải backup cá nhân; tiến độ chỉ được kèm khi người học chọn. */
  async exportPersonalBackup(includeProgress: boolean): Promise<string> {
    const [contentSync, screen, session] = await Promise.all([
      loadContentSync(),
      loadScreen(),
      loadSession(),
    ]);
    const text = createBackup({
      includeProgress,
      cards: this.cards,
      settings: this.settings,
      contentSync,
      screen: screen ?? 'home',
      session,
      collectionScope: this.collectionScope,
    });
    const filename = `midori-backup-${todayStamp()}.json`;
    saveTextFile({ filename, mime: 'application/json', text });
    return filename;
  }

  /** Xuất các bản ghi bị cách ly để người dùng giữ lại hoặc tự phục hồi. */
  async exportRecoveryRecords(): Promise<string | null> {
    const records = await loadRecoveryRecords();
    if (records.length === 0) return null;
    const text = `${JSON.stringify(
      { format: 'midori-recovery-records', version: 1, records },
      null,
      2,
    )}\n`;
    const filename = `midori-recovery-${todayStamp()}.json`;
    saveTextFile({ filename, mime: 'application/json', text });
    return filename;
  }

  /** Xác thực toàn bộ backup trước rồi thay thư viện bằng một giao dịch. */
  async restorePersonalBackup(text: string): Promise<{ cards: number; sessionExpired: boolean }> {
    this.backupRestoreNotice = null;
    const { backup, cards } = await validateAndCommitBackup(text, {
      normalizeCards: cardsNormalize,
      commit: (normalizedCards, metadata) =>
        replaceUserLibrary(normalizedCards, {
          [META_KEYS.settings]: metadata['settings'],
          [META_KEYS.contentVersion]: metadata['contentVersion'],
          [META_KEYS.contentCardIds]: metadata['contentCardIds'],
          [META_KEYS.screen]: metadata['screen'],
          [META_KEYS.session]: metadata['session'],
          ...(metadata['collectionScope'] === undefined
            ? {}
            : { [META_KEYS.collectionScope]: metadata['collectionScope'] }),
        }),
    });
    this.cards = cards;
    this.settings = backup.settings;
    this.screen = backup.screen;
    this.collectionScope = backup.collectionScope ?? { kind: 'all' };
    this.rejected = 0;
    this.contentSync = null;
    this.contentSyncError = null;
    applyTheme(this.settings.theme);
    if (this.content !== null) await this.#syncContentSafely(this.content, true);
    // Phiên vừa được khôi phục từ backup phải được đối chiếu lại với thư viện
    // vừa thay: id không còn tồn tại bị bỏ ngay, thay vì hiện một thẻ "Tiếp tục"
    // trỏ vào thẻ không có trong thư viện.
    await this.restoreSession();
    let statsError: string | null = null;
    try {
      await this.refreshStats();
    } catch (cause) {
      statsError = describe(cause);
      console.error('Đã khôi phục backup nhưng không làm mới được thống kê:', cause);
    }
    const details = [
      backup.sessionExpired ? 'Phiên học cũ đã hết hạn và không được khôi phục.' : null,
      this.contentSyncError === null
        ? null
        : `Nội dung chưa đồng bộ; thẻ và tiến độ đã khôi phục vẫn được giữ. ${this.contentSyncError}`,
      statsError === null ? null : `Không làm mới được thống kê: ${statsError}`,
    ].filter((detail): detail is string => detail !== null);
    this.backupRestoreNotice = [`Đã khôi phục ${cards.length} thẻ.`, ...details].join(' ');
    return { cards: cards.length, sessionExpired: backup.sessionExpired };
  }

  dismissBackupRestoreNotice(): void {
    this.backupRestoreNotice = null;
  }

  // ── Nội dung ────────────────────────────────────────────────────────────

  /**
   * Tải và đệm bản nội dung mới, kèm con số xem trước thay đổi.
   *
   * KHÔNG kích hoạt: nội dung đang dùng và thư viện chưa bị đụng tới. Người dùng
   * xem trước rồi mới quyết định, nên một bản nội dung lỗi không thể lặng lẽ thay
   * thế bản đang học tốt.
   */
  async stageContentUpdate(force = false): Promise<ContentStageResult> {
    const outcome = await this.#service.stage({ force });
    if (outcome.status !== 'staged') return outcome;

    const staged = await this.#service.readStaged();
    if (staged === null) {
      return {
        status: 'failed',
        reason: 'storage',
        message: 'Nội dung đã tải nhưng không đọc lại được từ vùng đệm',
      };
    }

    const sync = await loadContentSync();
    const preview = await previewReconciliation({
      library: this.cards,
      bundles: staged.bundles,
      previousIdsByDeck: sync.cardIdsByDeck,
      now: Date.now(),
      reconcile: contentReconcile,
    });
    return { ...outcome, preview };
  }

  /**
   * Kích hoạt bản đã đệm, rồi đồng bộ thư viện và ghi `meta.contentSync`.
   *
   * Hai lần ghi tách biệt có chủ đích: việc kích hoạt nội dung là một giao dịch
   * IndexedDB trên database nội dung, còn `content_reconcile` ghi vào database
   * người dùng. Nếu bước sau thất bại, nội dung mới vẫn dùng được và lần đồng bộ
   * có thể chạy lại — thẻ và tiến độ cũ không bị xoá.
   */
  async activateContentUpdate(): Promise<ContentActivationResult> {
    let promoted: boolean;
    try {
      promoted = await this.#service.activateStaged();
    } catch (cause) {
      // Dọn vùng đệm để lần sau bắt đầu sạch; nội dung đang dùng không đổi.
      await this.#service.discardStaged().catch(() => {});
      return {
        status: 'failed',
        message: cause instanceof Error && cause.message !== ''
          ? cause.message
          : 'Không kích hoạt được nội dung',
      };
    }
    if (!promoted) return { status: 'nothing-staged' };

    const active = await this.#service.readActive();
    if (active === null) {
      return { status: 'failed', message: 'Không đọc lại được nội dung vừa kích hoạt' };
    }
    this.content = active;

    let summary: SyncSummary;
    try {
      summary = await this.#syncContent(active);
      this.contentSync = summary;
      this.contentSyncError = null;
    } catch (cause) {
      this.contentSyncError = describe(cause);
      return {
        status: 'sync-failed',
        contentVersion: active.contentVersion,
        message: this.contentSyncError,
      };
    }
    return { status: 'activated', contentVersion: active.contentVersion, sync: summary };
  }

  /** Bỏ bản đã đệm. Không đụng tới nội dung đang dùng hay thư viện. */
  async discardStagedContent(): Promise<void> {
    await this.#service.discardStaged();
  }

  /** Quay lại bản nội dung trước đó rồi đồng bộ lại. */
  async rollbackContent(): Promise<'missing-previous' | 'rolled-back' | 'sync-failed'> {
    const rolled = await this.#service.rollback();
    if (!rolled) return 'missing-previous';
    const active = await this.#service.readActive();
    if (active === null) return 'sync-failed';
    this.content = active;
    return (await this.#syncContentSafely(active)) ? 'rolled-back' : 'sync-failed';
  }

  /** Cài lại nội dung hạt giống đi kèm bản dựng. */
  async reinstallSeed(): Promise<boolean> {
    const active = await this.#service.reinstallSeed();
    this.content = active;
    return this.#syncContentSafely(active);
  }

  async retryContentSync(): Promise<boolean> {
    if (this.content === null) return false;
    return this.#syncContentSafely(this.content, true);
  }

  /**
   * Xoá toàn bộ thư viện người học. Không đụng tới nội dung xuất bản.
   *
   * Phiên học đang dở cũng bị xoá: đó là TIẾN ĐỘ học, và giữ lại một hàng đợi
   * trỏ vào những thẻ vừa bị xoá sẽ khiến Trang chủ mời "tiếp tục" một phiên
   * không còn thẻ nào — hoặc tệ hơn, hồi sinh thẻ đã xoá từ bộ nhớ. Cài đặt và
   * bản ghi cứu hộ nằm ngoài phạm vi xoá này.
   */
  async eraseLibrary(): Promise<void> {
    await clearCards();
    await saveContentSync({ contentVersion: null, cardIdsByDeck: {} });
    await clearSession();
    this.openSession = null;
    await this.reloadLibrary();
    await this.refreshStats();
  }

  async reloadLibrary(): Promise<void> {
    const library = await loadCards();
    this.cards = library.cards;
    this.rejected = library.rejected.length;
  }

  /**
   * Đồng bộ nội dung xuất bản vào thư viện.
   *
   * Bỏ qua nếu nội dung đã được đồng bộ đúng phiên bản — cập nhật nội dung không
   * được kéo theo việc ghi lại toàn bộ thư viện.
   */
  async #syncContent(active: ActiveContent, force = false): Promise<SyncSummary> {
    const sync = await loadContentSync();
    if (!force && sync.contentVersion === active.contentVersion) {
      return {
        contentVersion: active.contentVersion,
        updated: 0,
        added: 0,
        orphaned: 0,
        skipped: true,
      };
    }

    const result = await reconcilePublishedContent({
      library: this.cards,
      bundles: active.bundles,
      previousIdsByDeck: sync.cardIdsByDeck,
      contentVersion: active.contentVersion,
      now: Date.now(),
      reconcile: contentReconcile,
      commit: commitContentReconciliation,
    });
    this.cards = result.cards;
    return {
      contentVersion: active.contentVersion,
      updated: result.updated,
      added: result.added,
      orphaned: result.orphaned,
      skipped: false,
    };
  }

  async #syncContentSafely(active: ActiveContent, force = false): Promise<boolean> {
    try {
      this.contentSync = await this.#syncContent(active, force);
      this.contentSyncError = null;
      return true;
    } catch (cause) {
      this.contentSyncError = describe(cause);
      console.warn('Không đồng bộ được nội dung vào thư viện người học:', cause);
      return false;
    }
  }
}

const DARK_QUERY = '(prefers-color-scheme: dark)';
let systemTheme: MediaQueryList | null = null;

/**
 * Áp chủ đề lên `<html>`.
 *
 * `auto` được GIẢI NGAY thành `light`/`dark` rồi mới ghi vào DOM. Nhờ vậy CSS chỉ
 * cần một khối biến cho mỗi chế độ, thay vì phải lặp lại khối tối ở cả nhánh
 * `[data-theme="dark"]` lẫn `@media (prefers-color-scheme: dark)`.
 * Khi hệ điều hành đổi chế độ, ta tự cập nhật lại.
 */
export function applyTheme(theme: AppSettings['theme']): void {
  systemTheme?.removeEventListener('change', onSystemThemeChange);
  systemTheme = null;

  if (theme === 'auto') {
    systemTheme = window.matchMedia(DARK_QUERY);
    systemTheme.addEventListener('change', onSystemThemeChange);
  }
  document.documentElement.dataset['theme'] = resolveTheme(theme);
}

function resolveTheme(theme: AppSettings['theme']): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') return theme;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function onSystemThemeChange(event: MediaQueryListEvent): void {
  document.documentElement.dataset['theme'] = event.matches ? 'dark' : 'light';
}

function describe(cause: unknown): string {
  if (cause instanceof Error && cause.message !== '') return cause.message;
  return 'Không khởi động được ứng dụng';
}

export const app = new AppStore();
