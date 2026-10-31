/**
 * Mọi màn hình trong `SCREENS` phải có ít nhất một lối vào trong giao diện.
 *
 * Test này ra đời sau một lỗi thật: `stats` và `editor` có đủ kiểu, component và
 * nhánh dựng trong `App.svelte`, nhưng không nút nào trỏ tới chúng. `svelte-check`
 * sạch và cả hai lớp test đều xanh, còn người dùng thì không mở được hai màn hình
 * đó — chúng chỉ hiện ra nếu bản lưu màn hình cũ trỏ đúng vào.
 *
 * # Đây là kiểm tra văn bản mã nguồn
 *
 * Nó bắt được lỗi "màn hình không có lối vào", KHÔNG bắt được lỗi "có nút nhưng
 * nút bị vô hiệu hoá" hay "nút nằm sau thanh điều hướng". Muốn bắt những lỗi đó
 * phải chạy trình duyệt thật; xem mục "Kiểm thử theo kích cỡ màn hình" trong
 * README. Giá trị ở đây là chặn đúng loại lỗi đã xảy ra, với chi phí bằng không.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

import { KANJI_CATEGORIES } from '../src/app/content-sections.ts';
import { SCREENS } from '../src/app/screen.ts';

const UI_DIR = new URL('../src/ui/', import.meta.url);

const uiSource = readdirSync(UI_DIR)
  .filter((name) => name.endsWith('.svelte'))
  .map((name) => readFileSync(new URL(name, UI_DIR), 'utf8'))
  .join('\n');

/**
 * Lối vào trực tiếp, một trong các hình thức:
 * - `app.go('<tên màn hình>')` từ một màn hình khác;
 * - `id: '<tên màn hình>'` trong bảng tab của điều hướng dưới (`App.svelte`);
 * - `app.goCollection(...)` cho `collection` — mọi phạm vi đều đi qua một hàm;
 * - `app.startSession(...)` cho `session` — Collection khởi động phiên qua đó.
 */
function hasDirectEntry(screen: string): boolean {
  if (
    new RegExp(`app\\.go\\(\\s*'${screen}'`).test(uiSource) ||
    new RegExp(`id:\\s*'${screen}'`).test(uiSource)
  ) {
    return true;
  }
  if (screen === 'collection') return /app\.goCollection\(/.test(uiSource);
  if (screen === 'session') return /app\.startSession\(/.test(uiSource);
  return false;
}

test('mọi màn hình đều có ít nhất một nút mở nó', () => {
  for (const screen of SCREENS) {
    assert.ok(hasDirectEntry(screen), `màn hình '${screen}' không có nút nào mở nó`);
  }
});

test('mọi màn hình đều có gói để nạp theo nhu cầu', () => {
  // Màn hình được tách thành gói riêng (`src/ui/screens.ts`). Nếu ai đó thêm một
  // màn hình vào `SCREENS` mà quên bảng nạp, triệu chứng sẽ là một màn hình trắng
  // chỉ hiện ra khi người dùng tới đúng chỗ đó — đúng loại lỗi mà test này sinh ra
  // để chặn. Đọc mã nguồn như văn bản vì file nạp tham chiếu tới component Svelte,
  // thứ mà `node --test` không biên dịch được.
  const source = readFileSync(new URL('../src/ui/screens.ts', import.meta.url), 'utf8');
  for (const screen of SCREENS) {
    assert.match(
      source,
      new RegExp(`^\\s*'?${screen}'?:`, 'm'),
      `'${screen}' không có bộ nạp trong src/ui/screens.ts`,
    );
  }
  // Và bảng nạp không được chứa khóa lạ (đổi tên màn hình mà quên xóa khóa cũ).
  const keys = [...source.matchAll(/^\s*'?([a-z-]+)'?: \(\) =>/gm)].map((match) => match[1]);
  assert.ok(keys.length >= SCREENS.length, `chỉ thấy ${keys.length} bộ nạp`);
  for (const key of keys) {
    assert.ok(
      (SCREENS as readonly string[]).includes(key as string),
      `bộ nạp '${key}' không ứng với màn hình nào trong SCREENS`,
    );
  }
});

test('bảy nhóm Kanji mở Collection của đúng bộ, không tự chạy phiên', () => {
  assert.equal(KANJI_CATEGORIES.length, 7);
  const overview = readFileSync(new URL('KanjiOverview.svelte', UI_DIR), 'utf8');
  // Mỗi hàng truyền ĐÚNG `deckId` của danh mục vào phạm vi Collection; không còn
  // bảy màn hình riêng để lệch tên.
  assert.match(overview, /app\.goCollection\(\{ kind: 'deck', deckId: row\.deckId \}\)/);
  // Màn danh mục không bắt đầu phiên — phiên chỉ chạy từ Collection.
  assert.doesNotMatch(overview, /startSession/);
});
