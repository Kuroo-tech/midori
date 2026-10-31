/**
 * Kiểm tra manifest nội dung — hàm thuần, không I/O, không phụ thuộc trình duyệt.
 *
 * Manifest là dữ liệu đến từ mạng nên phải bị coi là **không đáng tin**: mọi
 * trường được kiểm tra kiểu, khoảng giá trị và tính an toàn của đường dẫn trước
 * khi dùng. Một manifest hỏng không được phép làm hỏng nội dung đang dùng.
 */

import type { CardDraft, Quiz } from '../core/types.ts';
import {
  SUPPORTED_SCHEMA_VERSION,
  type BundleDescriptor,
  type PublishedManifest,
  type UpdateFailureReason,
} from './types.ts';

/** Thư mục gốc của nội dung xuất bản, tương đối gốc site. */
export const CONTENT_BASE = '/data/content/';

/** Tên file manifest. */
export const MANIFEST_FILE = 'manifest.json';

export type ManifestResult =
  | { ok: true; manifest: PublishedManifest }
  | { ok: false; reason: UpdateFailureReason; message: string };

const SHA256_HEX = /^[0-9a-f]{64}$/;
const QUIZZES: readonly Quiz[] = ['meaning', 'reading'];

/**
 * Kiểm tra và chuẩn hoá manifest.
 *
 * `schemaVersion` mới hơn bản dựng này ⇒ `schema-unsupported` (khác với manifest
 * hỏng): người dùng cần cập nhật ứng dụng, không phải thử lại.
 */
export function parseManifest(raw: unknown): ManifestResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return invalid('Manifest không phải đối tượng JSON');
  }

  const value = raw as Record<string, unknown>;
  const schemaVersion = value['schemaVersion'];
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
    return invalid('Thiếu hoặc sai "schemaVersion"');
  }
  if (schemaVersion > SUPPORTED_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: 'schema-unsupported',
      message: `Manifest dùng schema v${schemaVersion}, bản dựng này hỗ trợ tối đa v${SUPPORTED_SCHEMA_VERSION}`,
    };
  }

  const contentVersion = value['contentVersion'];
  if (typeof contentVersion !== 'string' || contentVersion.trim() === '') {
    return invalid('Thiếu hoặc sai "contentVersion"');
  }

  const rawBundles = value['bundles'];
  if (!Array.isArray(rawBundles) || rawBundles.length === 0) {
    return invalid('Manifest không có gói nội dung nào');
  }

  const bundles: BundleDescriptor[] = [];
  const seen = new Set<string>();
  for (const [index, item] of rawBundles.entries()) {
    const descriptor = parseBundle(item, index);
    if (typeof descriptor === 'string') return invalid(descriptor);
    if (seen.has(descriptor.deckId)) {
      return invalid(`Gói trùng "deckId": ${descriptor.deckId}`);
    }
    seen.add(descriptor.deckId);
    bundles.push(descriptor);
  }

  const generatedAt = value['generatedAt'];
  return {
    ok: true,
    manifest: {
      schemaVersion,
      contentVersion: contentVersion.trim(),
      ...(typeof generatedAt === 'string' ? { generatedAt } : {}),
      bundles,
    },
  };
}

function parseBundle(raw: unknown, index: number): BundleDescriptor | string {
  const at = `gói #${index}`;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return `${at} không phải đối tượng`;
  }
  const value = raw as Record<string, unknown>;

  const deckId = nonEmptyString(value['deckId']);
  if (deckId === null) return `${at}: thiếu "deckId"`;
  const name = nonEmptyString(value['name']);
  if (name === null) return `${at}: thiếu "name"`;

  const path = nonEmptyString(value['path']);
  if (path === null) return `${at}: thiếu "path"`;
  if (!isSafeRelativePath(path)) {
    return `${at}: "path" không phải đường dẫn tương đối an toàn (${path})`;
  }

  const bytes = value['bytes'];
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
    return `${at}: "bytes" phải là số dương`;
  }

  const sha256 = nonEmptyString(value['sha256'])?.toLowerCase();
  if (sha256 === undefined || sha256 === null) return `${at}: thiếu "sha256"`;
  if (!SHA256_HEX.test(sha256)) return `${at}: "sha256" không phải 64 ký tự hex`;

  const quiz = value['quiz'];
  if (typeof quiz !== 'string' || !QUIZZES.includes(quiz as Quiz)) {
    return `${at}: "quiz" phải là "meaning" hoặc "reading"`;
  }

  return { deckId, name, path, bytes, sha256, quiz: quiz as Quiz };
}

/**
 * Đường dẫn gói phải tương đối, không có `..`, không bắt đầu bằng `/`.
 *
 * Không phải phòng thủ hình thức: manifest đến từ mạng, và một `path` kiểu
 * `../../etc` sẽ khiến ứng dụng tải thứ ngoài phạm vi nội dung.
 */
export function isSafeRelativePath(path: string): boolean {
  if (path.startsWith('/') || path.startsWith('\\')) return false;
  if (path.includes('\\')) return false;
  if (path.includes('://')) return false;
  if (path.includes('?')) return false;
  if (path.includes('#')) return false;
  const segments = path.split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/** URL đầy đủ của một gói nội dung. */
export function bundleUrl(path: string): string {
  return `${CONTENT_BASE}${path}`;
}

/** URL của manifest. */
export function manifestUrl(): string {
  return `${CONTENT_BASE}${MANIFEST_FILE}`;
}

/**
 * Kiểm tra gói đã phân tích có dùng được cho việc đồng bộ hay không.
 *
 * Yêu cầu quan trọng nhất: MỌI thẻ phải có `id` ổn định. Không có id thì không
 * thể đối chiếu qua các lần cập nhật, và tiến độ học của người dùng sẽ mất.
 *
 * Bundle rỗng hợp lệ: collection có thể chưa có thẻ do người dùng chưa thêm dữ liệu.
 *
 * @returns thông báo lỗi, hoặc `null` nếu gói hợp lệ
 */
export function bundleIssues(cards: unknown): string | null {
  if (!Array.isArray(cards)) return 'Gói không có mảng thẻ';

  const seen = new Set<string>();
  for (const [index, item] of cards.entries()) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return `Thẻ #${index} không phải đối tượng`;
    }

    const card = item as Partial<CardDraft>;
    const id = typeof card.id === 'string' ? card.id.trim() : '';
    if (id === '') {
      return `Thẻ #${index} thiếu "id" ổn định`;
    }
    if (seen.has(id)) return `Thẻ trùng "id": ${id}`;
    seen.add(id);

    const front = typeof card.front === 'string' ? card.front : '';
    const back = typeof card.back === 'string' ? card.back : '';
    if (front.trim() === '' || back.trim() === '') {
      return `Thẻ "${id}" thiếu mặt trước hoặc mặt sau`;
    }
  }
  return null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function invalid(message: string): ManifestResult {
  return { ok: false, reason: 'manifest-invalid', message };
}
