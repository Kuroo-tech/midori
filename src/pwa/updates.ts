/**
 * Cập nhật **ứng dụng** (HTML, JS, WASM, CSS, Service Worker).
 *
 * Tách hẳn khỏi cập nhật **nội dung** (`src/content/service.ts`) theo đặc tả §7.2:
 * hai loại cập nhật có phiên bản riêng, đường đi riêng và hậu quả riêng.
 *
 * Nguyên tắc: không bao giờ tự động tải lại trang. Nếu tự reload, người dùng có
 * thể mất thao tác đang làm dở. Bản dựng mới chỉ được kích hoạt khi người dùng
 * bấm "Cập nhật", và chỉ khi họ đang ở trạng thái an toàn để mất ngữ cảnh.
 *
 * # Vị trí của phiên học đang dở trong luồng này
 *
 * Bản dựng mới chỉ được kích hoạt khi người dùng chọn thời điểm (ADR-013), nhưng
 * một lần tải lại cũng vẫn xảy ra trong phiên học. Vì vậy fallback giữa cập nhật
 * ứng dụng và cập nhật nội dung phải độc lập với nhau (xem `src/app/store.svelte.ts`
 * và `src/storage/session.ts`): phiên được lưu lại sau mỗi thay đổi, và khôi phục
 * khi màn Học dựng lại — không phụ thuộc vào việc có cập nhật ứng dụng hay không.
 *
 * Kết quả: một buổi học bị "gián đoạn" bởi tải lại trang (từ chính cơ chế cập nhật)
 * cũng được bảo vệ như trường hợp người dùng đóng máy rồi mở lại. Xem
 * `docs/verification.md` (mục 6) và `README.md` (mục 3).
 */

import { registerSW } from 'virtual:pwa-register';
import { precacheIsEvicted } from './precache.ts';
import { APP_VERSION, compareVersions, fetchDeployedVersion } from './version.ts';

export type AppUpdateKind = 'service-worker' | 'deployed-build';

export interface AppUpdateState {
  /** Có bản dựng mới đang chờ kích hoạt. */
  available: boolean;
  kind: AppUpdateKind | null;
  /** Phiên bản công bố, nếu biết. */
  version: string | null;
  /** Đang kích hoạt. */
  applying: boolean;
  /** Lỗi gần nhất khi kích hoạt. */
  error: string | null;
}

let state: AppUpdateState = {
  available: false,
  kind: null,
  version: null,
  applying: false,
  error: null,
};

const listeners = new Set<(state: AppUpdateState) => void>();
let activateServiceWorker: (() => Promise<void>) | null = null;

/** Phiên bản ứng dụng đang chạy. */
export { APP_VERSION };

function setState(patch: Partial<AppUpdateState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

/** Theo dõi trạng thái cập nhật. Gọi ngay với giá trị hiện tại. */
export function subscribeAppUpdate(listener: (state: AppUpdateState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

export function getAppUpdateState(): AppUpdateState {
  return state;
}

/**
 * Sửa Cache Storage sau khi trình duyệt thu hồi cache.
 *
 * Trình duyệt được quyền xoá Cache Storage để lấy lại dung lượng nhưng **giữ**
 * đăng ký service worker. Khi đó precache trống, và Workbox không tự điền lại:
 * sự kiện `install` đã chạy xong từ lâu, còn `registration.update()` sẽ bỏ qua
 * `install` khi `sw.js` không đổi (so theo byte). Hậu quả đo được thật: ứng dụng
 * vẫn mở được khi có mạng, nhưng **không mở được khi ngoại tuyến** cho tới lần
 * deploy sau — mất khả năng ngoại tuyến im lặng, trong khi dữ liệu người học
 * vẫn còn nguyên trong IndexedDB (xem `docs/verification.md` mục 9).
 *
 * Cách sửa từ trang: gỡ đăng ký ở lần tải này, và **không** đăng ký lại trong
 * cùng lần tải — lần tải sau đăng ký mới sẽ chạy `install`, điền precache từ mạng.
 *
 * Vì sao không đăng ký lại ngay: `registration.unregister()` dọn registration ở
 * một task khác, và `navigator.serviceWorker.register()` chạy ngay sau đó sẽ
 * **bám lại** vào registration đang dỡ (trình duyệt vẫn thấy worker cũ đang điều
 * khiển trang). Lúc đó `sw.js` không đổi theo byte nên `install` không chạy —
 * precache vẫn trống, và registration vẫn sống: mất khả năng ngoại tuyến vĩnh
 * viễn (đã gặp thật khi kiểm chứng). Đăng ký lại chỉ an toàn khi registration đã
 * bị dọn hẳn, tức là ở lần tải sau.
 *
 * Ba nguyên tắc:
 *
 * 1. Chạy **trước** `registerSW()`.
 * 2. Chưa từng đăng ký thì để nguyên: cài mới đã chạy `install` bình thường.
 * 3. Không bao giờ chặn khởi động, không bao giờ tự tải lại — lỗi chỉ lùi về
 *    hành vi cũ.
 *
 * @returns `true` nếu đã gỡ đăng ký — lần tải này phải **bỏ qua** đăng ký lại.
 */
async function repairEvictedPrecache(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('caches' in globalThis)) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration === undefined) return false;

    const cacheNames = await caches.keys();
    const precacheName = cacheNames.find((name) => name.includes('precache'));
    const entryPaths: string[] = [];
    if (precacheName !== undefined) {
      const cache = await caches.open(precacheName);
      for (const request of await cache.keys()) {
        entryPaths.push(new URL(request.url).pathname);
      }
    }

    if (!precacheIsEvicted(cacheNames, entryPaths)) return false;
    await registration.unregister();
    return true;
  } catch (cause) {
    console.warn('Không kiểm tra được precache của service worker:', cause);
    return false;
  }
}

