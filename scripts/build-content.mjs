#!/usr/bin/env node
/**
 * Biên dịch nội dung xuất bản từ nguồn duy nhất `content/`.
 *
 * Sinh RA HAI sản phẩm từ cùng một nguồn:
 *
 * 1. `public/data/content/**` — manifest + các gói, có `sha256` và số byte để
 *    pipeline cập nhật kiểm tra toàn vẹn. Đây là thứ được phục vụ trên web và là
 *    thứ ứng dụng tải khi có mạng.
 * 2. `src/generated/content-seed.json` — cấu trúc bundle và dữ liệu mặc định
 *    (các collection có thể rỗng), đóng vào bundle JS để lần chạy đầu tiên hoạt
 *    động ngoại tuyến mà không tự thêm thẻ mẫu vào thư viện.
 *
 * Nhờ vậy `content/` là nguồn sự thật duy nhất, không có hai bản dữ liệu phải
 * giữ khớp bằng tay.
 *
 * Chạy: `npm run content`
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateContent } from './content-validation.mjs';

export function buildContent(
  root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  log = console.log,
) {
  const outputDir = join(root, 'public', 'data', 'content');
  const seedPath = join(root, 'src', 'generated', 'content-seed.json');
  const validated = validateContent(root);

  const manifestBundles = [];
  const seedBundles = [];
  for (const { deckId, name, sourcePath, quiz, cards } of validated.bundles) {
    // Gói xuất bản dùng đúng định dạng file bộ thẻ mà lõi đã đọc được.
    const bundleText = `${JSON.stringify(
      { id: deckId, name, version: 1, cards },
      null,
      2,
    )}\n`;

    const outputPath = join(outputDir, sourcePath);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, bundleText, 'utf8');

    const bytes = Buffer.byteLength(bundleText, 'utf8');
    const sha256 = createHash('sha256').update(bundleText, 'utf8').digest('hex');

    manifestBundles.push({ deckId, name, path: sourcePath, bytes, sha256, quiz });
    // Thẻ trong seed giữ nguyên dạng nháp; lõi Rust sẽ dựng `Card` khi đồng bộ.
    seedBundles.push({
      deckId,
      name,
      quiz,
      cards,
      cardIds: cards.map((card) => card.id),
      sha256,
    });
  }

  const manifest = {
    schemaVersion: validated.schemaVersion,
    contentVersion: validated.contentVersion,
    generatedAt: new Date().toISOString(),
    bundles: manifestBundles,
  };
  writeFileSync(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  // `activatedAt` do ứng dụng đóng dấu khi thực sự cài đặt nội dung hạt giống.
  const seed = {
    schemaVersion: validated.schemaVersion,
    contentVersion: validated.contentVersion,
    activatedAt: 0,
    bundles: seedBundles,
  };
  mkdirSync(dirname(seedPath), { recursive: true });
  writeFileSync(seedPath, `${JSON.stringify(seed)}\n`, 'utf8');

  const totalCards = seedBundles.reduce((sum, bundle) => sum + bundle.cards.length, 0);
  const totalBytes = manifestBundles.reduce((sum, bundle) => sum + bundle.bytes, 0);
  log(`✓ Nội dung ${validated.contentVersion}: ${manifestBundles.length} collection, ${totalCards} thẻ mặc định, ${(totalBytes / 1024).toFixed(1)} KB`);
  for (const bundle of manifestBundles) {
    const count = seedBundles.find((seed) => seed.deckId === bundle.deckId)?.cards.length ?? 0;
    log(
      `  · ${bundle.deckId.padEnd(12)} ${String(count).padStart(3)} thẻ  ${bundle.sha256.slice(0, 12)}…  ${bundle.path}`,
    );
  }
  log(`✓ Seed ngoại tuyến: ${seedPath.replace(`${root}/`, '')}`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    buildContent();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`✗ ${message}`);
    process.exitCode = 1;
  }
}
