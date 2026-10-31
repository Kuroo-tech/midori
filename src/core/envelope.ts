/**
 * Bóc phong bì JSON trả về từ lõi Rust.
 *
 * Lõi chỉ có MỘT quy tắc đầu ra (xem `docs/contract.md`):
 *   `{"ok":true,"data":…}` hoặc `{"ok":false,"error":{code,message,detail?}}`
 *
 * Nhờ vậy toàn bộ lớp JS chỉ cần đúng một hàm bóc phong bì, và mọi lỗi nghiệp vụ
 * đều đến tay giao diện dưới dạng {@link CoreError} với `code` ổn định.
 */

/** Hình dạng `error` trong phong bì thất bại. */
export interface CoreErrorPayload {
  /** Mã ổn định để lập trình: `invalid_json`, `invalid_argument`, … */
  code: string;
  /** Thông báo tiếng Việt, hiển thị được cho người dùng. */
  message: string;
  /** Ngữ cảnh kỹ thuật, chỉ để gỡ lỗi. */
  detail?: string;
}

/**
 * Lỗi nghiệp vụ phát sinh trong lõi Rust.
 *
 * Phân biệt với lỗi giao tiếp (WASM chưa nạp, phong bì méo): những lỗi đó là
 * `Error` thường vì chúng là lỗi lập trình, không phải lỗi người dùng gây ra.
 */
export class CoreError extends Error {
  readonly code: string;
  readonly detail: string | undefined;

  constructor(payload: CoreErrorPayload) {
    super(payload.message);
    this.name = 'CoreError';
    this.code = payload.code;
    this.detail = payload.detail;
  }
}

/** Các mã lỗi lõi có thể trả về. Giữ khớp với `ErrorCode` bên Rust. */
export const CORE_ERROR_CODES = [
  'invalid_json',
  'invalid_argument',
  'invalid_record',
  'unsupported_format',
  'empty_input',
  'no_valid_records',
] as const;

/**
 * Giải một chuỗi phong bì thành dữ liệu có kiểu, hoặc ném {@link CoreError}.
 *
 * @throws {CoreError} khi lõi trả về `ok: false`
 * @throws {Error} khi lõi trả về thứ không phải phong bì (lỗi lập trình)
 */
export function unwrap<T>(raw: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`Lõi trả về chuỗi không phải JSON: ${raw.slice(0, 120)}`, { cause });
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`Lõi trả về phong bì không phải đối tượng: ${raw.slice(0, 120)}`);
  }

  const envelope = parsed as { ok?: unknown; data?: unknown; error?: unknown };

  if (envelope.ok === true) {
    return envelope.data as T;
  }

  if (envelope.ok === false) {
    const error = envelope.error;
    if (typeof error === 'object' && error !== null && typeof (error as CoreErrorPayload).code === 'string') {
      throw new CoreError(error as CoreErrorPayload);
    }
    throw new Error(`Phong bì lỗi thiếu trường "error" hợp lệ: ${raw.slice(0, 120)}`);
  }

  throw new Error(`Phong bì thiếu trường "ok": ${raw.slice(0, 120)}`);
}

/** `true` nếu `value` là lỗi nghiệp vụ của lõi (dùng cho `catch`). */
export function isCoreError(value: unknown): value is CoreError {
  return value instanceof CoreError;
}