/** Khởi động theo dõi cập nhật ứng dụng. Gọi đúng một lần khi ứng dụng boot. */
export async function initAppUpdates(): Promise<void> {
  const unregistered = await repairEvictedPrecache();

  if (!unregistered) {
    activateServiceWorker = registerSW({
      immediate: true,
      onNeedRefresh() {
        setState({ available: true, kind: 'service-worker' });
      },
      onOfflineReady() {
        // Ứng dụng đã sẵn sàng ngoại tuyến. Không cần báo: người dùng sẽ thấy
        // điều đó qua việc ứng dụng vẫn chạy khi mất mạng.
      },
    });
  }

  await checkDeployedVersion();
}

/**
 * So phiên bản công bố ở `/data/version.json` với phiên bản đang chạy.
 *
 * Cần thiết vì Service Worker chỉ nhận ra bản mới khi có tài nguyên được precache
 * thay đổi; một bản phát hành chỉ đổi phiên bản sẽ không kích hoạt được nó.
 *
 * Việc đọc file nằm ở `src/pwa/version.ts` để kiểm thử được bằng Node (module này
 * import `virtual:pwa-register`, chỉ tồn tại trong bản dựng của Vite).
 */
export async function checkDeployedVersion(): Promise<string | null> {
  const version = await fetchDeployedVersion(fetch);
  if (version !== null && compareVersions(version, APP_VERSION) > 0) {
    setState({ available: true, kind: 'deployed-build', version });
  }
  return version;
}

/**
 * Chờ service worker mới nắm quyền điều khiển, có giới hạn thời gian.
 *
 * Trả về ngay nếu không có service worker đang điều khiển (chế độ dev, hoặc
 * trình duyệt chặn service worker).
 */
function waitForNewController(timeoutMs = 3000): Promise<void> {
  const container = navigator.serviceWorker;
  const current = container.controller;
  if (current === null) return Promise.resolve();

  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      container.removeEventListener('controllerchange', onChange);
      resolve();
    };
    function onChange(): void {
      if (container.controller !== current) finish();
    }
    const timer = setTimeout(finish, timeoutMs);
    container.addEventListener('controllerchange', onChange);
  });
}

/**
 * Kích hoạt bản dựng mới rồi tải lại trang.
 *
 * Chỉ gọi từ một hành động rõ ràng của người dùng.
 *
 * # Vì sao phải chờ service worker mới rồi mới tải lại
 *
 * Tải lại ngay sau khi gửi `SKIP_WAITING` là sai và đã gặp lỗi thật: ở thời điểm
 * đó service worker **cũ** vẫn đang điều khiển trang, nên nó phục vụ `index.html`
 * cũ trỏ tới file JS mà bản dựng mới đã xoá. Trình duyệt tải file đó thất bại và
 * **ứng dụng trắng trang** cho tới khi người dùng tự tải lại lần nữa.
 *
 * Chờ `controllerchange` là thời điểm duy nhất bảo đảm HTML và mọi tài nguyên
 * được phục vụ bởi **cùng một** service worker, tức cùng một phiên bản bản dựng
 * — đúng yêu cầu của đặc tả §7.2A (không để giao diện mới chạy cùng lõi cũ).
 *
 * Việc chờ có giới hạn thời gian vì trường hợp còn lại (`kind: 'deployed-build'`
 * — chỉ phiên bản công bố đổi) không có service worker nào đang chờ; khi đó tải
 * lại ngay là đúng và an toàn vì mọi tài nguyên được precache vẫn giống hệt bản
 * đang chạy (chỉ `version.json` đổi, và file đó không được precache).
 */
export async function applyAppUpdate(): Promise<boolean> {
  setState({ applying: true, error: null });
  try {
    if (activateServiceWorker !== null) {
      // Gửi `SKIP_WAITING` cho service worker đang chờ.
      await activateServiceWorker();
      await waitForNewController();
    }
    window.location.reload();
    return true;
  } catch (cause) {
    setState({
      applying: false,
      error: cause instanceof Error ? cause.message : 'Không kích hoạt được bản cập nhật',
    });
    return false;
  }
}
