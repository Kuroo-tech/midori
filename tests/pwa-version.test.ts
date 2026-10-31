/**
 * Kiểm thử so sánh phiên bản dùng cho cập nhật ứng dụng.
 *
 * Sai ở đây nghĩa là hoặc người dùng không bao giờ thấy bản cập nhật, hoặc bị
 * nhắc cập nhật liên tục dù đã ở bản mới nhất.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  APP_VERSION,
  DEPLOYED_VERSION_URL,
  compareVersions,
  fetchDeployedVersion,
} from '../src/pwa/version.ts';

/** Dựng một phản hồi giả tối thiểu, đủ cho `fetchDeployedVersion` dùng. */
function response(body: string, init: { status?: number; contentType?: string } = {}): Response {
  const { status = 200, contentType = 'application/json' } = init;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': contentType }),
    json: async () => JSON.parse(body) as unknown,
  } as unknown as Response;
}

test('so sánh theo từng phần số, không theo thứ tự chữ', () => {
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1, '1.10 phải mới hơn 1.9');
  assert.equal(compareVersions('1.9.0', '1.10.0'), -1);
  assert.equal(compareVersions('2.0.0', '10.0.0'), -1);
});

test('phiên bản thiếu phần được coi là 0', () => {
  assert.equal(compareVersions('1.2', '1.2.0'), 0);
  assert.equal(compareVersions('1', '1.0.0'), 0);
  assert.equal(compareVersions('1.2.1', '1.2'), 1);
});

test('phiên bản bằng nhau trả về 0', () => {
  assert.equal(compareVersions('0.1.0', '0.1.0'), 0);
  assert.equal(compareVersions('', ''), 0);
});

test('tiền tố chữ được so theo thứ tự chữ', () => {
  assert.equal(compareVersions('1.0.0-beta', '1.0.0'), 1, 'bản có hậu tố vẫn khác bản trống');
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('0.1.0+build2', '0.1.0+build1'), 1);
});

test('dấu phân cách lạ không làm hỏng việc so sánh', () => {
  assert.equal(compareVersions('2026-10-12', '2026-09-30'), 1);
  assert.equal(compareVersions('  1.0.0  ', '1.0.0'), 0);
});

test('gặp giá trị không phải số thì so theo chữ, không ném lỗi', () => {
  assert.doesNotThrow(() => compareVersions('abc', '1.0.0'));
  assert.equal(compareVersions('abc', 'abc'), 0);
});

test('APP_VERSION có giá trị dùng được cả khi không có bundler', () => {
  // Trong Node, `__APP_VERSION__` không được Vite thay thế ⇒ phải rơi về 'dev'
  // thay vì ném ReferenceError.
  assert.equal(typeof APP_VERSION, 'string');
  assert.ok(APP_VERSION.length > 0);
});

test('đọc được phiên bản công bố từ phản hồi JSON', async () => {
  const version = await fetchDeployedVersion(async () => response('{"version":"0.4.2"}'));
  assert.equal(version, '0.4.2');
});

test('luôn đọc kèm tham số phá cache và không dùng cache', async () => {
  let seenUrl = '';
  let seenInit: RequestInit | undefined;
  await fetchDeployedVersion(async (input, init) => {
    seenUrl = String(input);
    seenInit = init;
    return response('{"version":"1.0.0"}');
  });
  assert.ok(seenUrl.startsWith(DEPLOYED_VERSION_URL), seenUrl);
  assert.match(seenUrl, /\?ts=\d+/);
  assert.equal(seenInit?.cache, 'no-store');
});

test('SPA fallback trả HTML KHÔNG bị coi là có bản công bố', async () => {
  // Đây là lỗi đã gặp thật: máy chủ tĩnh trả `index.html` với mã 200 cho
  // `/data/version.json` khi file chưa được sinh. Nếu không kiểm tra
  // `content-type`, `response.json()` ném lỗi và bị nuốt ở `catch`, khiến lỗi
  // triển khai trông giống "đang ngoại tuyến".
  const html = '<!doctype html><html><body>Midori</body></html>';
  const version = await fetchDeployedVersion(async () =>
    response(html, { contentType: 'text/html; charset=utf-8' }),
  );
  assert.equal(version, null);
});

test('lỗi mạng, 404 và JSON hỏng đều trả về null thay vì ném lỗi', async () => {
  const failing = async (): Promise<Response> => {
    throw new TypeError('Failed to fetch');
  };
  assert.equal(await fetchDeployedVersion(failing), null);
  assert.equal(await fetchDeployedVersion(async () => response('', { status: 404 })), null);
  assert.equal(await fetchDeployedVersion(async () => response('không phải JSON')), null);
});

test('thiếu trường version hoặc version rỗng thì coi như không có bản công bố', async () => {
  assert.equal(await fetchDeployedVersion(async () => response('{}')), null);
  assert.equal(await fetchDeployedVersion(async () => response('{"version":""}')), null);
  assert.equal(await fetchDeployedVersion(async () => response('{"version":42}')), null);
});
