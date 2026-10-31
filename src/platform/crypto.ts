/**
 * Năng lực nền tảng: sinh id, băm, thời gian.
 *
 * Những việc này KHÔNG thuộc lõi Rust: chúng dựa vào API của hệ điều hành và
 * trình duyệt (nguồn ngẫu nhiên mật mã, WebCrypto, đồng hồ địa phương). Lõi Rust
 * cố tình không sinh id — nhờ vậy lõi vẫn là hàm thuần và kiểm thử được ở native.
 *
 * Vì vậy: `id` đi từ đây vào Rust, chứ không phải ngược lại.
 */

/** UUID v4 do trình duyệt sinh. */
export function uuid(): string {
  return crypto.randomUUID();
}

/** `n` UUID mới, dùng khi cần tạo nhiều thẻ trong một lần. */
export function uuids(n: number): string[] {
  return Array.from({ length: n }, () => crypto.randomUUID());
}

/** SHA-256 dạng hex thường (64 ký tự). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // `crypto.subtle.digest` đòi một view gắn với `ArrayBuffer` thuần, trong khi
  // `Uint8Array` có thể trỏ vào `SharedArrayBuffer`. Sao chép sang view mới vừa
  // thoả kiểu vừa không phụ thuộc việc buffer đến từ đâu. Kích thước gói nội dung
  // chỉ vài chục KB nên chi phí này không đáng kể.
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Seed cho bộ trộn có tính xác định của lõi.
 *
 * Trả về số nguyên 32 bit dương: đủ lớn để mỗi phiên học có thứ tự khác nhau,
 * và luôn hợp lệ với tham số `u64` bên Rust.
 */
export function randomSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] ?? 1;
}

/** Ngày địa phương dạng `YYYY-MM-DD`, dùng cho tên file xuất. */
export function todayStamp(date: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
