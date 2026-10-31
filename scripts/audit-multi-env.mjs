#!/usr/bin/env node
/**
 * Chạy `audit-layout.mjs` trên NHIỀU môi trường render rồi phân loại vi phạm.
 *
 * # Vì sao cần
 *
 * Ảnh chụp chuẩn là ảnh của MỘT môi trường render. Khi một vi phạm hiện ra, câu hỏi đầu
 * tiên luôn là: đây là thay đổi thật trong mã, hay chỉ là máy này vẽ khác máy đã chụp
 * chuẩn (phiên bản Chrome, bộ phông chữ, cách vẽ nét)? Đọc log một môi trường thì không
 * trả lời được — cả hai trường hợp đều là "lệch N pixel".
 *
 * Chạy hai lần trên hai cấu hình renderer KHÁC NHAU thì trả lời được: thay đổi thật trong
 * mã sẽ hiện ở CẢ HAI (mã nguồn là chung), còn khác biệt môi trường chỉ hiện ở một (môi
 * trường kia vẽ trùng với chuẩn). Đó là toàn bộ ý tưởng của
 * tệp này: chạy, so, rồi dán nhãn.
 *
 * # Cách dùng
 *
 *   npm run audit:multi-env                       # mặc định: Chrome thường + Chrome tắt subpixel positioning
 *   LAYOUT_RENDERER_PROFILES='[{"name":"chrome-154","binary":"/opt/chrome-154/chrome"}]' npm run audit:multi-env
 *   LAYOUT_VIEWPORTS=390x844 LAYOUT_SHOT_VIEWPORTS=390x844 npm run audit:multi-env   # chạy nhanh một khung nhìn
 *
 * `LAYOUT_RENDERER_PROFILES` là mảng JSON, mỗi phần tử `{ name, binary?, flags? }`.
 * Có `binary` thì dùng đúng tệp đó (đây là cách so hai phiên bản Chrome thật); không có
 * thì dùng `LAYOUT_CHROME` hoặc Chrome mặc định của máy. `flags` là cờ thêm vào — đây là
 * cách mô phỏng môi trường khác trên cùng một máy, và là mặc định ở đây vì hầu hết máy
 * chỉ có một bản Chrome.
 *
 * # Đọc kết quả
 *
 * Mỗi môi trường có một mục trong bảng: trình duyệt, cờ, số vi phạm, và độ nhiễu nội môi
 * trường (`LAYOUT_NOISE_RUNS`, mặc định 2 lần chụp lại mỗi trạng thái) — độ nhiễu cho
 * biết ngưỡng đang có bao nhiêu biên, tức là phương trình "nhiễu < ngưỡng < thay đổi
 * thật" còn đúng hay không.
 *
 * Sau đó là bảng phân loại theo từng trạng thái × loại vi phạm:
 * - **thật**: từ 2 môi trường trở lên cùng thấy — mã nguồn là chung, nên đây là thay đổi
 *   thật phải xử lý;
 * - **môi trường**: chỉ một môi trường thấy — đọc kèm độ nhiễu của chính môi trường đó;
 *   nếu độ nhiễu thấp mà vi phạm lớn thì vẫn phải xem, còn nếu vi phạm nhỏ đúng cỡ nhiễu
 *   thì đây là lúc cân nhắc làm mới chuẩn trong môi trường đích (CI) thay vì nới ngưỡng.
 *
 * # Mã thoát
 *
 * `0` chỉ khi MỌI môi trường đều sạch. Công cụ này để CHẨN ĐOÁN, không phải để làm xanh
 * pipeline: một vi phạm "chỉ một môi trường thấy" vẫn là vi phạm cần đọc, và tự động
 * cho nó qua thì lần sau không còn ai đọc bảng này nữa.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIT = join(ROOT, 'scripts', 'audit-layout.mjs');
const OUT_DIR = join(ROOT, 'layout-multi-env');

/**
 * Cấu hình mặc định: chính Chrome của máy, và cùng Chrome đó nhưng tắt định vị subpixel.
 *
 * Cờ thứ hai không phải trò trang trí: nó bắt Chrome vẽ nét chữ khác đi trong khi bố cục
 * giữ nguyên, đúng kiểu khác biệt giữa hai phiên bản Chrome. Đo được: nó làm chữ khác ở
 * hàng nghìn pixel nhưng KHÔNG làm lệch một khối bố cục nào — tức là nó thử đúng vào chỗ
 * khó nhất (so ảnh), không phải chỗ dễ (bố cục).
 */
