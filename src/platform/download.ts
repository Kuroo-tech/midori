/**
 * Tải một file văn bản về máy người dùng.
 *
 * Nằm ở lớp nền tảng vì cần DOM (`Blob`, `URL.createObjectURL`). Lõi Rust chỉ
 * dựng NỘI DUNG file (`deckExport`), không biết gì về việc tải về.
 */

import type { ExportFile } from '../core/types.ts';

/** Hiện hộp thoại lưu file của trình duyệt. */
export function saveTextFile(file: ExportFile): void {
  const blob = new Blob([file.text], { type: `${file.mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Thu hồi URL sau khi trình duyệt đã bắt đầu tải.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
