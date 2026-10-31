/**
 * Nạp màn hình theo nhu cầu (code splitting).
 *
 * # Vì sao
 *
 * Ứng dụng có 15 màn hình, nhưng một lần mở chỉ cần MỘT. Trước đây mọi màn hình
 * nằm trong cùng một gói JavaScript, nên người mới mở ứng dụng phải tải cả màn
 * Thống kê, Trình biên tập thẻ, 7 nhóm Kanji… trong khi chỉ xem Trang chủ. Trên
 * điện thoại, đó là dữ liệu và thời gian tải trả giá cho thứ chưa dùng tới.
 *
 * Mỗi màn hình nay là một gói riêng, do `import()` động quyết định.
 *
 * # Vì sao KHÔNG có khoảng trắng khi chuyển màn hình
 *
 * Ba lớp bảo đảm cùng lúc:
 *
 * 1. **Màn hình đầu tiên được nạp XONG trước khi `app.ready` bật.** `boot()` gọi
 *    `screenLoader` (do `main.ts` tiêm vào) rồi mới bật cờ, nên khung đầu tiên đã
 *    có đủ component — không có khung nào trống.
 * 2. **Các màn hình còn lại được nạp trước ngay sau khi sẵn sàng.** Người dùng
 *    thật mất hàng trăm mili-giây trước khi bấm sang tab khác; gói đã nằm sẵn
 *    trong bộ nhớ đệm của trình duyệt và của service worker.
 * 3. **Nếu vẫn chưa kịp**, {@link ScreenHost} hiện một khung xương thay vì khoảng
 *    trắng — chậm thì thấy đang tải, chứ không thấy trang trống.
 *
 * # Vì sao có bộ nhớ đệm riêng
 *
 * `import()` đã tự nhớ kết quả, nhưng nó là bất đồng bộ: đọc lại lần hai vẫn phải
 * đi qua một microtask. Bộ nhớ đệm ở đây cho phép {@link screenComponent} trả về
 * component ĐỒNG BỘ, nên lần chuyển màn hình thứ hai trở đi không có khung hình
 * trung gian nào.
 */

import type { Component } from 'svelte';

import type { Screen } from '../app/screen.ts';

type Loader = () => Promise<{ default: Component }>;

/**
 * Bảng nạp. Mỗi màn hình một gói. Collection là MỘT component dùng cho mọi phạm
 * vi (bài Minna, nhóm Kanji, bộ bất kỳ) vì phạm vi nằm ở trạng thái điều hướng,
 * không nằm ở màn hình — bảy màn Kanji riêng lẻ của bản cũ không còn tồn tại.
 */
const LOADERS: Record<Screen, Loader> = {
  home: () => import('../ui/Home.svelte'),
  lessons: () => import('../ui/Lessons.svelte'),
  patterns: () => import('../ui/PatternLessons.svelte'),
  kanji: () => import('../ui/KanjiOverview.svelte'),
  collection: () => import('../ui/Collection.svelte'),
  session: () => import('../ui/Session.svelte'),
  transfer: () => import('../ui/Transfer.svelte'),
  settings: () => import('../ui/Settings.svelte'),
  stats: () => import('../ui/StatsDetail.svelte'),
  editor: () => import('../ui/CardEditor.svelte'),
};

const cache = new Map<Screen, Component>();
const pending = new Map<Screen, Promise<Component>>();

/**
 * Nạp một màn hình và giữ lại component đã nạp.
 *
 * Gọi nhiều lần cho cùng màn hình chỉ tạo MỘT yêu cầu: lời hứa được dùng chung,
 * nên việc nạp trước và việc dựng màn hình không bao giờ tranh nhau tải hai lần.
 */
export function loadScreen(screen: Screen): Promise<Component> {
  const cached = cache.get(screen);
  if (cached !== undefined) return Promise.resolve(cached);

  const existing = pending.get(screen);
  if (existing !== undefined) return existing;

  const loader = LOADERS[screen];
  if (loader === undefined) {
    // Không thể xảy ra khi `LOADERS` phủ đủ `SCREENS`, nhưng nếu ai đó thêm một
    // màn hình vào `SCREENS` mà quên bộ nạp thì đây là chỗ DUY NHẤT nói ra điều
    // đó — nếu không, triệu chứng sẽ là một màn hình trắng không lời giải thích.
    return Promise.reject(new Error(`Màn hình không có bộ nạp: ${screen}`));
  }

  const request = loader().then(
    (module) => {
      const component = module.default;
      cache.set(screen, component);
      pending.delete(screen);
      return component;
    },
    (error: unknown) => {
      // Xoá lời hứa HỎNG khỏi `pending`: giữ nó lại thì mọi lần gọi sau (lần
      // chuyển màn hình kế tiếp, lượt nạp trước sau) đều nhận đúng lời hứa đã
      // hỏng đó và thất bại tức thì — không còn cơ hội thử lại nào. (Trên
      // Chrome, thử lại CÙNG URL trong cùng tài liệu vẫn hỏng vì engine nhớ
      // phép nạp hỏng theo URL; thẻ lỗi của ScreenHost vì thế tải lại trang.
      // Ở đây vẫn phải xoá để bộ nhớ đệm của chính mình không ghim lời hứa
      // hỏng — và ở trình duyệt không nhớ lỗi thì lần gọi sau thành công thật.)
      pending.delete(screen);
      throw error;
    },
  );
  pending.set(screen, request);
  return request;
}

/** Component đã nạp của màn hình, hoặc `null` nếu còn phải chờ. */
export function screenComponent(screen: Screen): Component | null {
  return cache.get(screen) ?? null;
}

/**
 * Nạp trước mọi màn hình chưa có, theo thứ tự ưu tiên đã cho.
 *
 * Cố ý tuần tự và bỏ qua màn hình đang hiện: mục đích là làm cho việc chuyển màn
 * hình sau này không phải chờ, không phải để giành băng thông với nội dung đang
 * được hiển thị. Mọi lỗi được nuốt — nạp trước là tối ưu, không phải chức năng;
 * nếu nó hỏng thì lần chuyển màn hình sau sẽ tự thử lại.
 */
export async function prefetchScreens(order: readonly Screen[], skip?: Screen): Promise<void> {
  for (const screen of order) {
    if (screen === skip || cache.has(screen)) continue;
    try {
      await loadScreen(screen);
    } catch {
      // Bỏ qua: xem chú thích ở trên.
    }
  }
}