const DEFAULT_PROFILES = [
  { name: 'chrome-mặc-định' },
  { name: 'chrome-tắt-subpixel', flags: ['--disable-font-subpixel-positioning'] },
];

function readProfiles() {
  const raw = process.env['LAYOUT_RENDERER_PROFILES'];
  if (raw === undefined || raw.trim() === '') return DEFAULT_PROFILES;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`LAYOUT_RENDERER_PROFILES không phải JSON hợp lệ: ${cause instanceof Error ? cause.message : cause}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('LAYOUT_RENDERER_PROFILES phải là mảng không rỗng, ví dụ \'[{"name":"chrome-154","binary":"/opt/chrome-154/chrome"}]\'');
  }
  return parsed.map((profile, index) => {
    if (typeof profile?.name !== 'string' || profile.name.trim() === '') {
      throw new Error(`LAYOUT_RENDERER_PROFILES[${index}] thiếu "name"`);
    }
    if (profile.binary !== undefined && !existsSync(profile.binary)) {
      throw new Error(`LAYOUT_RENDERER_PROFILES[${index}].binary không tồn tại: ${profile.binary}`);
    }
    const flags = profile.flags ?? [];
    if (!Array.isArray(flags) || flags.some((flag) => typeof flag !== 'string')) {
      throw new Error(`LAYOUT_RENDERER_PROFILES[${index}].flags phải là mảng chuỗi`);
    }
    return { name: profile.name, binary: profile.binary, flags };
  });
}

/**
 * Biến của chính lần chạy này được chuyển tiếp xuống từng môi trường.
 *
 * Gồm cả phạm vi đo (chạy nhanh một khung nhìn khi đang chẩn đoán) lẫn các ngưỡng — chuyển
 * tiếp ngưỡng là để THỬ chúng ("siết ngưỡng chữ xuống 0 thì môi trường nào đỏ?" là một
 * phép đo hay, xem README), không phải để môi trường này chạy luật khác môi trường kia
 * trong lúc kết luận.
 */
const FORWARD = [
  'LAYOUT_VIEWPORTS',
  'LAYOUT_SCREENS',
  'LAYOUT_SHOT_VIEWPORTS',
  'LAYOUT_SHOTS_DIR',
  'LAYOUT_SHOT_TOLERANCE',
  'LAYOUT_SHOT_TEXT_TOLERANCE',
  'LAYOUT_SHOT_TEXT_INK_TOLERANCE',
  'LAYOUT_SHOT_TEXT_INK_CHROMA',
  'LAYOUT_SHOT_TEXT_INK_CHROMA_BLOCKS',
  'LAYOUT_SHOT_TEXT_BUDGET',
  'LAYOUT_BASELINE_TOLERANCE',
];

function runProfile(profile, index) {
  const reportPath = join(OUT_DIR, `${String(index).padStart(2, '0')}-${profile.name}.json`);
  const logPath = join(OUT_DIR, `${String(index).padStart(2, '0')}-${profile.name}.log`);
  rmSync(reportPath, { force: true });

  const env = { ...process.env, LAYOUT_REPORT_JSON: reportPath, LAYOUT_NOISE_RUNS: process.env['LAYOUT_NOISE_RUNS'] ?? '2' };
  if (profile.binary !== undefined) env['LAYOUT_CHROME'] = profile.binary;
  env['LAYOUT_CHROME_FLAGS'] = (profile.flags ?? []).join(' ');
  for (const name of FORWARD) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }

  console.log(`\n=== ${profile.name}${env['LAYOUT_CHROME_FLAGS'] === '' ? '' : ` (${env['LAYOUT_CHROME_FLAGS']})`} ===`);
  const result = spawnSync(process.execPath, [AUDIT], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  // Log của từng môi trường được giữ lại để còn đọc chi tiết từng vi phạm.
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(logPath, output, 'utf8');

  if (!existsSync(reportPath)) {
    console.error(`  ✗ ${profile.name}: không có báo cáo (mã thoát ${result.status}); log: ${logPath}`);
    return { profile, status: result.status ?? 1, report: null, logPath };
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const summary = report.summary ?? {};
  const noise = report.noiseFloor;
  console.log(
    `  ${summary.violations === 0 ? '✓' : '✗'} ${report.renderer?.browser ?? '?'} · ${
      summary.violations ?? '?'
    } vi phạm · nhiễu nội môi trường: tối đa ${noise?.maxDelta ?? 0}/255, ${noise?.imageDiff ?? 0} pixel ngoài vùng chữ, ${noise?.textDiff ?? 0} pixel vùng chữ (${noise?.runs ?? 0} lần chụp lại)`,
  );
  return { profile, status: result.status ?? 0, report, logPath };
}

const profiles = readProfiles();
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const runs = [];
for (const [index, profile] of profiles.entries()) {
  runs.push(runProfile(profile, index));
}

/**
 * Khoá phân loại KHÔNG gồm câu chữ trong `detail`: hai môi trường có cùng một trạng thái
 * lệch nhưng thường lệch với số pixel khác nhau, nên so theo `detail` sẽ không bao giờ
 * khớp. Cái cần khớp là "trạng thái nào, phép kiểm nào".
 */
const keyOf = (violation) => `${violation.viewport}::${violation.screen}|${violation.check}`;
const counts = new Map();
for (const run of runs) {
  for (const violation of run.report?.violations ?? []) {
    const key = keyOf(violation);
    const entry = counts.get(key) ?? { key, environments: new Set(), checks: new Set(), samples: [] };
    entry.environments.add(run.profile.name);
    entry.checks.add(violation.check);
    if (entry.samples.length < 2) entry.samples.push(violation.detail);
    counts.set(key, entry);
  }
}

const minEnvironments = Number(process.env['LAYOUT_MULTI_ENV_MIN'] ?? 2);
const real = [...counts.values()].filter((entry) => entry.environments.size >= minEnvironments);
const environmentOnly = [...counts.values()].filter((entry) => entry.environments.size < minEnvironments);

console.log('\n=== Phân loại ===');
if (counts.size === 0) {
  console.log('Không có vi phạm nào ở mọi môi trường — ảnh chụp, hình học và cử chỉ đều khớp chuẩn ở cả hai.');
} else {
  const describe = (entry) => `${entry.key} · ${entry.checks.size > 1 ? [...entry.checks].join('+') : [...entry.checks][0]} · ${[...entry.environments].join(', ')}`;
  if (real.length > 0) {
    console.log(`THẬT (${real.length} — ${minEnvironments} môi trường trở lên cùng thấy):`);
    for (const entry of real.slice(0, 20)) console.log(`  · ${describe(entry)}`);
    if (real.length > 20) console.log(`  … và ${real.length - 20} mục nữa`);
    console.log('  → mã nguồn là chung cho mọi môi trường, nên nhóm này là thay đổi thật: sửa mã, hoặc làm mới chuẩn nếu đó là thay đổi có chủ ý.');
  }
  if (environmentOnly.length > 0) {
    console.log(`MỘT MÔI TRƯỜNG (${environmentOnly.length} mục):`);
    for (const entry of environmentOnly.slice(0, 20)) console.log(`  · ${describe(entry)}`);
    if (environmentOnly.length > 20) console.log(`  … và ${environmentOnly.length - 20} mục nữa`);
    console.log('  → đối chiếu với độ nhiễu nội môi trường in ở trên: nhỏ đúng cỡ nhiễu thì đây là khác biệt renderer,');
    console.log('    và cách xử lý đúng là LÀM MỚI CHUẨN TRONG MÔI TRƯỜNG ĐÍCH (rồi commit), không phải nới ngưỡng.');
  }
}

const failed = runs.filter((run) => run.status !== 0).length;
console.log(
  `\n${failed === 0 ? 'KẾT LUẬN: mọi môi trường đều XANH.' : `KẾT LUẬN: ${failed}/${runs.length} môi trường ĐỎ — xem bảng phân loại ở trên (chi tiết từng vi phạm trong ${OUT_DIR}/).`}`,
);
process.exit(failed === 0 ? 0 : 1);
