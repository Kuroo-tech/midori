/**
 * So sánh phiên bản — hàm thuần, không phụ thuộc trình duyệt.
 *
 * Dùng cho **cập nhật ứng dụng**: so phiên bản bản dựng đang chạy với phiên bản
 * công bố ở `/data/version.json`. Không liên quan tới phiên bản nội dung
 * (`contentVersion`), vốn được so bằng chuỗi và do manifest quyết định.
 */

/** Phiên bản bản dựng đang chạy. Vite thay `__APP_VERSION__` bằng giá trị thật. */
declare const __APP_VERSION__: string;

export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

/**
 * So sánh hai phiên bản dạng dấu chấm.
 *
 * Quy tắc: tách theo ký tự không phải chữ-số, so từng phần; phần nào cả hai đều
 * là số thì so theo số (`1.10` > `1.9`), còn lại so theo thứ tự chữ. Phiên bản
 * thiếu phần được coi là 0 (`1.2` = `1.2.0`).
 *
 * @returns `-1` nếu `a` cũ hơn, `0` nếu bằng, `1` nếu `a` mới hơn
 */
export function compareVersions(a: string, b: string): number {
  const left = segments(a);
  const right = segments(b);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i++) {
    const l = left[i] ?? '0';
    const r = right[i] ?? '0';
    if (l === r) continue;

    const ln = numeric(l);
    const rn = numeric(r);
    if (ln !== null && rn !== null) {
      return ln < rn ? -1 : 1;
    }
    return l < r ? -1 : 1;
  }
  return 0;
}

function segments(version: string): string[] {
  return version.trim().split(/[^0-9A-Za-z]+/).filter((part) => part !== '');
}

function numeric(part: string): number | null {
  if (!/^\d+$/.test(part)) return null;
  const value = Number(part);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Đường dẫn công bố phiên bản bản dựng.
 *
 * KHÔNG được precache: file này phải luôn đọc từ mạng thì việc kiểm tra mới có
 * ý nghĩa (`globPatterns` trong `vite.config.ts` không gồm `json`).
 */
export const DEPLOYED_VERSION_URL = '/data/version.json';

/**
 * Đọc phiên bản bản dựng đang được công bố ở nguồn web chính thức.
 *
 * Trả về `null` khi không đọc được — ngoại tuyến, nguồn chưa công bố, hoặc phản
 * hồi không hợp lệ. Đó **không** phải lỗi: ứng dụng phải chạy được ngoại tuyến.
 *
 * # Vì sao phải kiểm tra `content-type`
 *
 * Máy chủ tĩnh trả `index.html` với mã 200 cho đường dẫn không tồn tại
 * (SPA fallback). Nếu chỉ dựa vào `response.ok` thì một cấu hình sai — ví dụ quên
 * sinh `version.json` — sẽ bị nuốt ở `catch` và trông y hệt "đang ngoại tuyến",
 * khiến lỗi triển khai không thể chẩn đoán.
 *
 * @param fetchImpl Truyền vào để kiểm thử được mà không cần trình duyệt.
 */
export async function fetchDeployedVersion(fetchImpl: typeof fetch): Promise<string | null> {
  try {
    const response = await fetchImpl(`${DEPLOYED_VERSION_URL}?ts=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    if (!(response.headers.get('content-type') ?? '').includes('json')) return null;

    const payload = (await response.json()) as { version?: unknown };
    if (typeof payload.version !== 'string' || payload.version === '') return null;
    return payload.version;
  } catch {
    return null;
  }
}
