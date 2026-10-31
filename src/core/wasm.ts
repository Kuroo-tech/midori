/**
 * Nạp mô-đun WASM của lõi Midori.
 *
 * Đây là **nơi duy nhất** trong dự án được phép chạm vào mô-đun WASM sinh tự
 * động. Phần còn lại của ứng dụng đi qua mặt tiền có kiểu ở `src/core/index.ts`.
 *
 * Việc nạp là một lần cho toàn bộ vòng đời trang: WebAssembly.instance là tài
 * nguyên dùng chung, tạo nhiều instance vừa tốn bộ nhớ vừa làm mất tính nhất
 * quán của RNG có seed.
 */

import initWasm, * as bindings from '../generated/midori-wasm/midori_wasm.js';
import { unwrap } from './envelope.ts';

/** Toàn bộ hàm do WASM xuất ra, kèm kiểu sinh tự động. */
export type CoreBindings = typeof bindings;

/** Nguồn nạp file `.wasm`. */
export type WasmSource =
  /** `WebAssembly.Module` đã biên dịch sẵn. */
  | WebAssembly.Module
  /** Bytes thô của file `.wasm` — dùng cho môi trường không có `fetch`/URL. */
  | BufferSource
  /** URL của file `.wasm`. */
  | string
  | URL;

/** Tuỳ chọn nạp, dùng để tiêm nguồn WASM trong kiểm thử. */
export interface LoadOptions {
  /**
   * Bỏ trống ⇒ dùng URL do bundler giải quyết từ `import.meta.url`
   * (đường đi bình thường trong trình duyệt).
   */
  source?: WasmSource;
}

let pending: Promise<CoreBindings> | null = null;

/**
 * Nạp và trả về các hàm của lõi. Gọi nhiều lần chỉ nạp một lần.
 *
 * @throws {Error} khi không nạp được WASM (thiếu file, sai định dạng)
 */
export function loadCore(options: LoadOptions = {}): Promise<CoreBindings> {
  pending ??= start(options.source);
  return pending;
}

async function start(source: WasmSource | undefined): Promise<CoreBindings> {
  if (source === undefined) {
    await initWasm();
  } else {
    await initWasm({ module_or_path: source });
  }
  return bindings;
}

/**
 * Phiên bản lõi do chính WASM khai báo.
 *
 * Dùng để chẩn đoán: giao diện hiển thị nó ở màn Cài đặt, và nó phải khớp với
 * `crates/midori-core/Cargo.toml`.
 */
export async function coreVersion(): Promise<string> {
  const core = await loadCore();
  return unwrap<string>(core.version());
}

/**
 * Nạp với bytes có sẵn rồi trả về phiên bản lõi — tiện cho kiểm thử và cho
 * đường nạp sớm (preload) trước khi giao diện cần.
 */
export async function loadCoreFrom(source: WasmSource): Promise<CoreBindings> {
  return loadCore({ source });
}

/** Xoá trạng thái đã nạp. CHỈ dùng trong kiểm thử. */
export function resetCoreForTests(): void {
  pending = null;
}
