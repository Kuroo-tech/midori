import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

/**
 * Ghi `data/version.json` vào bản dựng — nguồn để `checkDeployedVersion()`
 * (`src/pwa/updates.ts`) biết nguồn công bố có bản mới hơn hay không.
 *
 * Vì sao cần: service worker chỉ phát hiện bản mới khi có tài nguyên được
 * precache thay đổi. Một bản phát hành chỉ đổi phiên bản (ví dụ sửa lỗi chỉ
 * trong dữ liệu tĩnh) sẽ không kích hoạt được cơ chế đó.
 *
 * File này KHÔNG được precache: nó phải luôn đọc từ mạng để việc kiểm tra có ý
 * nghĩa (`globPatterns` trong VitePWA không gồm `json`).
 *
 * Phiên bản lấy từ đúng `pkg.version` — cùng nguồn với `__APP_VERSION__`, nên
 * hai giá trị không thể lệch nhau.
 */
function writeDeployedVersion(): Plugin {
  return {
    name: 'midori-write-deployed-version',
    apply: 'build',
    writeBundle(options) {
      const outDir = options.dir ?? 'dist';
      mkdirSync(join(outDir, 'data'), { recursive: true });
      writeFileSync(
        join(outDir, 'data', 'version.json'),
        `${JSON.stringify({ version: pkg.version, builtAt: new Date().toISOString() }, null, 2)}\n`,
        'utf8',
      );
    },
  };
}

export default defineConfig({
  define: {
    // Phiên bản ứng dụng — dùng để so với /data/version.json (xem src/pwa/updates.ts).
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    svelte(),
    writeDeployedVersion(),
    VitePWA({
      // Cập nhật ỨNG DỤNG theo yêu cầu người dùng, không tự động reload.
      registerType: 'prompt',
      // src/pwa/updates.ts tự đăng ký service worker (cần bắt sự kiện).
      injectRegister: null,
      // public/manifest.webmanifest do dự án tự quản.
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,svg,png,webmanifest}'],
        // Nội dung xuất bản (/data/content/**) KHÔNG precache cùng ứng dụng:
        // nó do pipeline dữ liệu riêng quản lý, có phiên bản và kiểm tra toàn vẹn.
        globIgnores: ['**/data/content/**'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    // File .wasm phải là asset riêng, không được inline thành base64.
    assetsInlineLimit: 0,
  },
});