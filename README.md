# Midori

Ứng dụng flashcard Việt–Nhật **offline-first**, lõi nghiệp vụ bằng **Rust/WASM**,
giao diện bằng **Svelte 5**, đóng gói thành **PWA** cài được lên thiết bị.

Midori được xây dựng dựa trên khảo sát và kế thừa có chọn lọc từ **Mitsuha** — nhưng
không phải bản sao, không phải một đợt refactor, và không bị ràng buộc bởi các quyết
định kỹ thuật của dự án gốc.

> **Đang đọc ở phiên agent tiếp theo?** Đọc hết mục
> [Trạng thái hiện tại](#3-trạng-thái-hiện-tại), [Quyết định kiến trúc](#8-quyết-định-kiến-trúc-quan-trọng)
> và [Việc tiếp theo](#12-việc-tiếp-theo) trước khi đụng vào mã nguồn.

---

## Mục lục

1. [Midori là gì](#1-midori-là-gì)
2. [Bắt đầu nhanh](#2-bắt-đầu-nhanh)
3. [Trạng thái hiện tại](#3-trạng-thái-hiện-tại)
4. [Kiến trúc](#4-kiến-trúc)
5. [Cấu trúc thư mục](#5-cấu-trúc-thư-mục)
6. [Phân chia trách nhiệm Rust / WASM / JavaScript / PWA](#6-phân-chia-trách-nhiệm-rust--wasm--javascript--pwa)
7. [Lưu trữ và đồng bộ dữ liệu](#7-lưu-trữ-và-đồng-bộ-dữ-liệu)
8. [Quyết định kiến trúc quan trọng](#8-quyết-định-kiến-trúc-quan-trọng)
9. [Kiểm chứng: cách chạy và đã đo được gì](#9-kiểm-chứng-cách-chạy-và-đã-đo-được-gì)
10. [Quy ước mã nguồn](#10-quy-ước-mã-nguồn)
11. [Hạn chế đã biết và nợ kỹ thuật](#11-hạn-chế-đã-biết-và-nợ-kỹ-thuật)
12. [Việc tiếp theo](#12-việc-tiếp-theo)
13. [Tài liệu chuyên sâu](#13-tài-liệu-chuyên-sâu)

---

## 1. Midori là gì

### Mục tiêu

Học từ vựng và kanji tiếng Nhật cho người Việt, trên thiết bị, dùng được khi không
có mạng.

Định hướng cốt lõi:

- **Nhanh, nhẹ, hiệu quả.** Giảm dung lượng tải và độ trễ tương tác.
- **Rust làm lõi nghiệp vụ.** Logic thuật toán và xử lý dữ liệu nằm ở Rust, chạy
  trên thiết bị qua WebAssembly.
- **JavaScript chỉ làm giao diện.** DOM, sự kiện, điều phối, service worker.
- **Offline-first thật.** Ứng dụng khởi động và học được khi ngoại tuyến, kể cả lần
  chạy đầu tiên.
- **Không phá dữ liệu người học.** Cập nhật nội dung không bao giờ làm mất tiến độ.
- **Module hóa rõ ràng.** Mỗi lớp có trách nhiệm riêng và kiểm thử được độc lập.

### Phạm vi

Mặt trước tiếng Việt, mặt sau tiếng Nhật (có furigana và romaji). Có lặp lại ngắt
quãng (SM-2), nhập/xuất file, và quản lý nội dung học có phiên bản riêng.

### Không thuộc phạm vi (hiện tại)

Không có backend. Không có tài khoản. Không đồng bộ nhiều thiết bị. Không dùng
React, không dùng Flutter, không dùng framework CSS.

---

## 2. Bắt đầu nhanh

### Yêu cầu môi trường

| Công cụ | Phiên bản đã kiểm chứng | Dùng để |
|---|---|---|
| Node.js | 22.23.1 | Bundler, chạy test JS/TS |
| Rust + Cargo | 1.96.0 | Biên dịch lõi nghiệp vụ |
| `wasm32-unknown-unknown` | qua `rustup` | Đích biên dịch WASM |
| `wasm-pack` | 0.15.0 | Đóng gói WASM thành mô-đun ESM |

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --version 0.15.0 --locked
npm ci
```

### Lệnh thường dùng

```bash
npm run generate   # sinh lõi WASM + nội dung xuất bản (BẮT BUỘC chạy trước lần đầu)
npm run dev        # generate rồi mở dev server
npm run build      # generate rồi build bản phát hành vào dist/
npm run preview    # xem thử bản đã build (service worker hoạt động ở đây)
npm run check      # typecheck + toàn bộ test (Rust + JS); KHÔNG sinh sản phẩm build
npm run benchmark:core # benchmark filter/parse Rust-WASM trên dữ liệu tổng hợp
npm run audit:layout # đo bố cục trên 10 khung nhìn × 16 trạng thái màn hình
```

`npm run generate` là bước sinh riêng: `wasm-pack` biên dịch WASM và script biên
dịch nội dung. `npm run build` tự gọi `generate` trước `vite build`. `npm run check`
chỉ chạy typecheck, `cargo test --workspace` và `node --test`; trên checkout mới
cần chạy `npm run generate` trước check. CI làm theo đúng thứ tự đó.

Các lệnh chi tiết hơn:

```bash
npm run wasm       # chỉ build crates/midori-wasm → src/generated/midori-wasm/
npm run content    # chỉ biên dịch content/ → public/data/content/ + seed ngoại tuyến
npm run icons      # sinh lại biểu tượng PWA từ scripts/gen-icons.mjs
npm run typecheck  # svelte-check (kiểm tra cả .svelte và .svelte.ts)
npm run test:rust  # cargo test --workspace
npm run test:js    # node --test tests/*.test.ts
npm run content:audit # kiểm định và báo cáo độ phủ các bundle nguồn
npm run benchmark:core # đo filter/parse Rust-WASM trên dữ liệu tổng hợp
npm run audit:layout # kiểm thử bố cục theo kích cỡ màn hình + so ảnh chụp hình học và ảnh màn hình từng pixel với chuẩn; CI chạy ở job `layout` song song với `verify`, vi phạm làm pipeline đỏ
```

### Hai sản phẩm sinh tự động

Hai thư mục sau **không nằm trong git** và phải sinh lại sau khi clone:

| Đường dẫn | Sinh bởi | Vì sao tách khỏi mã nguồn |
|---|---|---|
| `src/generated/midori-wasm/` | `npm run wasm` | Là sản phẩm biên dịch, tái tạo được từ `crates/` |
| `src/generated/content-seed.json` | `npm run content` | Nội dung hạt giống, sinh từ nguồn duy nhất `content/` |

---

## 3. Trạng thái hiện tại

Cập nhật lần cuối: **1.0.4 — gộp màn Học vào Trang chủ** (chọn nội dung để học và
thẻ "Tiếp tục phiên đang dở" nay nằm trên Trang chủ; các nút "Chọn nội dung khác" đã
bỏ) nên còn **đúng ba mục lớn: Trang chủ · Nhập/xuất · Cài đặt**; **mục Thư viện của
Trang chủ chuyển sang Cài đặt** (lối vào Thống kê chi tiết và Trình biên tập thẻ, nhóm
"Công cụ" cũ bỏ hẳn), và **năm nhóm của Cài đặt rà lại cho đồng nhất** về thứ tự, bề
mặt và cách gập — mọi nội dung phụ (chi tiết thư viện, chi tiết kỹ thuật, tuỳ chọn
khác) dùng CHUNG một dòng gập, nội dung gập không nằm trong DOM; trước đó — màn Cài
đặt tái thiết kế theo mục đích (hàng cài đặt thay cho chuỗi thẻ, hai loại cập nhật tách
hẳn, xoá dữ liệu có bước xác nhận riêng); 1.0.3 — học theo bốn tầng (danh mục →
Collection theo phạm vi → phiên), Trang chủ ưu tiên hành động, màn Học chỉ còn danh
mục; chấm điểm theo mức, độ thành thạo tách khỏi lần làm bài, thống kê chi tiết chỉ
đọc; Phase 6 — nhập/xuất theo bài và nhóm, bỏ Dynamic Island, tối ưu màn học; màn
Nhập/xuất tái thiết kế thành ba tác vụ Nhập/Xuất/Sao lưu với luồng kiểm tra–xem
trước–xác nhận; chưa release-cleared**.

Trạng thái phản ánh **mức độ kiểm chứng thực tế**, không phải mức độ đã viết mã.

### Phase 1 — trạng thái đã đối chiếu mã nguồn

| Hạng mục | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| Kanji chỉ liệt kê bộ có `deckId` nhận diện là Kanji; không suy luận từ quiz `reading` | Đã sửa | Hàm lọc thuần có test; kiểm tra tương tác trình duyệt vẫn cần |
| Hướng mặt thẻ trong Editor | Đã sửa | Mặt trước = nghĩa Việt; mặt sau = chữ Nhật |
| Điều hướng chính ở Kanji/Stats/Editor | Đã sửa | Test hàm ánh xạ; Svelte check xác nhận giao diện |
| Thẻ lưu sai schema | Được cách ly có thể phục hồi | IndexedDB v2 có `recovery`; test fake IndexedDB cho đường thành công và transaction abort; Home có nút xuất bản ghi gốc |
| Backup cá nhân v1 | Đã triển khai; một lỗi cổng kiểm tra đã sửa | Kiểm tra schema, SRS/session tùy chọn; test round-trip và dữ liệu lỗi; restore thay cards/meta trong một transaction. **Đã sửa (vòng tái thiết kế màn Nhập/xuất):** `furigana`/`romaji` bị đòi khác rỗng, nên một thẻ không có cách đọc — kể cả thẻ Mẫu câu phát hành sẵn — làm CẢ file backup bị từ chối; xem mục “Tái thiết kế màn Nhập/xuất” bên dưới |
| File bộ thẻ chia sẻ | Tách khỏi backup cá nhân | Export chia sẻ tiếp tục không mang SRS; nhãn và cảnh báo restore ở màn Nhập/Xuất |
| Lỗi đồng bộ nội dung / lưu phiên | Không còn báo thành công giả | Retry và cảnh báo lỗi; test commit reconciliation lỗi rồi retry và helper lưu phiên |
| Lỗi lưu màn hình cuối cùng | Có cảnh báo thay vì nuốt lỗi | Lỗi chỉ ảnh hưởng màn hình được nhớ, không ảnh hưởng thẻ/SRS; kiểm tra tự động helper và cảnh báo UI |
| CI và toolchain | Đã cấu hình, chưa chạy trên GitHub trong phiên này | `.node-version`, `rust-toolchain.toml`, workflow CI; cần lần chạy CI từ remote để xác nhận |
| Smoke test Chromium backup/restore Phase 1 | Đã kiểm tra một phần | Restore hợp lệ/không hợp lệ đã thử; export cứu hộ và backup không tiến độ còn trong checklist |

### Phase 2 — trạng thái đã đối chiếu mã nguồn

| Hạng mục | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| Kiểm định nguồn content trước khi build | Đã triển khai | `scripts/content-validation.mjs`; validator chạy toàn bộ trước khi ghi output |
| Báo cáo độ phủ có thể tái tạo | Đã triển khai | `npm run content:audit`; số liệu hiện thời ở [docs/content-coverage.md](docs/content-coverage.md) |
| Quy trình nguồn/giấy phép nội dung | Đã ghi nhận; dữ liệu hiện tại chưa xác minh | Không bundle nào khai báo nguồn/giấy phép; xem [docs/content-governance.md](docs/content-governance.md) |
| Luồng ôn thẻ chưa thuộc | Đã thêm; Chromium smoke một phần | Quiz sai → Home weak count 1 → Study chọn phạm vi "Thẻ chưa thuộc" đúng 1 card → reload khôi phục queue/focus/revealed; SRS interval/repetitions/lapses không đổi |
| Tìm kiếm Rust | Có trong lõi | Tìm front/back/furigana/romaji/tags, không phân biệt hoa thường; chưa có giao diện tìm kiếm thư viện và chưa bỏ dấu tiếng Việt |
| Lọc theo bài và thẻ yếu | Có trong lõi / một phần giao diện | Bài chọn ở màn Bài học (Danh mục học → Từ vựng); phạm vi "Thẻ chưa thuộc" chọn ngay trong Study |
| Bảy nhóm Kanji | Danh mục đã có; dữ liệu chưa đủ | Có đủ bảy mục con theo loại từ; hiện chỉ `kanji-noun` có thẻ |
| Tìm kiếm, ẩn/khôi phục/xoá an toàn thẻ | Chưa hoàn thiện | Editor hiện chọn thẻ bằng danh sách; chưa có trạng thái ẩn hoặc thao tác xoá |
| Lịch sử trả lời/độ chính xác theo thời gian | Chưa có dữ liệu đủ | Lưu SRS hiện tại và dấu sai gần nhất, không lưu lịch sử từng lần trả lời |

### Phase 3 — hệ thống thiết kế và trải nghiệm (ghi nhận cũ, trước Phase 6)

| Hạng mục | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| Token Material-like và theme sáng/tối | Nền tảng đã có | Token tập trung ở `src/app.css`; không phải audit WCAG |
| Liquid Glass | Chỉ nav | Panel nổi trước đây đã bị loại bỏ ở Phase 6 |
| Chuyển động giảm | Đã xác nhận một phần trong Chromium production | Lần xác nhận cũ bao gồm giao diện trước Phase 6; chưa thử mọi loại chuyển cảnh hiện tại |
| Responsive/accessibility | Đã đo lại toàn bộ màn hình trên 10 khung nhìn, xem mục “Kiểm thử theo kích cỡ màn hình (vòng Phase 6)” | 0 tràn ngang, 0 cắt chữ, 0 nút không chạm tới được; Lighthouse accessibility 1.0 và axe-core sạch trên 16 trạng thái; screen-reader, thiết bị thật, zoom văn bản và browser khác còn thiếu |

Quy ước token, surface, motion và flashcard được ghi ở
[docs/design-system.md](docs/design-system.md). Không tuyên bố tuân thủ WCAG.

### Nền tảng và lõi — đã hoàn thành và đã kiểm chứng

| Hạng mục | Trạng thái | Kiểm chứng bằng |
|---|---|---|
| Workspace Rust (`midori-core`, `midori-wasm`) | Hoàn thành | `cargo test --workspace` — 131 test |
| Biên WASM, hợp đồng phong bì JSON | Hoàn thành | `tests/wasm-contract.test.ts` — 29 test, gọi WASM thật |
| Lịch SM-2 (đầy đủ luật, kể cả thứ tự cập nhật `ease`) | Hoàn thành | Test đơn vị Rust + test hợp đồng |
| Mô hình thẻ, di trú trường `reading` cũ | Hoàn thành | Test đơn vị Rust |
| Đọc file bộ thẻ JSON/CSV/TSV | Hoàn thành | Test đơn vị Rust (ô có dấu phẩy, BOM, CRLF, header linh hoạt) |
| Xuất file JSON/CSV | Hoàn thành | Test đơn vị Rust, có test khứ hồi |
| Thống kê, lọc, tìm kiếm, tóm tắt 50 bài | Hoàn thành | Test đơn vị Rust + test hợp đồng |
| Chấm câu trả lời (kể cả quy full-width) | Hoàn thành | Test đơn vị Rust + test hợp đồng |
| Trộn hàng đợi có seed xác định | Hoàn thành | Test đơn vị Rust, có test phân bố |
| Đồng bộ nội dung ↔ thư viện (`content_reconcile`) | Hoàn thành | Test đơn vị Rust + test hợp đồng |
| Pipeline cập nhật nội dung, kích hoạt nguyên tử | Hoàn thành | `tests/content-pipeline.test.ts` — 20 test |
| Lưu trữ IndexedDB tách đôi (người dùng / nội dung) | Hoàn thành | Quan sát trực tiếp trong trình duyệt |
| PWA: service worker, không precache nội dung | Hoàn thành | Đã dừng máy chủ rồi tải lại trang trong trình duyệt — xem bên dưới |
| Sinh `/data/version.json` cho kiểm tra bản công bố | Hoàn thành | `tests/pwa-version.test.ts` — 12 test + thao tác thật trên trình duyệt |
| Tải lại an toàn sau cập nhật ứng dụng | Hoàn thành | Thao tác thật trên trình duyệt: bản dựng mới → bấm cập nhật → không trắng trang |
| Giao diện: Trang chủ, Học, Nhập/Xuất, Cài đặt, Kanji, Thống kê, Editor | Smoke test Chromium một phần | Kanji chỉ hiện bộ `kanji-noun`; Editor đúng hướng mặt thẻ; backup hợp lệ báo thành công sau đổi màn; JSON lỗi không đổi thư viện |
| Lưu và khôi phục phiên học đang dở | Hoàn thành | 8 test đơn vị Rust + 9 test JS (`tests/session-storage.test.ts`) + thao tác thật trên trình duyệt |
| Khôi phục màn hình đang mở sau khi tải lại | Hoàn thành | Test JS cho hàm thuần + thao tác thật trên trình duyệt |
| Hệ thống thiết kế: token, chuyển động, giảm chuyển động | Hoàn thành | Thao tác thật trên trình duyệt, đo dung lượng CSS trong `vite build` |
| Mở lại sau khi trình duyệt thu hồi Cache Storage → tự cài lại precache | Hoàn thành | Thao tác thật trên trình duyệt; tìm thấy và sửa lỗi mất khả năng ngoại tuyến (xem [verification.md](docs/verification.md) mục 9) |

### Phase 4 — hiệu năng, độ tin cậy và phát hành

| Hạng mục | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| Benchmark tổng hợp filter/parse Rust-WASM | Đã thêm, đo trên workstation | `npm run benchmark:core`; 1k/10k/50k, 3 warm-up + 15 mẫu; không đại diện điện thoại |
| Startup và tài nguyên production | Đã đo một baseline Chromium cục bộ | 7 cold / 15 warm; navigation visible median 133/99 ms; proxy không phải thiết bị thật, chi tiết ở [release-readiness.md](docs/release-readiness.md) |
| Offline refresh sau khi service worker kiểm soát trang | Đã smoke trên Chromium production preview | Home và 36-card library hiển thị khi reload ngoại tuyến; không thay cho install/browser matrix |
| Lỗi lưu tùy chọn màn hình cuối | Đã sửa và test sau sửa | UI báo lỗi có thể đóng; nguyên nhân được log; không ảnh hưởng thẻ/SRS/session |
| Clean checkout, CI remote, Firefox/Safari/thiết bị thật, quota thật | Chưa xác minh | Không có `.git` metadata trong workspace nên không đẩy được lên runner; bước audit bố cục trong CI vì vậy mới chỉ chạy đúng khối lệnh của nó bằng `bash -e` tại chỗ, chưa chạy trên image thật; xem release checklist |
| Quy trình phát hành | Đã ghi checklist, chưa release-cleared | [docs/release-readiness.md](docs/release-readiness.md); provenance content chưa xác minh |

### Phase 6 — nhập/xuất theo phạm vi và bỏ Dynamic Island

| Hạng mục | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| Nhập một bài từ vựng | Đã thêm | Chọn bài 1–50; mọi thẻ trong file được gán vào bài đó |
| Nhập/xuất toàn bộ từ vựng | Đã thêm | JSON giữ số bài trên từng thẻ; thiếu số bài hợp lệ thì từ chối nhập |
| Nhập/xuất một mục Kanji | Đã thêm | Chọn một trong bảy deck Kanji |
| Nhập/xuất nhiều hoặc tất cả mục Kanji | Đã thêm | Gói JSON `bundles[]` với `deckId` và `cards`; các nhóm được phân tích trước rồi ghi thư viện trong một giao dịch |
| Xuất nhiều mục Kanji | Đã thêm | Gói JSON giữ danh tính deck; CSV chỉ dùng cho một mục |
| Dynamic Island và overlay history | Đã gỡ | Thay bằng header trang và nút Back thường; điều hướng màn hình vẫn dùng History API |
| Điều khiển phiên học | Đã chuyển | Tiến độ và “Thẻ tiếp theo” nằm ở đầu màn học, phía trên thẻ |

### Ba mục điều hướng — gộp Học vào Trang chủ, Thư viện về Cài đặt (1.0.4)

Mục **Học** không còn là tab riêng: phần chọn nội dung để học (ba chủ đề + hàng "Tất
cả nội dung") và thẻ "Tiếp tục phiên đang dở" nay nằm ngay trên Trang chủ, nên còn
**đúng ba mục lớn** — Trang chủ · Nhập/xuất · Cài đặt. Mục **Thư viện** của Trang chủ
chuyển sang Cài đặt cùng hai lối vào của nó (Thống kê chi tiết, Trình biên tập thẻ);
nhóm "Công cụ" cũ bỏ hẳn nên Trình biên tập thẻ chỉ còn MỘT lối vào.

Thanh điều hướng dưới dùng lưới **ba cột** thay cho bốn cột cũ. Bốn cột với ba tab để
lại một cột trống ở bên phải, làm cả ba tab dồn về một phía; nay mỗi tab chiếm đúng
một phần ba bề ngang.

Chủ đề **Mẫu câu** cũng mở màn chọn bài 1–50 như Từ vựng thay vì đi thẳng vào một bộ
duy nhất. Cấu trúc vẫn có đủ 50 bài dù dữ liệu mặc định để trống; câu chỉ xuất hiện
sau khi người dùng tự thêm hoặc nhập. Con số trên hàng chủ đề vẫn lấy từ `deckStats`
của lõi.

Năm nhóm của Cài đặt được rà lại theo ba trục: **thứ tự** (việc hằng ngày trước, thao
tác không hoàn tác được cuối), **bề mặt** (mỗi nhóm là một tiêu đề nhóm + đúng MỘT
`.panel`, chỉ Quản lý dữ liệu mang sắc cảnh báo), và **cách gập** (mọi nội dung phụ
dùng chung một dòng `.advanced-toggle` cao 52px, nhãn tự đổi thành "Ẩn …", mở bằng
`{#if}` nên nội dung gập không nằm trong DOM).

| Hạng mục | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| Bản lưu màn hình cũ (`study`) | Đã di trú | `normalizeScreen('study') === 'home'` có test; kiểm thật trên Chrome: ghi `meta.screen = 'study'` rồi tải lại → về Trang chủ, tab Trang chủ được đánh dấu |
| Màn con thuộc mục nào | Đã kiểm | Bài học/Mẫu câu/Kanji/Collection/Phiên học → Trang chủ; Thống kê/Trình biên tập → Cài đặt (test `navigationSection` + `backFallback`, và bấm thật để đọc `aria-current`) |
| Phiên đang dở trên Trang chủ | Đã kiểm | Thẻ "Tiếp tục phiên đang dở" là lối vào DUY NHẤT (vùng hành động không lặp lại trạng thái "đang dở"); bấm thẻ mở đúng màn phiên học |
| Không còn nút trỏ vào màn đã xoá | Đã kiểm | Test `screen-reachability` (mọi màn hình còn lối vào) + quét mã nguồn: không còn `app.go('study')` |
| Cài đặt: năm nhóm đồng nhất | Đã kiểm | Cùng tiêu đề nhóm + MỘT `.panel`; bốn nhóm thường cùng màu bề mặt, chỉ Quản lý dữ liệu khác; cả ba dòng gập dùng chung `.advanced-toggle` và cao bằng nhau |
| Nội dung gập không nằm trong DOM | Đã kiểm | Kiểm thật: `#settings-library-detail`, `#settings-about-detail`, `#content-advanced` vắng mặt khi đóng và có mặt khi mở |
| Chuẩn bố cục và ảnh chụp | Đã làm mới | `LAYOUT_UPDATE_BASELINE=1 LAYOUT_UPDATE_SHOTS=1 npm run audit:layout`, rồi `npm run audit:layout`: **0 vi phạm** trên 16 màn hình × 10 khung nhìn (160 trạng thái hình học, 160 ảnh chuẩn, kể cả 90 bước vuốt ở Nhập/xuất) |
| Hai cấu hình render | Đã kiểm | `npm run audit:multi-env`: cả Chrome mặc định và Chrome tắt subpixel đều **0 vi phạm**, nhiễu nội môi trường 0/255 |
| Ngoại tuyến sau khi cài service worker | Đã kiểm | Tắt hẳn máy chủ rồi tải lại: vẫn dựng đủ ba tab, khôi phục phiên đang dở, lật thẻ và chấm điểm được; 39 mục precache |
| Accessibility tự động | Đã kiểm | Lighthouse accessibility **1.0** trên Trang chủ; axe-core 4.10.3 **0 vi phạm** trên 16 trạng thái (WCAG 2.0/2.1 A+AA). Chưa thay thế trình đọc màn hình/thiết bị thật |
| Test tự động | Xanh | `npm run check`: svelte-check **0 lỗi, 0 cảnh báo**; Rust **190+4**; JS **180** |
| Ảnh chụp để mắt người xem | Chưa có | Kết luận dựa trên số đo, DOM/cây trợ năng và so ảnh từng pixel với chuẩn; chưa có lần xem bằng mắt trên thiết bị thật |

### Tái thiết kế màn Nhập/xuất — ba tác vụ, vùng chọn file gọn, có bước kiểm tra

Vấn đề gốc không phải kích thước từng nút mà là **cấu trúc**: bốn khối (chọn phạm vi,
nhập thẻ, xuất thẻ, backup) nằm chồng lên nhau trong một cột, nên người muốn nhập một
file phải cuộn qua cả biểu mẫu xuất lẫn hai nút backup — ba việc không bao giờ làm
cùng lúc. Trên điện thoại trang cao **1.372px** (390×844) và **1.494px** (320×568).

Thay đổi chính:

- **Ba tác vụ trên một thanh chọn: Nhập · Xuất · Sao lưu.** Mỗi lúc chỉ một tác vụ
  hiện ra (`src/ui/Transfer.svelte`). Đổi tác vụ KHÔNG xoá phạm vi hay file đang chờ;
  thẻ Nhập hiện một dấu chấm khi còn file chờ kiểm tra.
- **Một bộ chọn phạm vi duy nhất** (`src/ui/TransferScope.svelte`) dùng cho cả nhập và
  xuất, nên "Bài 12" chỉ có một nghĩa; cử chỉ vuốt ngang thuộc về nó ở cả hai tác vụ.
- **Vùng chọn file gọn trên điện thoại**: một hàng thấp thay cho khung kéo thả cao;
  từ 720px mới nới ra và mời kéo thả. Sau khi chọn file, khung tải file rỗng được THAY
  bằng trạng thái của file đó (tên, định dạng, dung lượng, số bản ghi hợp lệ, số bản ghi
  bị bỏ, số thẻ trùng, phạm vi đích, xem trước 5 thẻ đầu, và các nút Nhập/Chọn file
  khác/Huỷ).
- **Luồng nhập có bước kiểm tra trước khi ghi**: chọn phạm vi → chọn file → kiểm tra
  (đọc file + LẬP KẾ HOẠCH NHẬP, chưa ghi gì) → xem trước → xác nhận → kết quả thật.
  Con số ở bước xem trước và con số sau khi nhập cùng đi qua một hàm lập kế hoạch
  (`AppStore.previewImport` / `#planImportBatches`), nên không thể lệch nhau.
- **Số bản ghi bị bỏ qua do lõi đếm**: `ImportResult.skipped` mới trong Rust
  (`crates/midori-core/src/import.rs`) đếm bản ghi thiếu mặt thẻ/mặt nghĩa cho cả JSON
  lẫn CSV/TSV, nên giao diện không phải đoán lại luật đọc của từng định dạng.
- **Sao lưu tách hẳn khỏi xuất thẻ**: thẻ Xuất nói rõ file xuất không kèm lịch ôn tập;
  thẻ Sao lưu nói rõ file chứa gì và tác động của công tắc tiến độ. Khôi phục nay
  KIỂM TRA file trước (hợp lệ? bao nhiêu thẻ? có tiến độ? tạo lúc nào? có phiên hết
  hạn?) rồi mới hỏi xác nhận bằng một bảng cảnh báo trong ứng dụng — thay cho
  `window.confirm` cũ — kèm nút tải bản sao lưu hiện tại trước.
- **Hướng dẫn định dạng file gập lại** sau một dòng `Định dạng file và quy tắc trùng`,
  thay vì luôn chiếm chỗ.
- **Luật đọc file được tách khỏi component** sang `src/app/transfer.ts` (gán bài, chọn
  nhóm Kanji, chọn tập thẻ để xuất) để kiểm thử được bằng `node --test`.

| Hạng mục | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| Chiều cao màn trên điện thoại | Giảm mạnh | `npm run audit:layout`: trang còn **610px** ở 320×568 (trước 1.494), **844px** ở 390×844 (trước 1.372 — nay vừa đúng một màn hình, không phải cuộn), và không cuộn ở 768×1024/1024×768/1440×900 |
| Luồng kiểm tra – xem trước – xác nhận | Đã kiểm tra trên trình duyệt | Chọn file CSV hợp lệ: “2 thẻ sẽ được thêm vào toàn bộ Từ vựng”; chọn lại chính file đó: “0 thẻ sẽ được thêm”, “2 thẻ đã có, bỏ qua”, nút Nhập bị vô hiệu kèm giải thích |
| File sai định dạng / JSON hỏng | Đã kiểm tra | `.xlsx` → “Chỉ hỗ trợ .json, .csv và .tsv”; JSON hỏng → lỗi cấu trúc; thư viện không đổi |
| Bản ghi thiếu mặt thẻ | Đã kiểm tra | File 3 phần tử (1 hợp lệ) → “1 thẻ sẽ được thêm”, “2 bản ghi trong file thiếu mặt thẻ hoặc mặt nghĩa — không nhập” |
| Đổi phạm vi khi đang có file chờ | Đã kiểm tra | Đổi Từ vựng → Kanji: file giữ nguyên và được kiểm tra lại, đích đổi thành “Danh từ”; chọn Bài 3 → ghi rõ “Gán mọi thẻ trong file vào bài 3” và bản xem trước mang “Bài 3” |
| Đổi tác vụ khi có dữ liệu chưa xác nhận | Đã kiểm tra | File đang chờ sống qua lần đổi tác vụ; thẻ Nhập mang dấu chấm và `aria-label` “có file đang chờ” |
| Xuất theo từng phạm vi | Đã kiểm tra, đọc lại nội dung file | Bài 3 → `midori-2026-10-17.json` 5 thẻ, `name` = “Từ vựng · Bài 3”, `version: 2`, **không** có `srs`; nhãn nút là “Xuất 5 thẻ · Bài 3”; Bài 12 (trống) → “Xuất 0 thẻ”, nút vô hiệu |
| Xuất CSV và giới hạn định dạng | Đã kiểm tra | CSV chỉ hiện khi phạm vi giữ được số bài; chọn CSV rồi đổi sang “Toàn bộ từ vựng” thì định dạng tự về JSON và ô CSV bị khoá |
| Xuất gói nhiều nhóm Kanji | Đã kiểm tra | `midori-kanji-2026-10-17.json` với `bundles` giữ `deckId` từng nhóm; nhãn “Xuất 8 thẻ · gói nhiều nhóm Kanji” |
| Tạo backup | Đã kiểm tra | 10 khoá đúng như `createBackup` (format, version, createdAt, includeProgress, cards, settings, contentSync, screen, session, collectionScope), `srs` chỉ có khi bật tiến độ |
| Khôi phục backup hợp lệ | Đã kiểm tra trên trình duyệt | Bảng kiểm tra: “Bản sao lưu hợp lệ · 39 thẻ · có tiến độ học · Tạo lúc 08:28 17/10/26”; cảnh báo ghi rõ số thẻ hiện có sẽ bị thay; sau khi khôi phục ứng dụng mở lại màn hình lưu trong file và thư viện hiện đúng 39 thẻ |
| Khôi phục file không hợp lệ | Đã kiểm tra | File bộ thẻ (không phải backup) → “Đây không phải file backup cá nhân của Midori. Thư viện hiện tại chưa bị thay đổi.” |
| File quá lớn | Đã thêm trần | Nhập: 12 MB, backup: 32 MB; vượt trần là một thông báo rõ ràng thay vì đọc file không bao giờ xong (đã thử với file 13 MB) |
| Ngoại tuyến | Không đổi hành vi | Cả ba tác vụ chỉ dùng WASM + IndexedDB: không có yêu cầu mạng nào trong lúc nhập/xuất/sao lưu (kiểm qua log mạng của trình duyệt) |
| Kiểm thử tự động | Thêm 18 test JS (bộ JS nay 171 test, Rust 176+4) | `tests/transfer.test.ts` (15 test mới, chạy trên WASM thật), 1 test hợp đồng cho `skipped` trong `tests/wasm-contract.test.ts`, 2 test backup cho thẻ không có furigana/romaji trong `tests/backup.test.ts`; Rust: 3 test mới trong `crates/midori-core/src/import.rs` |
| Ảnh chụp hình học và ảnh màn hình | Đã làm mới có chủ ý | `LAYOUT_SCREENS=transfer LAYOUT_UPDATE_BASELINE=1 LAYOUT_UPDATE_SHOTS=1 npm run audit:layout`; sau đó `npm run audit:layout` đầy đủ: **0 vi phạm** trên 150 trạng thái — 14 màn hình khác không đổi một pixel |
| Ảnh chụp màn hình để mắt người xem | Chưa có | Phiên này không chụp được khung hình từ webview (không composite); mọi kết luận về bố cục dựa trên số đo, cây trợ năng và so ảnh từng pixel với chuẩn. Cần một lần xem bằng mắt trên thiết bị thật |

### Tái thiết kế màn Cài đặt — phân cấp theo mục đích, không theo cách triển khai

Vấn đề gốc không phải kích thước chữ hay đệm của từng thẻ mà là **thứ bậc**: năm
khu vực đều là `.card` có viền, tiêu đề và badge giống hệt nhau, nên "số thẻ mới mỗi
ngày" và "phiên bản lõi Rust" có cùng trọng lượng thị giác; ba thiết lập thường dùng
nằm rải trong biểu mẫu; hai loại cập nhật (ứng dụng và nội dung) chung một khối với
hai tab; và thao tác không thể hoàn tác nằm cạnh những nút bấm hằng ngày.

Thay đổi chính (một tệp, `src/ui/Settings.svelte`):

- **Năm nhóm theo việc người dùng muốn làm**: Học tập · Công cụ · Cập nhật · Thông
tin ứng dụng · Quản lý dữ liệu. Tiêu đề nhóm nhỏ, không badge.
- **Hàng cài đặt thay cho thẻ lặp**: ba thiết lập học tập nằm trong MỘT bề mặt phẳng
phân cách bằng viền; giao diện là thanh chọn ba lựa chọn hiện cùng lúc
(`aria-pressed`) thay cho `<select>`; trộn thứ tự dùng lại công tắc chung `.switch`.
- **Số thẻ mới được kiểm tra đầu vào tại giao diện**: không phải số → từ chối và trả
ô về giá trị đang dùng (kèm thông báo, `aria-invalid`); ngoài 0–`MAX_DAILY_NEW_LIMIT`
→ kẹp lại và nói rõ đã kẹp. Trần lấy từ `MAX_DAILY_NEW_LIMIT` của tầng lưu trữ, không
chép lại con số 500 trong markup.
- **Cập nhật tách thành HAI khối, không phải hai tab**: *Ứng dụng* (bản dựng; cần tải
lại trang) và *Nội dung học* (không cần). Mỗi khối có phiên bản, trạng thái và hành
động riêng; **nút “Cập nhật và tải lại” chỉ tồn tại khi thật sự có bản chờ kích hoạt**,
và không lần kiểm tra nào báo thành công thay cho một lần cập nhật thật. Tuỳ chọn ít
dùng (quay lại bản nội dung trước, cài lại nội dung đi kèm, thống kê đồng bộ gần nhất)
nằm sau dòng “Tuỳ chọn khác”.
- **Thông tin ứng dụng gập lại**, phiên bản ứng dụng vẫn hiện trên dòng tiêu đề; giá
trị đọc từ nguồn thật (`APP_VERSION`, `app.coreVersion`, `app.content.contentVersion`,
`app.cards`).
- **Quản lý dữ liệu tách hẳn xuống cuối**, bề mặt mang sắc `--danger-soft`, xác nhận
tại chỗ ghi rõ số thẻ sẽ mất, và mô tả đúng phạm vi: xoá thẻ + lịch ôn + phiên đang
dở; giữ cài đặt và bản ghi cứu hộ.
- **Ghi cài đặt tuần tự** (`AppStore.updateSettings` xếp hàng): `saveSettings` là
đọc–gộp–ghi nên hai lần gọi chồng nhau làm mất một thay đổi; điều khiển vì thế KHÔNG
bị khoá trong lúc chờ — khoá lại sẽ nuốt phím người dùng vừa bấm.
- **`eraseLibrary` xoá cả phiên học đang dở.** Trước đây nó chỉ xoá thẻ và mốc đồng
bộ, nên sau khi “xoá sạch tiến độ” Trang chủ vẫn mời "tiếp tục phiên" trỏ vào những
thẻ vừa bị xoá. Đây là sửa lỗi trạng thái dở dang, không phải mở rộng phạm vi: phiên
dở chính là tiến độ học.

| Hạng mục | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| Chiều cao màn (10 khung nhìn) | Thấp hơn bản cũ trên mọi khổ rộng; cao hơn ở khổ rất hẹp | `npm run audit:layout`: 1024×768 và 1440×900 **1232 → 1201**; 768×1024 **1252 → 1218**; 844×390 nằm ngang **1253 → 1219**; 390×844 **1329 → 1365** (+36); 320×568 **1388 → 1495** (+107, do năm tiêu đề nhóm mới cộng thêm) |
| Phân cấp và nhóm | Đã kiểm tra trên trình duyệt | Cây trợ năng đọc đúng năm nhóm (`HỌC TẬP`, `CÔNG CỤ`, `CẬP NHẬT`, `QUẢN LÝ DỮ LIỆU`, mục gập `Thông tin ứng dụng`); không còn khu vực nào dùng chung khuôn `.card` |
| Giao diện (ba chế độ) | Đã kiểm tra | Bấm “Tối” → `data-theme=dark` và `aria-pressed` đổi theo; bấm “Sáng” → `light`; sau `location.reload()` giá trị còn nguyên trong IndexedDB |
| Số thẻ mới tối đa | Đã kiểm tra | `999` → kẹp `500` kèm dòng “Đã giới hạn trong khoảng 0–500 thẻ”; `-5` → `0`; ô trống → từ chối, trả về giá trị đang dùng, `aria-invalid=true`; Collection đọc lại đúng “Tối đa 20 thẻ mới/ngày; thẻ đã học không bị giới hạn” |
| Trộn thứ tự | Đã kiểm tra | Bật/tắt ghi đúng `shuffleByDefault`; ba thay đổi liên tiếp (giao diện → số thẻ → công tắc) đều được lưu nhờ hàng đợi ghi tuần tự |
| Mở trình biên tập thẻ | Đã kiểm tra | Hàng Công cụ mở màn `Trình biên tập thẻ`, tab dưới vẫn đánh dấu `Cài đặt`, nút Back đưa về đúng Cài đặt |
| Kiểm tra bản mới khi không có bản mới | Đã kiểm tra | “Đang chạy bản mới nhất (1.0.3).”; nút “Cập nhật và tải lại” không xuất hiện vì không có gì chờ kích hoạt |
| Kiểm tra bản mới khi ngoại tuyến | Đã kiểm tra | Tắt máy chủ rồi kiểm tra: “Không kiểm tra được bản công bố (có thể đang ngoại tuyến).” — không báo thành công giả |
| Kiểm tra nội dung | Đã kiểm tra | “Đang là bản mới nhất (2026.10.12.1).”; ngoại tuyến: “Không có mạng. Vẫn dùng nội dung đang có trên thiết bị.” |
| Phân biệt hai loại cập nhật | Đã kiểm tra | Hai khối riêng, hai trạng thái riêng; khối Ứng dụng nói rõ cần tải lại trang, khối Nội dung nói rõ không cần |
| Thông tin ứng dụng | Đã kiểm tra | Mở rộng cho đúng giá trị thật: phiên bản ứng dụng/lõi và số collection/thẻ đang có; thư viện mới bắt đầu rỗng |
| Xoá dữ liệu | Đã kiểm tra trên trình duyệt | Bấm “Xoá thư viện…” → hỏi xác nhận theo đúng số thẻ đang có; “Huỷ” giữ nguyên dữ liệu; “Xác nhận xoá” → `cards` 0, `meta.session` bị xoá, `meta.settings` còn nguyên |
| Tạo lại nội dung sau khi xoá | Đã kiểm tra | Tải lại trang vẫn giữ thư viện trống; seed chỉ cài cấu trúc collection rỗng, không hồi sinh dữ liệu mẫu |
| Không còn phiên “ma” sau khi xoá | Đã kiểm tra | Chấm một thẻ trong phiên (session có trong IndexedDB) → xoá thư viện → Trang chủ hiện “Thư viện đang trống”, không còn thẻ "tiếp tục phiên" |
| Ngoại tuyến | Đã kiểm tra | Tắt máy chủ, tải lại: màn Cài đặt dựng đủ bốn nhóm với CSS đúng (service worker phục vụ), và cả hai nút kiểm tra đều trả về trạng thái ngoại tuyến thật |
| Chuẩn bố cục và ảnh chụp | Đã làm mới có chủ ý | `LAYOUT_SCREENS=settings LAYOUT_UPDATE_BASELINE=1 LAYOUT_UPDATE_SHOTS=1 npm run audit:layout`; landmark `.update-picker` được thay bằng `.segmented` trong `scripts/audit-layout.mjs` |
| Kiểm thử tự động | Typecheck + test hiện có, không thêm test JS | `npm run check`: svelte-check **0 lỗi**, Rust **176+4** test, JS **171** test — màn Cài đặt không có hàm thuần mới nào (logic kẹp giá trị dựa trên `normalizeSettings` đã có test) |

### Kiểm thử theo kích cỡ màn hình (vòng Phase 6)

Cách kiểm chứng: **10 khung nhìn** từ 320×568 đến 1440×900 — gồm cả hai khung nhìn nằm
ngang 844×390 và 667×375 — × **15 trạng thái màn hình** (Trang chủ ở hai trạng thái
rảnh / đang dở; Học; Bài học; Kanji; Collection ở bốn phạm vi — tất cả nội dung / một
bài / một nhóm Kanji / nhóm chưa có nội dung; phiên học ở hai trạng thái ẩn thẻ / đã
lật; Nhập/xuất; Cài đặt; Thống kê chi tiết; Trình biên tập thẻ). Mỗi tổ hợp được đo ở
cả đầu trang và đáy trang.
Bộ đo **nay là một script trong kho**, chạy lại được: `npm run audit:layout`
(`scripts/audit-layout.mjs`). Trước đây nó chỉ tồn tại như một lần chạy tay, nên
không lần sau nào tái lập được. Script dùng WebSocket có sẵn của Node 22 nói chuyện
với Chrome qua giao thức DevTools (không thêm dependency), dựng từng trạng thái màn
hình bằng cách ghi `meta.screen`/`meta.session` trong IndexedDB rồi tải lại — nhờ vậy
nó bám vào schema lưu trữ chứ không bám vào câu chữ trên giao diện. Nó kiểm: tràn
ngang, cắt chữ do `overflow`, thanh cuộn mọc bên trong mặt thẻ, vùng chạm dưới 32px,
nhãn điều hướng bị cắt, phần tử nằm sau thanh điều hướng cố định, và **nút không chạm
tới được** (`elementFromPoint` tại tâm nút không trả về chính nút đó — đúng loại lỗi
mà đọc CSS không thấy).

Ở màn Nhập/xuất, script còn **mô phỏng chín bước vuốt ngang** và kiểm hai thứ có thể
sai một cách im lặng: mục nào được chọn sau mỗi lần vuốt (theo chỉ số nút, không theo
nhãn), và khối nội dung trượt vào theo chiều nào (`+1` = từ phải sang, `-1` = từ trái
sang). "Không đổi chủ đề" được kiểm bằng **danh tính phần tử** của khối nội dung —
cách duy nhất phân biệt "không có gì xảy ra" với "đổi rồi nhưng nội dung trông giống
nhau"; nếu chỉ đọc dịch ngang thì hiệu ứng còn dang dở của lần đổi trước sẽ làm kết quả
sai. Chín bước phủ các nhánh có thể hỏng: tới mục sau, quay lại mục trước, vuốt ngắn
dưới ngưỡng, vuốt bắt đầu trên ô chọn, vuốt xiên (dọc trội hơn), và dừng ở cả hai đầu
danh sách.

Mặc định nó tự chạy `vite preview` trên một cổng trống; đặt `LAYOUT_BASE_URL` để đo
trên `npm run dev` đang chạy. Nó thoát mã 1 khi có vi phạm.

**Ảnh chụp hình học làm chuẩn.** Các phép kiểm ở trên đều trả lời "có/không", nên một
khối cao thêm 20px hay lệch sang trái 30px mà vẫn "không vi phạm gì" thì lọt qua — đúng
loại thay đổi mà một lần sửa bố cục vô ý tạo ra. Vì vậy mỗi trạng thái còn được chụp
lại **hình học** của bộ xương bố cục (`main.screen`, các khối con trực tiếp, thanh điều
hướng, vài khối đặc trưng) và so với `scripts/layout-baseline.json` đã commit: lệch quá
**6px** ở `top`/`left`/`width`/`height` là vi phạm, khối mất đi hay mới xuất hiện cũng
là vi phạm. Ảnh chụp ghi toạ độ chứ **không** ghi chữ — chữ đổi nội dung là chuyện bình
thường. Đo được tại chỗ: đổi đệm trên cùng của `.screen` từ 12px lên 20px làm
**284 phép đo lệch trong khi 0 phép kiểm "có/không" nào đỏ** (con số hình học dao động
vài phép giữa các lần chạy vì làm tròn bố cục) — đây chính là vùng mù mà
ảnh chụp bịt lại. Bố cục đổi là điều mình muốn thì làm mới chuẩn bằng
`LAYOUT_UPDATE_BASELINE=1 npm run audit:layout` rồi commit tệp chuẩn (đừng nới
`LAYOUT_BASELINE_TOLERANCE` cho pipeline xanh trở lại).

**Ảnh chụp màn hình — pixel ngoài vùng chữ, ba thước đo khối trong vùng chữ.** Hình học
ghi toạ độ khối, nên một nút đổi từ xanh lá sang xanh dương vẫn "không lệch một pixel
nào" — đúng thứ hình học không thấy. Vì vậy **cả 10 khung nhìn** (bằng đúng phạm vi của
ảnh hình học) đều được chụp màn hình và so với `scripts/layout-shots/` đã commit, chia
thành hai vùng:

- **Ngoài vùng chữ** — so từng pixel: lệch quá **20/255** trên một kênh là pixel lệch,
vượt **0,1%** diện tích ảnh là vi phạm. Đây là nền, viền, khối màu, biểu tượng.
- **Trong vùng chữ** (hộp từng nút văn bản, lấy từ chính DOM đang hiển thị, nới 2px) —
so theo **khối 4×4** bằng **ba** thước đo: trung bình khối (12/255), **màu mực** (12/255,
trung bình các pixel đậm hơn trung điểm của khối) và **độ lệch sắc của mực** (80/255,
tức khoảng cách giữa kênh lệch nhiều nhất và kênh lệch ít nhất — xem vì sao bên dưới).
Vùng chữ đỏ khi **40%** diện tích lệch, hoặc khi **≥ 4 khối** lệch sắc.

Vì sao tách hai vùng — đo được, không phải phỏng đoán:

- **Khác biệt renderer không còn làm đỏ oan.** Chạy lại toàn bộ 110 trạng thái với
`--disable-font-subpixel-positioning` (Chrome vẽ nét chữ khác đi, đúng kiểu khác phiên
bản): **0 pixel ngoài vùng chữ** ở mọi trạng thái, và **0 vi phạm — 110/110 xanh**. Vùng
chữ vẫn lệch thật ở đó, chỗ nhiều nhất là màn **Thống kê** khung lớn (820×1180) với
**28,4%** diện tích — chữ nhỏ dày đặc thì rất nhiều pixel rìa, mà rìa nét chính là chỗ
hai renderer khác nhau nhiều nhất. Ngưỡng vùng chữ vì thế được đo mà đặt ở **40%**: ở
ngưỡng 25% cũ, đúng hai trạng thái Thống kê này đỏ oan. Nếu so từng pixel ở vùng chữ thì
đó là hàng nghìn pixel đỏ trên gần như mọi trạng thái.
- **Đổi màu chữ vẫn bắt được.** Đây là chỗ khó nhất, và cách giải quyết đến từ phép đo
chứ không từ việc nới ngưỡng:
  - Đổi token chữ `--text` từ `#132118` sang `#7a1010`: **đỏ cả 110/110 trạng thái**.
    Trung bình khối và màu mực KHÔNG đủ để kết luận việc này — dưới renderer khác, màu mực
    cũng lệch tới **118/255**, còn cao hơn 103/255 của chính thay đổi thật. Thứ tách được
    hai loại là **hướng** của độ lệch: nhiễu vẽ chữ làm ba kênh lệch cùng chiều (nhiều/ít
    độ phủ nét là chuyện sáng tối), đổi màu chữ thật thì lệch khác hướng nhau. Đo được:
    nhiễu renderer đạt tối đa **56/255** sắc và **0 khối** vượt 80/255 trên cả 110 ảnh,
    còn đổi màu chữ đạt **120/255** ở **15–340 khối**.
  - Đổi token chữ mờ `--muted` từ `#566d63` sang `#93a89f` (một kênh 60/255, dùng ở 11
    chỗ, KHÔNG đổi sắc nên thước đo thứ ba không áp dụng): **đỏ ở 16/110 trạng thái** —
    những màn có nhiều chữ mờ. Đây là giới hạn thật của tầng chữ: thay đổi chữ cùng hướng
    chỉ được bắt khi nó phủ đủ rộng.
- **Đổi màu nền/biểu tượng vẫn bắt như trước.** Đổi `--accent` từ `#1e9a6d` sang
`#1e9a8d` (một kênh 32/255 — rất khó thấy bằng mắt) làm **57 trong 110 trạng thái đỏ**,
và ảnh so sánh ghi ra `layout-shot-diffs/` với hai màu: magenta = ngoài vùng chữ, xanh =
khối chữ.

Dung lượng repo: ảnh chuẩn lưu ở **1/2 độ phân giải** (trung bình khối do chính script
cộng-chia, KHÔNG để bộ lọc của trình duyệt làm) ở định dạng **WebP không mất dữ liệu** —
**150 ảnh, 4,22MB** (≈29kB/ảnh), so với 2,4MB mà bản đầu 22 ảnh ở độ phân giải đầy đủ
tốn. WebP chỉ được dùng sau khi ĐO là
không mất dữ liệu: mỗi lần làm mới, script so bản vừa ghi với chính dữ liệu khối và hỏng
ngay nếu lệch một mức (WebP mặc định của Chrome lệch tới 61/255, nên tin suông là chuẩn đã
méo). Ảnh chụp lặp lại đúng từng byte nhờ ba thứ được ghim trong script: màu giao diện
(ứng dụng chọn sáng/tối bằng `matchMedia`), trạng thái chuyển động (chờ hết hiệu ứng;
`midori-rise` có `backwards` nên đo khi hiệu ứng còn chạy làm toạ độ lệch 7–8px), và phép
hạ độ phân giải do chính script làm. Làm mới ảnh bằng `LAYOUT_UPDATE_SHOTS=1 npm run
audit:layout`, RIÊNG với chuẩn hình học (`LAYOUT_UPDATE_BASELINE=1`). Id khung nhìn viết
sai (hoặc danh sách rỗng) làm lệnh **lỗi ngay** kèm danh sách id hợp lệ, không bỏ qua im
lặng — bỏ qua im lặng thì phép kiểm pixel thành no-op mà pipeline vẫn xanh. Lần chạy ĐẦY
ĐỦ (không lọc khung nhìn/trạng thái) khi làm mới còn **dọn** các mục không còn tồn tại
khỏi chuẩn — gỡ một màn hình là chuẩn thu lại theo, ảnh mồ côi của nó cũng bị xoá; chạy
có lọc (`LAYOUT_VIEWPORTS`/`LAYOUT_SCREENS`) thì chỉ **gộp** vào phần cũ, giữ nguyên phần
không đo vì phần đó chưa chắc đã chết.

**Tách nhiễu môi trường khỏi lỗi thật: `npm run audit:multi-env`.** Một vi phạm ảnh chụp
có hai nguyên nhân rất khác nhau: mã đổi thật, hay máy này vẽ khác máy đã chụp chuẩn. Đọc
log của MỘT môi trường thì không phân biệt được. Runner chạy audit hai lần trên hai cấu
hình renderer (mặc định: Chrome thường + cùng Chrome với `--disable-font-subpixel-positioning`;
đổi bằng `LAYOUT_RENDERER_PROFILES`, và có thể trỏ tới tệp Chrome khác bằng `binary` để so
hai phiên bản thật), rồi dán nhãn từng vi phạm: **THẬT** nếu từ 2 môi trường cùng thấy (mã
nguồn là chung, nên thay đổi thật phải hiện ở cả hai), **MỘT MÔI TRƯỜNG** nếu chỉ một nơi
thấy. Mỗi môi trường còn in **độ nhiễu nội môi trường** (`LAYOUT_NOISE_RUNS`, mặc định 2
lần chụp lại mỗi trạng thái) — máy này đo được **0/255** trên 220 lần so lại cho mỗi môi
trường, tức ngưỡng đang có toàn bộ biên: ngưỡng không phải để chịu nhiễu nội máy.
Runner thoát mã 1 khi còn vi phạm ở bất kỳ môi trường nào: nó để chẩn đoán, không phải để
tự động cho qua. Đã kiểm cả hai chiều: đổi `--accent` → cùng một trạng thái đỏ ở CẢ HAI
môi trường, phân loại THẬT; siết ngưỡng chữ về 0 → chỉ môi trường subpixel đỏ, phân loại
MỘT MÔI TRƯỜNG.

**CI:** `.github/workflows/ci.yml` có **hai job chạy song song**. Job `verify` lo
`npm run check` và build; job `layout` cài Rust + wasm-pack riêng rồi build và chạy
`npm run audit:layout`. Cố ý **không** `needs: verify`: mục đích là bố cục hỏng lộ ra
ngay, mà chờ `cargo test` xong thì mất hết ý nghĩa — cái giá là bộ thiết lập bị lặp, vì
`src/generated/` không nằm trong git. Job `layout` còn **ghim phông chữ** trước khi đo:
ảnh chụp chuẩn gắn với một môi trường render, và thay Noto Sans bằng Liberation Sans
làm 46/110 trạng thái lệch (toàn bộ ở `top`/`height`, do số dòng đổi). Bước ghim dùng
`assign_replace` — `assign` thua một ràng buộc mạnh có sẵn và **âm thầm không có tác
dụng** — rồi tự kiểm bằng `fc-match`, để nếu cách ghim hỏng thì job đỏ ngay tại đó với
thông báo nói rõ nguyên nhân.

**Cache `dist` cho job `layout`.** Vì hai job chạy song song nên `verify` không thể bàn
giao bản dựng (artifact là quan hệ `needs`, đúng thứ đã bỏ). Thay vào đó job `layout`
tự cache `dist/`: chìa khoá là hash **tập đường dẫn sinh ra bản dựng** tính ngay sau
checkout (mã nguồn, `content/`, cấu hình build, khoá Rust, phiên bản công cụ — không
gồm `docs/`, `README.md` hay chính script audit), nên sửa tài liệu hay sửa script audit
không làm chậm CI, còn đổi mã nguồn là đổi chìa khoá. Khi cache trúng, job bỏ qua cài
Rust + wasm-pack + `npm run generate` + build và chạy thẳng tới bước đo — đã kiểm bằng
cách gỡ `src/generated/` và `public/data/content/` rồi chạy audit: vẫn xanh. Chỉ
`layout` ghi cache và chỉ ghi **sau khi audit xanh**, nên cache không bao giờ giữ bản
dựng chưa qua kiểm. Job đỏ vì lệch pixel thì ảnh so sánh được tải lên làm artifact
(`layout-shot-diffs`), kèm báo cáo máy đọc được (`layout-report.json`, sinh bằng
`LAYOUT_REPORT_JSON`) — đúng định dạng mà `npm run audit:multi-env` đọc để phân loại.

Kết quả sau khi sửa: **0** tràn ngang, **0** cắt chữ, **0** vùng chạm quá nhỏ, **0**
phần tử tương tác bị che khi đã cuộn tới đáy trang, **0** lỗi console. Chạy lại lần
cuối: 10 khung nhìn × 15 trạng thái × 2 vị trí = 300 phép đo bố cục + 10 lần dò cử chỉ
(90 bước vuốt) + 150 ảnh chụp hình học + **150 ảnh màn hình** so với chuẩn, **0 vi phạm**,
khoảng **121 giây** khi máy đã ấm (ba lần chạy liên tiếp đo được 120,98–121,74 giây giữa
hai lượt so và một lượt làm mới chuẩn — bộ trạng thái tăng từ 11 lên 15 màn nên lâu hơn
mức 79 giây của lần đo trước). Lần làm mới chuẩn vừa rồi (150 ảnh, kèm phép tự kiểm
codec) đo được 121,74 giây.

Ba lỗi tìm thấy và đã sửa:

1. **Hai màn hình không có lối vào nào.** `stats` và `editor` có trong `SCREENS`, có
   component, được `App.svelte` dựng — nhưng không nút nào trỏ tới chúng. Chúng chỉ
   hiện ra nếu bản lưu màn hình cũ trỏ đúng vào, tức là người dùng không mở được. Đã
   sửa: Trang chủ có nút "Thống kê chi tiết" ngay dưới dòng tóm tắt thư viện, và Cài
   đặt có mục "Công cụ" → "Trình biên tập thẻ".
2. **Bốn nút tự chấm nằm sau thanh điều hướng ở 320×568** khi thông báo "Đã khôi phục
   phiên học đang dở" xuất hiện: đo được `elementFromPoint` tại tâm nút "Good" và
   "Easy" trả về `nav.nav`, tức là chạm vào để chấm điểm lại chuyển tab. Nguyên nhân:
   sàn chiều cao thẻ cố định 216px, mà điều khiển nằm DƯỚI thẻ. Đã sửa: sàn co theo
   khung nhìn — `clamp(140px, 25vh, 216px)` — và mặt thẻ giảm đệm trên màn hình thấp.
3. **Thông báo chấm bài ở chế độ tự trả lời nằm ngoài màn hình** ở 320×568: đo được ở
   `y = 520…584` trong khi khung nhìn cao 568 và thanh điều hướng bắt đầu ở 504. Cùng
   nguyên nhân và cùng cách sửa; nay thông báo hiện ở `y = 446…510`, đọc được đủ hai
   dòng.

Đã sửa kèm theo hai điểm bố cục cùng vòng này: bốn mức tự chấm xếp **một hàng** khi màn
hình rộng nhưng thấp (điện thoại nằm ngang), và trên màn rộng thanh điều hướng gom bốn
tab vào đúng bề ngang của cột nội dung thay vì dàn ra hai mép.

Đo lại sau khi sửa: 320×568 không còn phải cuộn ở màn Học
(`scrollHeight` = `clientHeight` = 568); thẻ 320×568 cao 142px khi có thông báo khôi
phục và 201px khi không, cả hai mặt thẻ đều không mọc thanh cuộn bên trong.

> **Đã gỡ nốt phần còn lại (xem mục "Bố cục hai cột cho màn Học nằm ngang").** Ở khung
> nhìn nằm ngang cao 375–390px, màn Học trước đây phải cuộn một đoạn ngắn và 9px cuối
> của hàng nút tự chấm nằm sau thanh điều hướng. Nay màn Học chia hai cột ở đúng khổ
> đó, nên cả thẻ lẫn bốn nút đều nằm trong khung nhìn mà không phải cuộn.
> Screen-reader, thiết bị thật, Firefox/Safari và zoom văn bản vẫn chưa thử.

### Học theo bốn tầng: danh mục → Collection theo phạm vi → phiên (1.0.3)

Vòng này viết lại đường đi của việc học và Trang chủ; chỉ đụng giao diện và lớp JS —
không đổi lõi Rust, không đổi schema lưu trữ (khoá `collectionScope` trong store
`meta` là trường MỚI nhưng đọc thiếu được: bản ghi cũ không có nó vẫn hợp lệ).

- **Một đường đi, bốn tầng rõ việc.** *Học* chỉ còn danh mục — ba chủ đề Từ vựng,
  Kanji, Mẫu câu kèm số thẻ thật, phần trăm đã học và số tới hạn. *Tầng hai* là nơi
  chọn phạm vi: Từ vựng mở 50 bài Minna, Kanji mở bảy nhóm, Mẫu câu (một bộ duy nhất
  ở thời điểm 1.0.3; từ 1.0.4 cũng mở màn chọn bài 1–50) đi thẳng vào Collection.
  *Tầng ba* — Collection — là màn mới, biết CHÍNH XÁC mình
  đang quản lý phạm vi nào (Tất cả nội dung · một bài · một nhóm Kanji · một bộ bất
  kỳ) và đó cũng là nơi DUY NHẤT bắt đầu phiên. *Tầng bốn* là phiên học như cũ.
  Trước đây "chọn bài" và "bắt đầu phiên" nằm chung một màn nên không phân biệt được
  đang chọn nội dung hay đang cấu hình phiên.
- **Collection nói đúng phạm vi của nó.** Đường dẫn phân cấp (Học › Từ vựng › Bài
  15), bốn ô số liệu (tổng · tới hạn · chưa học · chưa thuộc), thanh cơ cấu và thanh
  thành thạo — tất cả từ `deckStats`/`lessonSummary` của lõi. Danh sách "Sẽ học" và
  số thẻ trên nút Bắt đầu đi qua ĐÚNG `sessionFilter` mà phiên dùng để dựng hàng
  đợi, nên nút không thể ghi "12 thẻ" rồi phiên chạy 9 thẻ. Phạm vi rỗng có thông
  báo riêng theo đúng loại (bài chưa có nội dung / nhóm đang được chuẩn bị / bộ
  trống). Bố cục hai cột khi màn ≥ 900px.
- **Mở Collection KHÔNG tự chạy phiên.** Phiên chỉ chạy khi bấm Bắt đầu, và yêu cầu
  được truyền MỘT LẦN (`app.startSession` → `takeRequestedSession`). Quy tắc khôi
  phục đổi theo: phiên đang dở chỉ được nhận nếu đúng cấu hình vừa yêu cầu (cùng
  phạm vi, chế độ, cách lọc); khác thì dứt khoát bỏ phiên cũ, báo rõ, và dựng hàng
  đợi mới — không còn cảnh phiên cũ "ám" vào lựa chọn mới. Phiên trộn nhiều bộ lưu
  `deckId` là `'*'` (một hằng số, không phải id bịa).
- **Phạm vi chọn là trạng thái bền vững.** `app.collectionScope` được lưu xuống
  IndexedDB (`meta`) nên tải lại trang hay Back từ phiên học vẫn đứng đúng chỗ cũ;
  bản backup cá nhân mang theo nó như trường TÙY CHỌN — backup không có tiến độ thì
  không ghi, backup cũ thiếu trường vẫn khôi phục được.
- **Trang chủ theo thứ tự ưu tiên, mỗi trạng thái một hành động.** Hero chọn đúng
  MỘT nhánh theo thứ tự: phiên đang dở → thư viện trống → thẻ đã đến hạn ôn
  (`due − new`, vì thẻ mới nằm trong `due` của lõi) → thẻ mới → thẻ chưa thuộc → đã
  ôn hết (kèm nút Học ngẫu nhiên khi còn bốc được). Không chuỗi "tiến độ" phần trăm
  nào được bịa — thứ chưa đo được thì không hiện. Dưới hero: ba chủ đề dùng CHUNG
  component với màn Học, thẻ Thư viện (số gộp + lối vào Thống kê chi tiết), và "Bộ
  khác" — bộ tự tạo/nhập không thuộc ba chủ đề, bấm một hàng mở thẳng Collection của
  bộ đó.
- **Màn Học không còn dashboard.** Chỉ danh mục + thẻ "Tiếp tục phiên đang dở"; mọi
  logic thiết lập phiên chuyển hết về Collection. Màn Thống kê chi tiết vẫn chỉ đọc
  và không đổi thứ bậc.
- **Gỡ bảy màn `kanji-*`.** Không còn màn riêng cho từng nhóm Kanji — bảy nhóm dùng
  chung màn Collection. Tên màn cũ trong bản lưu vẫn được ánh xạ về màn Kanji
  (`normalizeScreen`) nên bản ghi cũ không mở ra màn hình trắng. Số màn hình trong
  gói: 10, mỗi màn vẫn là một gói nạp riêng.
- **Không thêm dependency, không đổi lõi.** Toàn bộ nằm ở component Svelte và lớp
  trạng thái; `cargo test` không đổi (174 + 4), số test JS tăng lên **153** (+2:
  ca backup mang `collectionScope` và ca ánh xạ tên màn hình cũ trong bản lưu).

> **Mức kiểm chứng.** `npm run check` xanh: **174 + 4 test Rust** (không đổi mã Rust)
> và **153 test JS** (ca backup mang `collectionScope`, ca ánh xạ tên màn hình cũ, ca
> Back của hai màn mới); `svelte-check` 0 lỗi/0 cảnh báo; `npm run build` xanh
> (`Session` 14,43 kB, `Collection` 12,84 kB, `Home` 9,32 kB, `Study` 2,08 kB — mỗi
> màn một gói riêng). `npm run audit:layout` **0 vi phạm** sau khi làm mới chuẩn cho bộ
> 15 trạng thái (10 khung nhìn × 15 × 2 vị trí = 300 phép đo bố cục, 90 bước cử chỉ,
> 150 ảnh hình học + 150 ảnh màn hình, `baseline: compared`, `shotsBaseline: compared`).
> Xem [docs/verification.md](docs/verification.md).


### Chuyển mục Cập nhật có hiệu ứng trượt; "Theo bộ thẻ" về Trang chủ (1.0.3)

Vòng này chỉ đụng giao diện và lớp JS — không đổi lõi Rust, schema lưu trữ hay
dependency.

- **Thanh chọn "Ứng dụng / Nội dung" có hiệu ứng trượt.** Khối nội dung của thẻ
  Cập nhật dựng lại theo `{#key updateScope}` và trượt vào theo CHIỀU của mục vừa
  rời đi (±14px, 200ms), đúng cách thanh chọn chủ đề ở màn Nhập/xuất xử lý; trước
  đây khối đổi tại chỗ nên đổi mục không có chuyển cảnh. Chỉ dùng `in:` mà không
  dùng `out:` — hai khối không bao giờ cùng nằm trong luồng bố cục nên trang không
  nhảy. Thời lượng đi qua `motionDuration` như mọi hiệu ứng JS: người dùng yêu cầu
  giảm chuyển động thì khối hiện ra ngay, không còn chuyển động nào để giảm.
- **"Theo bộ thẻ" chuyển từ Thống kê chi tiết về Trang chủ.** Trang chủ có thêm
  mục kiểm kê ĐẦY ĐỦ mọi bộ trong thư viện (kể cả bộ tự tạo, kể cả bộ chưa có
  thẻ) ngay dưới nút "Thống kê chi tiết", kèm thanh cơ cấu và pill "% thành
  thạo"; màn Thống kê bỏ mục này, còn **Tổng quan → Bài Minna → Kanji → Mẫu
  câu**. Vẫn là màn CHỈ ĐỌC như trước: không nút, không hover, không chevron —
  việc bắt đầu phiên học thuộc trọn về màn Học.
- **Một khuôn hàng, một chỗ sửa.** Hàng bộ thẻ nay là component dùng chung
  (`DeckRow.svelte` + `StructureBar.svelte` + `deck-rows.ts`), dùng ở Trang chủ
  và hai mục chủ đề Kanji / Mẫu câu của Thống kê chi tiết — ba bản chép tay của
  cùng một khuôn hàng sẽ lệch nhau ở lần sửa đầu tiên.

> **Mức kiểm chứng.** `npm run check` xanh: **174 + 4 test Rust** (không đổi mã
> Rust) và **151 test JS**; `svelte-check` 0 lỗi/0 cảnh báo; `npm run build` xanh
> (index JS 111,36 kB / 37,68 kB gzip; `Home` 2,88 kB, gói dùng chung `DeckRow`
> 4,89 kB / 2,22 kB gzip, `StatsDetail` 8,60 kB, `Settings` 11,54 kB; precache
> 35 mục / 495,29 KiB). `npm run audit:layout` **0 vi phạm**: đo riêng `settings`
> trước tiên (20 phép đo, 10 trạng thái, 10 ảnh) xác nhận hiệu ứng chuyển mục
> không đổi bố cục lúc nghỉ — không cần làm mới chuẩn cho `settings`; chuẩn hình
> học và ảnh chụp làm mới cho riêng `home` + `stats` (20 trạng thái — thay đổi bố
> cục là chủ ý); sau đó chạy đầy đủ 0 vi phạm (220 phép đo bố cục, 90 bước cử
> chỉ, 110 ảnh hình học, 110 ảnh màn hình). Trên bản dựng production: chuyển Ứng
> dụng → Nội dung trượt vào từ `+14px` và ngược lại từ `−14px`, mỗi chiều 200ms;
> bật giảm chuyển động thì 0 animation; Trang chủ có đủ 3 hàng bộ thẻ (Từ vựng /
> Mẫu câu / Kanji — Danh từ) với thanh cơ cấu và pill, Thống kê chi tiết không
> còn mục "Theo bộ thẻ"; console sạch. Chi tiết ở
> [docs/verification.md](docs/verification.md).

### Thống kê chi tiết thêm Kanji và Mẫu câu (1.0.3)

Vòng này chỉ đụng giao diện màn Thống kê — không đổi lõi Rust, schema lưu trữ hay
dependency.

- **Hai mục theo chủ đề dưới "Bài Minna".** Thứ bậc màn Thống kê nay khớp "Danh mục
  học": **Kanji** hiện đủ bảy nhóm (`KANJI_CATEGORIES`), hàng nhóm trống bị làm mờ
  kèm "Trống"/"Nhóm chưa có thẻ nào"; **Mẫu câu** hiện bộ `patterns` duy nhất. Cả
  hai dùng chung một snippet hàng với "Theo bộ thẻ" — cùng con số với hàng tương ứng
  ở đó là chủ ý, vì cả hai đọc chung một `deckStats`.
- **Vẫn chỉ đọc.** Không nút, không hover, không chevron; việc bắt đầu phiên học vẫn
  thuộc trọn về màn Học.

> **Mức kiểm chứng.** `npm run check` xanh: **174 + 4 test Rust** (không đổi mã Rust)
> và **151 test JS**; `svelte-check` 0 lỗi/0 cảnh báo; `npm run build` xanh
> (`StatsDetail` 11,72 kB / 4,03 kB gzip; precache 34 mục / 493,79 KiB).
> `npm run audit:layout` lần đầu (đo riêng `stats`) **58 vi phạm, tất cả ở `stats`**
> — thay đổi bố cục cố ý; sau khi làm mới chuẩn + ảnh chụp cho riêng `stats` thì **0
> vi phạm** trên bộ đầy đủ (220 phép đo bố cục, 90 bước cử chỉ, 110 ảnh hình học, 110
> ảnh màn hình). Xác nhận trên bản dựng production: năm mục đúng thứ tự, Kanji 7
> hàng (tag "1/7 nhóm có nội dung"), Mẫu câu 1 hàng, console sạch. Chi tiết ở
> [docs/verification.md](docs/verification.md).

### Một chức năng một chỗ: bốn mục điều hướng, mỗi mục một vùng (1.0.3)

Vòng này chỉ đụng giao diện và lớp JS — không đổi lõi Rust, không đổi schema lưu trữ.

- **Mỗi màn hình thuộc đúng một mục điều hướng.** `SECTION_OF: Record<Screen,
  Section>` thay hàm ánh xạ cũ: Thống kê → Trang chủ; Bài học, Kanji và bảy màn
  Kanji con → Học; Trình biên tập → Cài đặt. Ràng buộc kiểu `Record` khiến màn hình
  mới quên xếp mục là lỗi biên dịch, tab dưới luôn đánh dấu đúng vùng đang đứng
  (trước đây mở Bài học hay Kanji vẫn sáng tab Trang chủ), và nút Back của màn con
  về đúng mục sở hữu nó.
- **Trang chủ thuần bảng tình trạng.** Còn ba số liệu, dòng tóm tắt, nút "Thống kê
  chi tiết" và cảnh báo bản ghi cứu hộ. Gỡ hero bắt đầu phiên học, thẻ "Bộ lọc Chưa
  thuộc", thẻ "Nội dung", cảnh báo đồng bộ — không còn lối tắt sang chức năng của
  mục khác.
- **Màn Học là nơi duy nhất bắt đầu phiên.** "Danh mục học" là nơi duy nhất đổi mục
  tiêu (Từ vựng → Bài học, Kanji → màn nhóm, Mẫu câu chọn tại chỗ); hàng đang nhắm
  hiện nhãn "Đang chọn" và "Thiết lập phiên" chỉ còn CÁCH học (chế độ, phạm vi
  thẻ) — ô "Bộ thẻ" và dãy "Bài Minna" bị gỡ vì là lối vào thứ hai của cùng việc.
- **"Học toàn bộ từ vựng" vào màn Bài học.** Hàng đầu danh sách là mục tiêu học cả
  bộ Từ vựng (ngang hàng với từng bài); nhờ vậy bỏ ô "Bộ thẻ" không làm mất lối vào
  cả bộ.
- **Thống kê chi tiết thành màn chỉ đọc.** Các hàng là văn bản — không còn nút mở
  phiên học, không hover/chevron; hàng chưa có thẻ chỉ hiện nhãn và bị làm mờ. Việc
  bắt đầu phiên học thuộc trọn về Học (đảo ngược riêng điểm 4 của ADR-028).
- **Đồng bộ nội dung chỉ còn một chỗ.** Cảnh báo `contentSyncError` và nút "thử
  lại" nằm duy nhất trong Cài đặt → "Cập nhật → Nội dung".

> **Mức kiểm chứng.** `npm run check` xanh: **174 + 4 test Rust** (không đổi mã Rust)
> và **151 test JS** (ca ánh xạ mục điều hướng viết lại, ca Back tách đôi theo mục sở
> hữu); `svelte-check` 0 lỗi/0 cảnh báo; `npm run build` xanh. `npm run audit:layout`
> **0 vi phạm** sau khi làm mới chuẩn hình học và 110 ảnh chụp (thay đổi bố cục là
> chủ ý: Trang chủ, Thiết lập phiên, Bài học, Thống kê, Kanji, Editor; tab dưới của
> màn con nay nằm dưới Học/Cài đặt). Smoke CDP **26/26** phép kiểm trên bản dựng
> production, console sạch. Chi tiết ở
> [docs/verification.md](docs/verification.md).

### Thống kê chi tiết theo bài, phân cấp vào phiên học (1.0.3)

Vòng này mở rộng lõi theo hướng cộng thêm (trường mới, bản ghi cũ đọc được) và viết
lại màn Thống kê; không đổi schema lưu trữ.

- **Số liệu từ lõi, không đếm ở JS.** `DeckStats` tách "chưa thuộc" thành
  `weakRating`/`weakQuiz` theo `srs_weak_reason`; `LessonInfo` mang đủ tiến độ từng
  bài như `DeckCount` (`new`/`learning`/`mature`/`weak`/`mastery`/`mastered`/
  `accuracy`/`graded`). Hai hàm dùng chung một bộ đếm, nên số theo bài không thể lệch
  khỏi toàn thư viện; tên `count` giữ nguyên cho tương thích.
- **Tổng quan → bộ thẻ → bài Minna.** Mỗi hàng có thẻ mở thẳng phiên học tương ứng
  (bài thì kèm bộ lọc bài); hàng không có thẻ bị vô hiệu kèm "Trống"/"Chưa có nội
  dung" — trước đây hàng bài đã điều hướng nhưng 44/50 bài không có thẻ, nên bấm vào
  là tới màn Học ở "Bộ này không còn thẻ tới hạn": một ngõ cụt. Danh sách bài mặc định
  chỉ hiện bài có thẻ, có công tắc xem đủ 50.
- **Bộ tự tạo hiện ra:** danh sách bộ là hợp của `content.bundles` và khoá
  `stats.byDeck`. Mở màn tự tính lại số liệu để không cũ sau phiên thoát giữa đường.
- **Hai thước đo tách biệt giữ nguyên** (thành thạo dài hạn / điểm làm bài gần nhất),
  nay hiện kèm mẫu số (`mastered/total`, `graded`).

> **Mức kiểm chứng.** `npm run check` xanh: **174 + 4 test Rust** (thêm ca tách lý do
> yếu và tiến độ bài khớp toàn thư viện) và **150 test JS**; `svelte-check` 0 lỗi/0
> cảnh báo. `npm run audit:layout` **0 vi phạm** sau khi làm mới chuẩn màn `stats`
> (lần chạy đầu 66 vi phạm, tất cả ở `stats` — thay đổi cố ý). Smoke trên dev server:
> "Bài 4" mở màn Học đúng bộ lọc kèm "Ôn thẻ tới hạn · 2 thẻ"; hàng bài trống vô hiệu;
> công tắc hiện đủ 50 bài. Chi tiết ở [docs/verification.md](docs/verification.md).

### Danh mục học về màn Học, phiên ngẫu nhiên, trình biên tập thẻ tìm kiếm được (1.0.3)

Vòng này chỉ đụng giao diện và lớp JS — không đổi lõi Rust, không đổi schema lưu trữ
(phiên `focus: 'random'` là giá trị mới của trường đã có, có đường đọc cũ an toàn).

- **Trang chủ tối giản.** Khối "Danh mục học" gỡ khỏi Trang chủ; Trang chủ còn hero
  thư viện, nút "Học N thẻ tới hạn", "Nội dung", "Bộ lọc Chưa thuộc". Không mất lối
  vào nào: Từ vựng mở màn Bài học, Kanji mở màn Kanji, Mẫu câu chọn ngay tại màn Học.
- **Màn Học gánh danh mục.** Ba hàng chủ đề (số thẻ · số tới hạn lấy từ cùng `stats`)
  đứng trên "Thiết lập phiên". Chọn "Mẫu câu" đặt bộ **tại chỗ** rồi cuộn xuống ô
  thiết lập — cố ý không dùng `app.go('study', …)`, vì màn không được dựng lại và yêu
  cầu mở bộ sẽ không có ai tiêu thụ.
- **Học ngẫu nhiên.** Nút "Học ngẫu nhiên · N thẻ" bốc N = "thẻ mới tối đa mỗi ngày"
  (mặc định 20) từ **cả ba chủ đề**, không phân biệt tới hạn: trộn toàn bộ id danh mục
  bằng một lần gọi `sessionShuffle` (WASM) rồi lấy N thẻ đầu — tập con đều xác suất,
  một lần vượt biên. Phiên lưu `deckId '*'` + `focus 'random'` nên **tải lại giữa
  chừng khôi phục đúng**; câu hỏi/đáp án và nhãn suy theo bộ của **từng thẻ** (một
  phiên có thể lần lượt hỏi "Từ vựng · hỏi nghĩa" rồi "Kanji — Danh từ · hỏi chữ
  Nhật"). Màn kết thúc đổi nút thành "Bốc phiên ngẫu nhiên mới"; nút tự vô hiệu kèm
  lý do đúng khi danh mục rỗng hoặc giới hạn thẻ mới = 0.
- **Trình biên tập thẻ viết lại.** Hai chế độ tách hẳn — "Sửa thẻ đã có" (tìm kiếm +
  lọc bộ + danh sách → chi tiết) và "Tạo thẻ mới" (nháp riêng, giữ nguyên bộ). Tìm
  kiếm chạy **cục bộ** (`cardMatchesQuery`, bản JS của quy tắc Rust `matches_query`)
  thay vì gọi `cardsFilter` mỗi phím gõ; kết quả xếp theo mặt trước (tiếng Việt), tối
  đa 200 kèm ghi chú thu hẹp. Đang sửa thì danh sách ẩn hẳn — không còn vùng cuộn
  lồng trong màn (đúng loại lỗi audit bố cục bắt được). Bài Minna bắt buộc 1–50 ngay
  ở editor, vì bản backup từ chối bài ngoài khoảng khi khôi phục.
- **Lỗi thật sửa được nhờ vòng kiểm thử này:** `saveCard` chỉ *thay thế* thẻ đã có
  trong `app.cards`, không thêm mới — thẻ vừa tạo chỉ xuất hiện sau khi tải lại.
  Nay là upsert; smoke xác nhận thẻ tạo mới tìm thấy **ngay** trong tab "Sửa thẻ đã
  có" mà không cần tải lại.

> **Mức kiểm chứng.** `npm run check` xanh: **143 test JS** (đầu vòng 128; +15:
> `card-search`, `random-study`, ca khôi phục `focus: 'random'` ở session/backup) và
> **173 test Rust** như trước; `svelte-check` 0 lỗi/0 cảnh báo; `npm run build` xanh.
> `npm run audit:layout` **0 vi phạm** sau khi làm mới chuẩn hình học và 110 ảnh chụp
> (thay đổi bố cục là chủ ý: danh mục chuyển màn, editor đổi hẳn cấu trúc). Smoke
> trình duyệt trên bản dựng production: bốc 20 thẻ ngẫu nhiên ra 11 từ vựng + 4 mẫu
> câu + 5 kanji; khôi phục giữa phiên đúng cả ba loại phiên (tới hạn, Mẫu câu, ngẫu
> nhiên) — giữ index, số đã chấm, và mặt đáp án đã lật; editor tìm bằng tiếng Việt lẫn
> romaji, sửa–lưu đọc lại từ IndexedDB thấy ngay, bài 51 bị chặn, tạo thẻ thấy ngay;
> không có lỗi console nào. Screen-reader, thiết bị thật, Firefox/Safari và zoom văn
> bản vẫn chưa thử (như các vòng trước).

### Chấm điểm theo mức, độ thành thạo, và tách gói màn hình (1.0.3)

Vòng này đụng tới **thuật toán chấm điểm** — lần đầu tiên kể từ khi dự án tách khỏi
Mitsuha. Nó không chỉ đổi phản hồi trên giao diện: luật chấm, mô hình thành thạo và
hợp đồng WASM đều đổi theo.

- **Đúng/sai → năm kết luận, bốn mức điểm.** `empty` · `wrong` · `near` (0.5)
  · `accepted` (0.9) · `exact` (1.0). “Gần đúng” **không** được tính là đúng (bộ lọc
  “Chưa thuộc” phải giữ nguyên ý nghĩa), nhưng được nhận ra và nói rõ cho người học.
- **Bỏ dấu tiếng Việt được chấp nhận** ở mức `accepted`: gõ `nghia` cho `nghĩa` không
  còn bị coi là sai. Khác hoa/thường cũng không còn bị coi là sai. Chữ Nhật vẫn phải
  khớp chính xác; `こんにちわ` cho `こんにちは` được nhận ra là “gần đúng”.
- **Quy tắc chấm là đầu vào tường minh.** `AnswerConfig { accentTolerant, allowTypos }`,
  mặc định bật cả hai; hàm mới `quiz_score` nhận cấu hình, cùng vào + cùng cấu hình ⇒
  cùng kết quả.
- **Độ thành thạo tách khỏi điểm làm bài.** `mastery` (0–1) suy **chỉ từ lịch ôn**;
  `accuracy` + `graded` là điểm của lần làm bài gần nhất. Một lần trả lời đúng nhanh
  không nâng `mastery`, và chưa từng làm bài hiện `—` chứ không phải `0%`.
- **Đo bằng số, không bằng cảm nhận.** Bộ dữ liệu 39 ca có nhãn
  (`crates/midori-core/tests/answer-scoring.rs`) so thuật toán cũ với thuật toán mới:
  **recall 0,880 → 1,000**, **precision 1,000 → 1,000**, **âm tính giả 3 → 0**.
- **Tách gói màn hình.** JS chính **171,10 kB → 109,41 kB** (gzip 56,08 → 36,74 kB),
  CSS màn hình đầu tiên **32,94 kB → 15,03 kB**. Màn hình đang mở được nạp xong TRƯỚC
  khi giao diện hiện ra, nên không có khung trắng; toàn bộ gói vẫn được precache nên
  ngoại tuyến không đổi.
- **Bớt một lần vượt biên WASM mỗi lần lật thẻ:** `srs_preview` trả cả bốn khoảng ôn
  trong một lần gọi — đo được 0,01 ms so với 0,04 ms (median, p95 0,02 so với 0,28 ms).

> **Mức kiểm chứng.** `npm run check` xanh: 173 test Rust (1.0.2: 131) và 126 test JS
> (1.0.2: 116), gồm hợp đồng WASM cho cả năm kết luận và một test tích hợp chạy qua
> đúng đường đi thật (`tests/answer-scoring.test.ts`). `npm run audit:layout` báo đúng
> 63 vi phạm, **tất cả ở màn Thống kê** và tất cả từ thay đổi bố cục có chủ ý ở ADR-023;
> mọi màn hình khác giữ nguyên 110 ảnh chuẩn, tức việc tách gói không đổi bố cục.
> Chuẩn hình học và ảnh chụp của màn Thống kê đã được làm mới theo quy trình trong
> kho. Screen-reader, thiết bị thật, Firefox/Safari và zoom văn bản vẫn chưa thử.

### Tối giản chữ hiển thị và chuyển cảnh Nhập/xuất (1.0.2)

Vòng này không đụng tới nghiệp vụ: nó cắt chữ mô tả và thêm một chuyển cảnh.

- **Cắt chữ mô tả.** Bỏ hẳn dòng "Chọn chủ đề…" ở Trang chủ; bỏ đoạn lặp lại mô tả
  nhóm ở màn Kanji con (mô tả đã nằm ở phụ đề của `PageHeader`); gộp dòng phiên bản
  nội dung trùng với chip phiên bản cùng khối; viết ngắn hơn ở Học, Nhập/xuất, Cài
  đặt, Bài học, Thống kê, Editor. Gợi ý bàn phím ở màn Học nay chỉ hiện khi thiết bị
  thật sự có con trỏ (`@media (hover: none)`). Bundle JS trong `vite build` giảm từ
  170,44 kB xuống 169,71 kB — nhưng thứ giảm đáng kể nhất là chiều cao màn hình, không
  phải dung lượng.
- **Chuyển cảnh khi đổi chủ đề ở Nhập/xuất.** Khối nội dung của chủ đề được dựng lại
  bằng `{#key section}` và trượt vào ĐÚNG CHIỀU đi trên thanh chọn (sang phải khi tới
  mục sau, sang trái khi quay lại); chiều lấy từ vị trí trên thanh chọn, nên nhảy từ
  "Từ vựng" sang "Mẫu câu" vẫn cùng chiều như đi qua "Kanji". Chỉ dùng `in:` — khối
  cũ biến mất ngay nên bố cục không nhảy, đúng cách `App.svelte` xử lý chuyển màn
  hình. Thời lượng về 0 khi người dùng yêu cầu giảm chuyển động, vì hiệu ứng của
  Svelte chạy bằng JS nên khối `prefers-reduced-motion` trong CSS **không** tắt được nó.

> **Mức kiểm chứng.** Phiên bản: `/data/version.json` và màn Cài đặt cùng báo `1.0.2`
> (ứng dụng và lõi), và test "phiên bản lõi khớp với Cargo.toml" xanh sau khi sinh lại
> WASM. Chuyển cảnh: đo được phần tử vào ở `translateX(±14px)` + `opacity: 0` đúng
> chiều, và kết thúc ở `transform: none` / `opacity: 1`. **Chưa thấy được khung hình
> trung gian**: khung nhìn tự động hoá của phiên này không phát khung hình nào
> (`requestAnimationFrame` báo 0 khung trong 400 ms) nên hiệu ứng đứng yên ở trạng thái
> đầu cho tới khi có khung hình — độ mượt của nội suy chưa được xác nhận bằng mắt.

### Vuốt ngang đổi chủ đề, bố cục hai cột khi nằm ngang, thẻ Cập nhật gộp (1.0.2)

Ba thay đổi cùng một vòng, đều không đụng tới nghiệp vụ:

- **Vuốt ngang ở màn Nhập/xuất.** Thẻ "Chọn chủ đề" nhận cử chỉ vuốt ngang trên thiết
  bị cảm ứng: vuốt trái tới mục sau, vuốt phải về mục trước, và khối nội dung trượt
  vào **đúng chiều** đó — chiều lấy từ `selectSection`, tức cùng nguồn với hiệu ứng đã
  có, nên cử chỉ và hiệu ứng không thể lệch nhau. Ngưỡng 44px và phải trội hơn dịch
  dọc (×1,2) để cuộn dọc không vô tình đổi chủ đề; `touch-action: pan-y` để trình duyệt
  vẫn cuộn dọc nhưng nhường cử chỉ ngang. Cử chỉ bắt đầu trên `select`/`input`/`pre`
  (ô chọn và khối mã cuộn ngang) bị bỏ qua; hai đầu danh sách thì dừng, không quay vòng.
- **Bố cục hai cột cho màn Học khi khung nhìn thấp và rộng.** Ở
  `(min-width: 560px) and (max-height: 560px)` — điện thoại nằm ngang — thân phiên
  thành lưới hai cột: thẻ bên trái, điều khiển và bốn nút tự chấm bên phải (lưới 2×2).
  Kèm theo là thu gọn phần khung: bớt khoảng chừa trên/dưới, hạ chiều cao đầu màn, và
  làm thông báo khôi phục phiên gọn lại — chỉ chia cột thì chưa đủ, phần khung đó vẫn
  đẩy hai cột xuống dưới thanh điều hướng. Đây là việc mà mục Phase 6 đã ghi là "cần
  bố cục hai cột, lớn hơn một vòng sửa lỗi".
- **Gộp hai mục Cập nhật ở Cài đặt thành một thẻ hai trạng thái.** "Cập nhật ứng dụng"
  và "Cập nhật nội dung" vẫn độc lập (phiên bản riêng, nút riêng) nhưng nay nằm trong
  một thẻ với thanh chọn `Ứng dụng` / `Nội dung`, mỗi lúc chỉ một loại hiện. Màn Cài
  đặt ngắn hơn hẳn so với hai thẻ đầy đủ xếp dọc.

> **Mức kiểm chứng.** Cả ba đều được chạy thật trong Chromium trên bản dựng production
> (`npm run preview`). Vuốt: phát `TouchEvent` tổng hợp trên thanh chọn — vuốt trái →
> `Kanji` với khối vào ở `translateX(+14px)`, vuốt phải → về `Từ vựng` ở
> `translateX(-14px)`, vuốt 20px không đổi, vuốt tiếp quá `Mẫu câu` dừng lại, vuốt bắt
> đầu trên `<select>` và vuốt xiên (dy 120 > dx 80) đều không đổi chủ đề. Hai cột: ở
> 844×390 và 667×375, `scrollHeight` bằng chiều cao khung nhìn (không phải cuộn), thẻ ở
> `y = 149…314` và cả bốn nút kết thúc ở `y = 304` trong khi thanh điều hướng bắt đầu ở
> `y = 326`. Ở 390×844 khung vẫn một cột như cũ. Thẻ Cập nhật: chuyển trạng thái đổi
> `aria-selected` và nội dung/`section-tag` đúng. Phép dò cử chỉ lúc đầu chỉ là thao tác
> tay; nay nó nằm trong `npm run audit:layout` và chạy ở **mọi** khung nhìn, nên chiều
> trượt không còn phụ thuộc vào việc có ai nhớ kiểm lại. Bản dựng này đã chạy lại toàn
> bộ: 220 phép đo bố cục + 90 bước vuốt, 0 vi phạm.

### Phase 5 — điều hướng, giao diện học, và danh mục bài học (lịch sử)

| Hạng mục | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| Nút/cử chỉ Back của hệ điều hành | Đã sửa | Điều hướng đi qua History API (`src/app/navigation.ts`, `store.svelte.ts`); Back giữa phiên không còn thoát ứng dụng. Kiểm chứng bằng `history.back()` thật trong Chromium preview |
| Nút Quay lại | Đã thêm | Màn con có điều khiển Back; header thường thay giao diện Island từ Phase 6 |
| Home không giả dạng Back | Đã sửa | Hành động "Về trang chủ" luôn đẩy entry mới và chỉ còn ở nơi nó có nghĩa |
| Cụm trả lời + nút Kiểm tra | Đã thiết kế lại | Một hàng khi ≥430px, xếp dọc và giãn hết bề ngang trên điện thoại; nút cao 46px |
| Khối thẻ học | Đã thiết kế lại | Khung giãn theo chiều cao còn lại, nội dung căn giữa hai chiều; trước đây cao cố định 208px nên chữ dồn về góc trên trái |
| Màn Bài học riêng | Đã thêm | `src/ui/Lessons.svelte`, tìm theo số bài + lọc "chỉ bài có thẻ"; Trang chủ chỉ còn 4 bài xem trước |
| Pull-to-refresh | Đã siết | `overscroll-behavior-y: none` trên `html` (phần tử cuộn gốc), không chỉ `body`; xem giới hạn iOS bên dưới |
| Chọn văn bản | Đã giới hạn đúng chỗ | Nội dung học (`.face`, `.prompt`, `.answer`, `.reading`) chọn/sao chép được; chỉ nút và biểu tượng bị chặn |
| Điểm truy cập trùng lặp | Đã giảm | Màn hình hiện tại không dùng bảng shortcut nổi |

**Cách kiểm chứng (Phase 5; nhật ký cũ).** Build production rồi mở `npm run preview` trong Chromium: thẻ
và cụm trả lời được xem ở 360×780, 390×844 và 620×900 (không tràn ngang, `documentElement.scrollWidth` bằng
bề ngang); nộp đáp án sai hiện phản hồi và lật thẻ; từ màn Kanji quay về Trang chủ chỉ trong
một lần Back (không có entry "rỗng" ở giữa).
Điều hướng mới có test thuần trong `tests/navigation.test.ts`.

### Đã kiểm chứng bằng thao tác thật trên trình duyệt

- Khởi động lần đầu ngoại tuyến được: cài cấu trúc nội dung hạt giống rỗng và không tự thêm thẻ vào thư viện.
- Học thẻ ở chế độ lật thẻ: chấm `Good` → IndexedDB có `interval=1`, `repetitions=1`,
  `lastRating="good"`, `due` cộng 1 ngày. Đúng SM-2.
- Học thẻ ở chế độ tự trả lời: trả lời sai → thẻ được đánh dấu `lastWrongAt`, còn
  `interval` **không đổi** (đúng thiết kế: làm bài không dời lịch ôn).
- Nhập cùng một file hai lần: lần đầu thêm 1 thẻ, lần sau bỏ qua 1 thẻ trùng. Thẻ đã
  có không bị ghi đè.
- Xuất 37 thẻ ra `midori-2026-10-12.json`.
- Tải lại trang: tiến độ, dấu làm sai và thẻ đã nhập đều còn nguyên.
- Xác nhận hai IndexedDB riêng biệt tồn tại: `midori@v1` và `midori-content@v1`.
- Tải lại trang GIỮA phiên học: quay về đúng thẻ đang làm dở, đúng mặt thẻ, và
  đúng chế độ (lật thẻ / tự trả lời) — xem mục bên dưới.

### Lưu và khôi phục phiên học đang dở — đã kiểm chứng

Vấn đề: khi trang tự tải lại vì cập nhật ứng dụng (hoặc người dùng gấp máy rồi mở
lại), một phiên học đang dở trước đây biến mất — người học phải nhớ xem mình đang ở
đâu. Mục tiêu là **quay về đúng chỗ đang làm dở**, mà không kéo theo nhóm lỗi "bản lưu
cũ đè lên nội dung mới".

Cách kiểm chứng: bắt đầu phiên, chấm một thẻ, **bấm lật thẻ** (để `revealed = true`),
rồi tải lại trang trong trình duyệt; sau đó lặp lại với chế độ Tự trả lời.

| Điều kiểm chứng | Kết quả |
|---|---|
| Chế độ lật thẻ, tải lại giữa phiên | Về đúng thẻ (tiến độ `1/20`), thẻ đã ở mặt đáp án, bốn mức chấm đã có sẵn khoảng ôn |
| Chế độ tự trả lời, tải lại sau khi trả lời sai | Về đúng thẻ đó, ô nhập rỗng, không còn thông báo đúng/sai cũ |
| Thông báo cho người học | Hiện "Đã khôi phục phiên học đang dở." |
| Màn hình đang mở | Trở lại đúng màn hình Học thay vì về Trang chủ |
| Chấm xong tất cả thẻ | Bản lưu bị xoá; tải lại không thấy phiên cũ nữa |
| Dấu "làm sai" đã ghi | Còn nguyên trong thư viện (đã ghi ngay khi trả lời, không chờ rời thẻ) |

Ba quyết định đằng sau hành vi này (vì sao lưu ở database người dùng, vì sao chỉ lưu
id, vì sao có hạn dùng 12 giờ) nằm ở mục 8 và ở
[docs/decisions.md](docs/decisions.md).

### Giao diện: token thiết kế và chuyển động — đã kiểm chứng

Phiên này hiện đại hoá lớp trình bày, không đụng tới nghiệp vụ:

| Hạng mục | Trước | Sau |
|---|---|---|
| Hệ thống thiết kế | Biến rải rác theo component | Token tập trung ở `src/app.css` (bảng màu, bo góc, đổ bóng, thang chuyển động) |
| Thẻ học | Đổi nội dung tại chỗ | Lật 3D hai mặt (`rotateY`), mặt đáp án được đánh dấu `aria-hidden` khi chưa lật |
| Điều hướng | Bốn tab tĩnh | Bốn tab có biểu tượng SVG nội tuyến + chỉ báo động theo màn hình đang mở |
| Chuyển màn hình | Đổi tức thời | Trượt lên + mờ dần (`fly`, 260 ms) |
| Trạng thái chờ | Chuỗi văn bản | Khung xương nhấp nháy, viên gradient ở màn hình khởi động |
| Chấm điểm | Nhãn chữ | Bốn mức có sắc thái riêng **và** hiện trước khoảng ôn sẽ tạo ra |
| Giảm chuyển động | Không xử lý | Tôn trọng `prefers-reduced-motion: reduce` |

`prefers-reduced-motion` được xử lý ở cả ba chỗ có chuyển động vô hạn hoặc lặp
(`app.css`, màn hình khởi động, khung xương của màn Học) — người bật thiết lập này
không thấy bất kỳ vòng lặp nào, chứ không chỉ là một khối `@media` hình thức.

> **Mức kiểm chứng của phần này.** Các con số dung lượng là đo thật (`vite build`), và
> chuyển đổi lật thẻ đã được đọc lại từ CSS của bản dựng đang chạy
> (`transition-duration` = `.48s`, lấy từ `--dur-4`). Riêng đường
> `prefers-reduced-motion` **chưa** được thử bằng cách bật thiết lập ở cấp hệ điều
> hành: mới xác nhận quy tắc có trong bundle và áp lên `*` với `!important` (xem
> `grep prefers-reduced-motion dist/assets/*.css`). Xem thêm hạn chế số 14 ở mục 11.

Chi tiết cấu trúc và chi phí dung lượng ở mục 8, 9 và
[docs/decisions.md](docs/decisions.md).

### Ngoại tuyến thật — đã kiểm chứng

Cách kiểm chứng: chạy `npm run preview`, để service worker cài xong, chấm một thẻ,
**dừng hẳn máy chủ** (xác nhận cổng đã đóng và `curl` không kết nối được), rồi tải
lại trang trong trình duyệt.

Kết quả:

- Trang tải lại và dựng đầy đủ từ precache dù origin không truy cập được: hiện tiêu
  đề, thống kê và ba collection mặc định rỗng.
- Lõi Rust/WASM chạy được (số liệu thống kê được tính lại sau khi khởi động).
- Học tiếp và chấm điểm được khi ngoại tuyến; ghi thẳng vào IndexedDB.
- Tiến độ đã chấm trước đó còn nguyên sau khi tải lại ngoại tuyến.
- Precache đúng 9 mục, và **không** chứa `/data/content/**` — đúng quyết định số 5.

### Cập nhật nội dung — đã kiểm chứng cả nhánh "đã cập nhật"

Cách kiểm chứng: sửa `content/` rồi sinh lại (`contentVersion` `.1` → `.2`), trong đó
**đổi nội dung** một thẻ đã học, **xoá** một thẻ khác, và **thêm** một thẻ mới; sau đó
bấm "Kiểm tra cập nhật nội dung" trong trình duyệt.

| Điều kiểm chứng | Kết quả |
|---|---|
| Phiên bản nội dung sau khi cập nhật | `2026.10.12.2` |
| Ngăn lưu trữ sau khi chuyển đổi | `active` + `previous`; `staging` đã được dọn |
| Thẻ đã học (`v-anata`) | 4 trường nội dung đổi; `interval=1`, `repetitions=1`, `lastRating="good"` **giữ nguyên** |
| Thẻ bị xoá khỏi nội dung (`v-hiru`) | **Vẫn còn** trong thư viện |
| Thẻ mới (`v-douzo`) | Được thêm |
| Thư viện | 36 → 37 thẻ (không thẻ nào bị mất) |

### Cập nhật ứng dụng và kiểm tra bản công bố — đã kiểm chứng

- Phát hiện bản dựng mới đang chờ: giao diện Cài đặt báo "Có bản dựng mới đang chờ
  kích hoạt" mà không cần thao tác gì thêm.
- Bấm "Cập nhật và tải lại" với một bản dựng thật có tên tệp JS khác: trang tải lại
  sạch, **không trắng trang**, precache chỉ còn tài nguyên của bản mới, dữ liệu người
  học không đổi.
- "Kiểm tra bản mới" đọc `/data/version.json` thật và báo "Đang chạy bản mới nhất
  (1.0.1)".
- Cập nhật ứng dụng **không** chạm vào nội dung đang dùng hay tiến độ học.

### Lỗi tìm thấy và đã sửa khi xem bản dựng giao diện

Hai lỗi dưới đây chỉ lộ ra khi **nhìn** vào bản dựng đang chạy; `svelte-check` và cả
hai lớp test đều không thấy, vì cả hai đều đúng về mặt kiểu và logic.

1. **Năm ô thống kê ngang nhau làm bố cục trông như lỗi.** Trên màn hẹp, ô thứ năm rơi
   xuống một mình. Đã sửa: ba số dẫn dắt hành động được đặt riêng và to, hai số còn lại
   gộp vào một dòng tóm tắt.
2. **Số liệu ở Trang chủ không được tính lại sau khi học xong.** Người dùng vừa chấm
   thẻ, quay về Trang chủ, và vẫn thấy số cũ. Đã sửa: Trang chủ gọi `refreshStats()`
   khi được dựng, và chỗ đếm tiến độ dùng `total - new` thay vì trừ thẻ mới hai lần
   (`new` là tập con của `due`).

### Lỗi tìm thấy và đã sửa khi kiểm chứng luồng cập nhật

Hai lỗi dưới đây cũng chỉ lộ ra khi chạy thật trong trình duyệt, ở phiên kiểm chứng
trước đó; test tự động không thấy.

1. **Bấm "Cập nhật và tải lại" làm ứng dụng trắng trang.** `applyAppUpdate()` tải lại
   trang *ngay sau khi* gửi `SKIP_WAITING`, lúc đó service worker **cũ** vẫn điều
   khiển và phục vụ `index.html` cũ trỏ tới file JS mà bản dựng mới đã xoá ⇒ trang
   trắng cho tới khi người dùng tự tải lại lần nữa. Đã sửa: chờ sự kiện
   `controllerchange` (có giới hạn thời gian) rồi mới tải lại. Chi tiết ở
   [docs/decisions.md](docs/decisions.md).
2. **`/data/version.json` chưa từng được sinh.** `checkDeployedVersion()` tìm file
   này nhưng không script nào tạo ra nó; máy chủ tĩnh trả `index.html` với mã 200
   (SPA fallback), `response.json()` ném lỗi và bị nuốt ở `catch`, nên lỗi cấu hình
   trông y hệt "đang ngoại tuyến". Đã sửa: plugin Vite ghi file khi build, và bộ đọc
   kiểm tra `content-type` để không nuốt lỗi nữa.

### Lỗi tìm thấy và đã sửa ở vòng hiện đại hoá thứ hai

Vòng này bắt đầu bằng hai lỗi trải nghiệm tìm thấy khi chạy thật, rồi mới mở rộng lớp
trình bày:

| Hạng mục | Trước | Sau |
|---|---|---|
| Hàng bộ thẻ trên Trang chủ | Mọi hàng đều mở màn Học với bộ mặc định | Mở **đúng bộ vừa chạm**; cùng bộ thì tiếp tục phiên đang dở, khác bộ thì bỏ phiên cũ **và nói rõ** |
| Màn chọn bộ của Học | Chỉ báo "không có thẻ nào tới hạn" **sau khi** bấm | Hiện số thẻ tới hạn ngay trên nút; bằng 0 thì nút bị vô hiệu hoá kèm nhãn giải thích |
| Tổng kết phiên | "Đã đi qua N thẻ" — đếm cả thẻ bỏ qua | "Đã chấm N thẻ" — khớp với dòng trạng thái trong phiên |
| Nút phục hồi nội dung | Bấm mà không có phản hồi nào | Báo rõ: đã quay lại / không có bản trước / đã cài lại seed |
| Chữ | Cỡ cố định | Cỡ co giãn `clamp()`, `text-wrap: balance` cho tiêu đề, `pretty` cho đoạn văn |
| Màn rộng | Một cột 640px | Rộng 780px rồi 940px; Trang chủ chia hai cột từ 780px |
| Điều hướng dưới | Chỉ có lớp `backdrop-filter` | Thêm phương án nền đặc cho máy không hỗ trợ, và tôn trọng `prefers-reduced-transparency` |
| Tương phản | Không xử lý | `prefers-contrast: more` đẩy mạnh viền và chữ mờ |

Số thẻ hiện trước khi bắt đầu lấy từ **đúng phép lọc** mà `start()` dùng, nên nó không
thể lệch với hàng đợi thật; và việc "mở đúng bộ" đi qua `requestedDeckId` do màn trước
đặt rồi màn Học **tiêu thụ một lần** — không để lại giá trị cũ ám vào lần mở sau.

> **Mức kiểm chứng.** Các đường đi đều được chạy thật trong trình duyệt: mở đúng bộ từ
> Trang chủ ở **cả hai** nhánh (cùng bộ → tiếp tục phiên ở `1/6`; khác bộ → bỏ phiên cũ
> kèm thông báo), số thẻ tới hạn ở **cả hai** nhánh (giới hạn thẻ mới bằng 0 → nút bị
> vô hiệu hoá), phiên hoàn tất, chủ đề sáng và tối, 360px không có phần tử nào tràn
> ngang, 1000px cho ra bố cục hai cột với `.screen` rộng 940px, console sạch, và bản
> dựng qua `npm run preview` sau khi cập nhật ứng dụng.

### Phục hồi nội dung và nhánh ngoại tuyến — đã kiểm chứng

Hai đường đi từng nằm trong mục "Chưa kiểm chứng":

- **Bấm "Quay lại bản trước"** khi ngăn `previous` tồn tại → nội dung đang dùng được
  phục hồi ("Đã quay lại bản nội dung trước."), thẻ và tiến độ giữ nguyên.
- **Bấm "Quay lại bản trước"** khi **không** có bản trước → báo rõ "Không có bản nội
  dung trước để quay lại." thay vì im lặng như trước.
- **Kiểm tra cập nhật nội dung khi đang ngoại tuyến** (máy chủ đã dừng, `curl` trả
  `000`) → báo đúng "Không có mạng. Vẫn dùng nội dung đang có trên thiết bị.", nội dung
  đang dùng và thư viện không đổi.

### Chưa triển khai

- Nội dung mặc định: bản dựng phát hành **0 thẻ**; 50 bài Từ vựng, 50 bài Mẫu câu và
  7 nhóm Kanji là cấu trúc rỗng để người dùng tự nhập hoặc tự tạo thẻ.
- Bổ sung dữ liệu cho sáu nhóm Kanji còn lại; nguồn và giấy phép nội dung vẫn cần xác minh.
- Tìm kiếm giao diện trên thư viện; lõi chỉ cung cấp bộ lọc thuần, UI chưa dùng cho tra cứu.
- Luồng ẩn/khôi phục/xoá thẻ và quy tắc bảo toàn thẻ mồ côi.
- Thống kê lịch sử và độ chính xác theo thời gian (chưa được lưu trong schema).
- Đồng bộ đa thiết bị (ngoài phạm vi hiện tại).

### Chưa kiểm chứng

Đây là phần **quan trọng nhất** của mục này. Những điều sau **chưa được chạy thật**,
chỉ mới có mã nguồn hoặc test tự động:

- **Kích hoạt nguyên tử khi IndexedDB thật hết dung lượng.** Đã mô phỏng bằng store
  giả trong test; chưa ép được lỗi quota thật.
- **Nhánh thất bại của cập nhật nội dung trong trình duyệt.** Test tự động có phủ
  (băm sai, tải lỗi, schema không tương thích), nhưng chưa dựng tình huống hỏng thật
  trong trình duyệt.
- **Thiết bị thật.** Chưa thử trên điện thoại, Safari, Firefox. Mới thử trên Chromium
  của môi trường phát triển.
- **Cài đặt PWA** (thêm vào màn hình chính) và biểu tượng maskable trên thiết bị thật.
- **Chế độ dev không có service worker.** `devOptions.enabled: false`, nên mọi kiểm
  chứng về service worker đều phải chạy qua `npm run preview`.

---

## 4. Kiến trúc

### Công nghệ và vai trò

| Công nghệ | Vai trò | Vì sao chọn |
|---|---|---|
| **Rust 2021** | Toàn bộ logic nghiệp vụ | Kiểm thử độc lập, chạy native, không cần trình duyệt; hợp đồng vào/ra rõ ràng |
| **wasm-bindgen + wasm-pack** | Cầu nối Rust ↔ JS | Chuẩn của hệ sinh thái, xuất mô-đun ESM mà Vite hiểu được |
| **Svelte 5** | Giao diện | Kế thừa từ Mitsuha; đã chứng minh phù hợp; biên dịch ra JS nhỏ |
| **Vite 7** | Bundler, dev server | Nhanh, xử lý tốt `new URL(..., import.meta.url)` cho file `.wasm` |
| **vite-plugin-pwa** | Service worker, precache | Sinh service worker Workbox; đủ dùng, không phải tự viết |
| **idb** | Bọc IndexedDB | API Promise gọn; giao dịch vẫn là giao dịch thật của IndexedDB |
| **TypeScript** | Kiểu cho lớp JS | Bắt lệch hợp đồng ngay lúc viết |

Không dùng `serde-wasm-bindgen`, không dùng `vite-plugin-wasm`, không dùng
`unicode-normalization`. Lý do ở [docs/decisions.md](docs/decisions.md).

### Luồng dữ liệu

```
        ┌────────────────────────────────────────────────────────────┐
        │  Giao diện Svelte (src/ui, src/app)                        │
        │  DOM, sự kiện, trạng thái màn hình                         │
        └───────────────┬────────────────────────────┬───────────────┘
                        │                            │
             (1) gọi hàm có kiểu           (2) đọc/ghi dữ liệu
                        │                            │
        ┌───────────────▼───────────────┐  ┌─────────▼─────────────────┐
        │  src/core  — mặt tiền WASM    │  │  src/storage              │
        │  bóc phong bì, ném CoreError  │  │  IndexedDB "midori"       │
        └───────────────┬───────────────┘  │  (thẻ, cài đặt, mốc đồng bộ)│
                        │ chuỗi JSON        └───────────────────────────┘
        ┌───────────────▼───────────────┐
        │  midori-wasm (Rust, mỏng)     │  ┌───────────────────────────┐
        │  chuyển tiếp, không logic     │  │  src/content              │
        └───────────────┬───────────────┘  │  IndexedDB "midori-content"│
                        │                  │  (nội dung xuất bản)       │
        ┌───────────────▼───────────────┐  └───────────────────────────┘
        │  midori-core (Rust thuần)     │
        │  SRS, thẻ, nhập/xuất, thống   │
        │  kê, lọc, chấm bài, đồng bộ   │
        └───────────────────────────────┘
```

### Ranh giới quan trọng

1. **Lõi Rust là hàm thuần.** Không giữ trạng thái, không biết DOM, không biết
   IndexedDB, không biết mạng. Nhờ vậy `cargo test` chạy được toàn bộ nghiệp vụ mà
   không cần trình duyệt.
2. **Chỉ một nơi chạm vào WASM.** `src/core/wasm.ts`. Phần còn lại đi qua mặt tiền
   có kiểu ở `src/core/index.ts`.
3. **Thư viện thẻ thuộc về IndexedDB, không thuộc về Rust.** Tránh hai nguồn sự thật.
4. **Sinh id là việc của nền tảng.** `crypto.randomUUID()` ở JS đi vào Rust, không
   phải ngược lại — nhờ đó lõi vẫn là hàm thuần.
5. **Nội dung và dữ liệu người dùng nằm ở hai IndexedDB khác nhau.** Pipeline cập
   nhật nội dung không mở được database người dùng, kể cả khi có lỗi.

---

## 5. Cấu trúc thư mục

```
midori/
├── README.md                     ← tài liệu trung tâm (bạn đang đọc)
├── docs/                         ← tài liệu chuyên sâu
│   ├── architecture.md           ← luồng dữ liệu, ranh giới module
│   ├── contract.md               ← hợp đồng Rust ↔ JavaScript
│   ├── data-model.md             ← mô hình thẻ, SRS, schema lưu trữ
│   ├── offline-and-updates.md    ← cập nhật ứng dụng vs cập nhật nội dung
│   ├── verification.md           ← quy trình kiểm chứng bằng thao tác thật
│   ├── decisions.md              ← nhật ký quyết định kiến trúc
│   └── roadmap.md                ← kế hoạch chi tiết
│
├── content/                      ← NGUỒN SỰ THẬT của nội dung xuất bản
│   ├── content.json              ← phiên bản nội dung + danh sách gói
│   └── bundles/*.json            ← nội dung từng bộ (id thẻ ổn định)
│
├── crates/                       ← Rust
│   ├── midori-core/              ← toàn bộ logic nghiệp vụ (thuần Rust)
│   │   └── src/
│   │       ├── api.rs            ← hợp đồng chuỗi JSON cho lớp WASM
│   │       ├── srs.rs            ← SM-2
│   │       ├── card.rs           ← mô hình thẻ, chuẩn hoá, di trú
│   │       ├── content.rs        ← đồng bộ nội dung ↔ thư viện
│   │       ├── import.rs         ← đọc JSON/CSV/TSV
│   │       ├── export.rs         ← dựng nội dung file xuất
│   │       ├── quiz.rs           ← câu hỏi, đáp án, chấm bài
│   │       ├── stats.rs          ← thống kê, lọc, tóm tắt bài
│   │       ├── session.rs        ← trộn hàng đợi + khôi phục phiên đang dở
│   │       ├── text.rs           ← phân tích văn bản
│   │       ├── json.rs           ← truy cập JSON khoan dung
│   │       └── error.rs          ← một quy tắc lỗi duy nhất
│   └── midori-wasm/              ← biên WASM, chỉ chuyển tiếp
│
├── src/                          ← JavaScript / TypeScript
│   ├── main.ts                   ← điểm vào
│   ├── app.css                   ← token thiết kế, chuyển động, kiểu dùng chung
│   ├── app/
│   │   ├── screen.ts             ← kiểu màn hình + SECTION_OF (module lá, tránh phụ thuộc vòng)
│   │   ├── navigation.ts         ← entry history thuần + quy tắc Back/Home
│   │   ├── collection.ts         ← phạm vi Collection (all/deck/lesson) + nhãn hiển thị
│   │   ├── session-plan.ts       ← SessionRequest + bộ lọc hàng đợi dùng chung với Collection
│   │   ├── content-sections.ts   ← danh mục Từ vựng/Kanji/Mẫu câu (nguồn nhãn, deckId)
│   │   ├── random-study.ts       ← cỡ mẫu phiên ngẫu nhiên (hiển thị + hàng đợi, một công thức)
│   │   ├── transfer.ts           ← luật đọc file nhập + chọn tập thẻ để xuất (kiểm thử được)
│   │   └── store.svelte.ts       ← trạng thái ứng dụng, điều phối, history
│   ├── core/                     ← mặt tiền WASM (nơi duy nhất chạm WASM)
│   ├── content/                  ← mô hình + pipeline nội dung xuất bản
│   ├── storage/
│   │   ├── db.ts                 ← mở database, quy tắc dữ liệu phẳng
│   │   ├── cards.ts              ← kho thẻ
│   │   ├── settings.ts           ← cài đặt, mốc đồng bộ nội dung
│   │   └── session.ts            ← phiên học đang dở + màn hình đang mở
│   ├── platform/                 ← năng lực nền tảng (uuid, sha256, tải file)
│   ├── pwa/                      ← service worker và cập nhật ứng dụng
│   ├── ui/                       ← component Svelte
│   │   ├── App.svelte            ← vỏ, điều hướng, nạp màn hình theo gói
│   │   ├── PageHeader.svelte     ← tiêu đề màn hình và điều khiển Back
│   │   ├── Icon.svelte           ← biểu tượng SVG nội tuyến (không thêm dependency)
│   │   ├── Home.svelte           ← Trang chủ: hero ưu tiên + danh mục + thư viện + Bộ khác
│   │   ├── Study.svelte          ← Học: danh mục ba chủ đề + tiếp tục phiên dở
│   │   ├── StudyCategories.svelte← hàng chủ đề dùng chung Home/Học
│   │   ├── Lessons.svelte        ← 50 bài Minna · PatternLessons.svelte: 50 bài mẫu câu
│   │   ├── KanjiOverview.svelte  ← bảy nhóm Kanji
│   │   ├── Collection.svelte     ← màn phạm vi: thống kê, xem trước, cấu hình, bắt đầu
│   │   ├── Session.svelte        ← phiên học: hàng đợi, lật thẻ/tự trả lời, khôi phục
│   │   ├── DeckRow/StructureBar/AnimatedNumber.svelte + deck-rows.ts/motion.ts
│   │   ├── Transfer.svelte       ← Nhập/xuất: ba tác vụ Nhập · Xuất · Sao lưu
│   │   ├── TransferScope.svelte  ← bộ chọn chủ đề + phạm vi dùng chung cho cả hai tác vụ
│   │   └── Settings/StatsDetail/CardEditor.svelte
│   └── generated/                ← SINH TỰ ĐỘNG (không nằm trong git)
│
├── scripts/
│   ├── build-content.mjs         ← content/ → manifest + gói + seed ngoại tuyến
│   └── gen-icons.mjs             ← sinh biểu tượng PWA (không cần thư viện ngoài)
│
├── tests/                        ← test JS/TS, chạy bằng node --test
│   ├── wasm-contract.test.ts     ← hợp đồng Rust/WASM ↔ JS (WASM thật)
│   ├── content-pipeline.test.ts  ← pipeline cập nhật nội dung
│   ├── pwa-version.test.ts       ← so sánh phiên bản
│   ├── navigation.test.ts        ← entry history + quy tắc Back/Home
│   ├── transfer.test.ts          ← luật đọc file nhập/xuất (WASM thật)
│   └── session-storage.test.ts   ← chuẩn hoá bản lưu phiên học + kiểm tra màn hình
│
├── public/                       ← tài nguyên không qua build
│   ├── manifest.webmanifest
│   ├── icons/                    ← biểu tượng PWA
│   └── data/content/             ← nội dung đã công bố (sinh tự động)
│
│   (dist/data/version.json do plugin trong vite.config.ts sinh khi build)
│
├── Cargo.toml                    ← workspace Rust
├── package.json                  ← manifest JS và các lệnh
├── vite.config.ts                ← Vite + PWA (không precache nội dung)
└── tsconfig.json
```

---

## 6. Phân chia trách nhiệm Rust / WASM / JavaScript / PWA

Bảng dưới là **quy tắc quyết định** khi thêm tính năng mới: viết vào đâu?

| Công việc | Nơi viết | Vì sao |
|---|---|---|
| Thuật toán, quy tắc nghiệp vụ, xác thực dữ liệu | **Rust** (`midori-core`) | Kiểm thử độc lập, chạy native, dùng chung mọi giao diện |
| Phân tích file, chuyển đổi dữ liệu, thống kê | **Rust** | Xử lý theo lô, một lần vượt biên cho cả tập dữ liệu |
| Đọc/ghi IndexedDB, Cache Storage | **JS** | Là API của nền tảng |
| Sinh id, băm, đồng hồ | **JS** (`src/platform`) | Năng lực nền tảng, và giữ lõi Rust thuần |
| DOM, sự kiện, chuyển cảnh, trạng thái màn hình | **JS** | Chỉ tồn tại trong trình duyệt |
| Đối chiếu bản lưu phiên với thư viện hiện tại | **Rust** (`session.rs`) | Là quy tắc nghiệp vụ (bỏ id đã mất, tính lại vị trí); giao diện không được tự đoán |
| Lưu/đọc bản lưu phiên học và màn hình đang mở | **JS** (`src/storage`) | IndexedDB là API của nền tảng |
| Service worker, precache, vòng đời PWA | **JS** (`src/pwa`) | API của trình duyệt |
| Tải nội dung, kiểm tra toàn vẹn, kích hoạt | **JS** (`src/content`) | Cần mạng và IndexedDB |

Nguyên tắc chống trùng lặp: **một quy tắc nghiệp vụ chỉ tồn tại ở một nơi.** Ví dụ,
quy tắc "thẻ nào là thẻ mới" chỉ có trong `srs.rs`; giao diện đọc kết quả từ
`deckStats` chứ không tự đếm.

---

## 7. Lưu trữ và đồng bộ dữ liệu

### Hai loại dữ liệu, hai IndexedDB

| | `midori` (dữ liệu người dùng) | `midori-content` (nội dung xuất bản) |
|---|---|---|
| Chứa | Thẻ, lịch SRS, cài đặt, mốc đồng bộ | Manifest đã tải, các gói thẻ đã xác minh |
| Ghi bởi | `src/storage` | `src/content` |
| Khi cập nhật nội dung | **Không bị chạm tới** | Được thay thế |
| Mất dữ liệu | Không thể phục hồi từ nội dung | Cài lại được từ mạng hoặc hạt giống |

Việc tách hai database là **bảo đảm bằng cấu trúc**: module pipeline cập nhật nội
dung không import lớp lưu trữ người dùng, nên không thể ghi nhầm.

### Cầu nối duy nhất: `content_reconcile`

Nội dung xuất bản và thư viện người học chỉ gặp nhau ở một hàm Rust:

| Tình huống | Hành vi |
|---|---|
| Thẻ nội dung đã có, nội dung đổi | Cập nhật 4 trường nội dung, **giữ nguyên** lịch SRS, id, ngày tạo |
| Thẻ nội dung mới | Tạo thẻ ở trạng thái chưa học |
| Thẻ biến mất khỏi nội dung | **Không xoá** — chỉ báo về trong `orphaned` |
| Thẻ người dùng tự tạo | Không bao giờ bị coi là mồ côi, không bao giờ bị sửa |

Danh tính để đối chiếu là `id` do nhà phát hành nội dung đặt trong `content/`. Vì
vậy **`id` của một thẻ còn tồn tại thì không được đổi** — đổi id đồng nghĩa với xoá
thẻ cũ và tạo thẻ mới, làm mất tiến độ học.

### Kích hoạt nguyên tử

Nội dung đang dùng nằm ở ngăn `active` của `midori-content`, với hai ngăn phụ:
`staging` (đã tải và xác minh, chưa dùng) và `previous` (để phục hồi).

Chuyển đổi chạy trong **một giao dịch IndexedDB**: `staging → active`,
`active cũ → previous`, xoá `staging`. Giao dịch IndexedDB là nguyên tử, nên không
tồn tại trạng thái "nội dung cũ đã bị xoá nhưng nội dung mới chưa sẵn sàng".

### Phiên học đang dở nằm ở đâu, và vì sao

Phiên học đang dở và màn hình đang mở được lưu trong store `meta` của database
người dùng (`midori`), không phải database nội dung.

| Trường | Ý nghĩa |
|---|---|
| `deckId`, `mode` | Bộ đang học và chế độ (lật thẻ / tự trả lời) |
| `queue` | **Danh sách id thẻ**, theo đúng thứ tự hàng đợi |
| `index`, `revealed` | Vị trí hiện tại và mặt thẻ đang nhìn |
| `rated`, `mistakes` | Số đếm của phiên |
| `savedAt` | Mốc lưu, để áp hạn dùng |

Ba quy tắc quan trọng:

1. **Chỉ lưu id, không lưu nội dung thẻ.** Một bản lưu chứa bản sao nội dung sẽ cũ đi
   sau mỗi lần cập nhật nội dung — và tệ hơn, khi chấm điểm bản sao cũ đó sẽ bị ghi
   đè lên nội dung mới. Lưu id rồi tra lại thư viện **hiện tại** loại bỏ hẳn nhóm lỗi
   này, đổi lại phải xử lý được trường hợp thẻ đã biến mất.
2. **Đối chiếu id là việc của lõi Rust** (`session::restore`). Nó bỏ id không còn
   trong thư viện, bỏ id trùng lặp, và **tính lại `index`** — nếu hai thẻ trước thẻ
   đang học bị bỏ thì vị trí phải giảm đi hai, không được giữ nguyên. Giao diện chỉ
   hiển thị `dropped` cho người học biết phiên ngắn hơn mình nhớ.
3. **Bản lưu là dữ liệu phụ, không bao giờ được chặn khởi động.** Bản ghi hỏng, do
   phiên bản cũ ghi, hoặc quá cũ đều trở thành "không có phiên nào" thay vì ném lỗi.

Hạn dùng là **12 giờ**. Lý do: hàng đợi được dựng từ trạng thái "tới hạn NGAY BÂY
GIỜ" lúc bắt đầu, nên sau một khoảng đủ dài việc khôi phục nó sẽ khiến người học ôn
những thẻ chưa tới hạn; 12 giờ bao đúng trường hợp cần tới (trang tự tải lại, hoặc gấp
máy rồi mở lại) mà không giữ lại hàng đợi đã vô nghĩa.

---

## 8. Quyết định kiến trúc quan trọng

Tóm tắt; chi tiết và bối cảnh đầy đủ ở [docs/decisions.md](docs/decisions.md).

1. **Hợp đồng qua biên WASM là chuỗi JSON có phong bì.** Một quy tắc lỗi duy nhất
   cho mọi hàm: `{"ok":true,"data":…}` hoặc `{"ok":false,"error":{…}}`. Lớp JS chỉ
   cần một hàm bóc phong bì. Đánh đổi: mất một lần `JSON.parse`, được hợp đồng kiểm
   thử được ở native và không cần `serde-wasm-bindgen`.

2. **Lõi Rust không giữ trạng thái; id sinh ở JS.** Tránh hai nguồn sự thật và giữ
   lõi thuần khiết để `cargo test` chạy đủ mọi nghiệp vụ.

3. **Bỏ `unicode-normalization` (NFKC), thay bằng quy full-width ASCII.** Đo được:
   NFKC làm file WASM tăng **~128 KB** (341 KB → 213 KB khi bỏ). Các trường hợp NFKC
   xử lý thêm không xuất hiện trong dữ liệu thẻ của Midori. Hệ quả đã biết: katakana
   nửa độ rộng không được quy đổi.

4. **Tắt `wasm-opt` có chủ đích.** binaryen 117 trong cache không xác thực được
   codegen hiện tại của Rust, làm hỏng build. Bật lại chỉ đổi lấy ~6% kích thước,
   nhưng gắn chặt build vào một phiên bản binaryen cụ thể. Ưu tiên build tái lập được.

5. **Nội dung xuất bản KHÔNG được precache cùng ứng dụng.** Nếu service worker
   precache `/data/content/**`, bản d deploy mới của nội dung sẽ bị cache che và hai
   loại cập nhật lại phụ thuộc nhau — đúng thứ đặc tả §7.2 cấm.

6. **Nội dung hạt giống được đóng vào bundle.** Để lần chạy đầu tiên ngoại tuyến vẫn
   có thẻ học. Sinh từ cùng nguồn `content/` nên không có hai bản dữ liệu phải giữ
   khớp bằng tay.

7. **Hợp nhất hai quy tắc đọc trường `reading` cũ của Mitsuha thành một.** Mitsuha
   có hai quy tắc khác nhau ở hai đường đọc dữ liệu; Midori dùng một quy tắc dựa
   trên hệ chữ (kana thuần → furigana, còn lại → romaji). Với dữ liệu thật của cả
   hai dự án, kết quả không đổi.

8. **Làm bài kiểm tra và luyện SRS tách hẳn nhau.** Trả lời ở chế độ tự trả lời chỉ
   ghi dấu đúng/sai cho bộ lọc "Chưa thuộc", **không** dời lịch ôn.

9. **Dynamic Island đã được loại bỏ ở Phase 6.** Các màn hình dùng header và điều
   khiển điều hướng thông thường; History API chỉ theo dõi màn hình, không còn overlay.

10. **Cập nhật ứng dụng phải chờ service worker MỚI điều khiển rồi mới tải lại.**
    Gửi `SKIP_WAITING` xong là tải lại ngay sẽ để service worker cũ phục vụ
    `index.html` cũ, trỏ tới file JS đã bị bản dựng mới xoá ⇒ **trắng trang** (đã
    gặp thật). Chờ `controllerchange` là thời điểm duy nhất bảo đảm HTML và tài
    nguyên được phục vụ bởi cùng một service worker, tức cùng một phiên bản — đúng
    yêu cầu §7.2A. Chi tiết ở [docs/decisions.md](docs/decisions.md).

11. **`/data/version.json` do plugin Vite sinh, không precache.** Cần thiết vì
    service worker chỉ phát hiện bản mới khi có tài nguyên precache đổi; bản phát
    hành chỉ đổi phiên bản sẽ không kích hoạt được nó. File này dùng chung
    `pkg.version` với `__APP_VERSION__` nên hai giá trị không thể lệch nhau, và
    **không** được precache — phải luôn đọc từ mạng mới có ý nghĩa.

12. **Phiên học đang dở được lưu, để việc cập nhật ứng dụng không phá buổi học.**
    Cập nhật ứng dụng kết thúc bằng một lần tải lại trang; không có bản lưu thì người
    học mất ngữ cảnh giữa buổi. Bản lưu nằm ở database **người dùng** (pipeline nội
    dung không chạm tới được) và chỉ chứa **id thẻ**, không chứa nội dung — xem mục 7.

13. **Hạn dùng bản lưu phiên là 12 giờ, không phải "đến khi học xong".** Hàng đợi
    phản ánh trạng thái "tới hạn" tại thời điểm bắt đầu. Khôi phục vô hạn thời gian
    sẽ biến nó thành danh sách thẻ chưa tới hạn. Có hạn dùng thì cả hai mục tiêu đều
    đạt: sống sót qua tải lại trong ngày, và không khôi phục thứ vô nghĩa.

14. **Hiện đại hoá giao diện bằng token và chuyển động, không thêm dependency.**
    Toàn bộ biểu tượng là SVG nội tuyến (`src/ui/Icon.svelte`), chuyển cảnh dùng
    `svelte/transition` có sẵn. Đổi lại: CSS tăng từ 6,5 KB lên 19,7 KB (gzip 2,0 →
    4,8 KB) và JS 108,4 → 123,5 KB (gzip 37,6 → 42,4 KB) — khoảng **+7,7 KB gzip** cho
    riêng lớp giao diện, đã đo ở mục 9. Chọn mức này thay vì kéo một thư viện UI, vốn
    sẽ tốn hơn nhiều lần và phá quy tắc "không dùng framework CSS".

15. **Điều hướng đi qua History API, không chỉ đổi một biến trạng thái.** Trước đây
    `go()` chỉ gán `screen`; nay mỗi lần đổi màn hình có entry điều hướng, thay
    (`replaceState`) entry đầu tiên thay vì đẩy. Dynamic Island và overlay history
    đã được loại bỏ ở Phase 6. Hình dạng entry và quy tắc thuần nằm ở
    `src/app/navigation.ts`, có test.

> **Quy tắc bắt buộc khi viết mã giao diện:** dữ liệu đi xuống IndexedDB phải dùng
> `$state.raw`, không dùng `$state`. Proxy do `$state` bọc sâu không truyền được qua
> `structured clone` và sẽ gây `DataCloneError`. Chi tiết ở
> [src/storage/db.ts](src/storage/db.ts).

---

## 9. Kiểm chứng: cách chạy và đã đo được gì

### Chạy toàn bộ

```bash
npm run generate
npm run check
npm run build
```

`check` không tự sinh mã. `build` tự gọi `generate` rồi mới chạy `vite build`.

### Kết quả kiểm chứng tự động sau Phase 4 — 2026-10-13

| Bài kiểm tra | Kết quả |
|---|---|
| `cargo test --workspace` | **131 passed, 0 failed** |
| `node --test tests/*.test.ts` | **106 passed, 0 failed** |
| `svelte-check --threshold error` | **0 errors, 0 warnings** |
| `npm run check` | Thành công; wall time 4.53 s trên workstation đã mô tả |
| `npm run build` | Thành công; wall time 3.65 s, Vite 1.10 s; sinh WASM/content và production PWA |
| Browser smoke (Chromium, production preview) | Phase 1: Kanji/Editor/navigation và backup hợp lệ/lỗi. Phase 2: quiz sai tạo weak card, Home mở đúng 1-card weak session, reload khôi phục focus/queue/revealed; SRS không bị đổi bởi quiz. Phase 4: lỗi ghi screen preference có cảnh báo trên final build; offline refresh được smoke trước thay đổi persistence cuối. |

Ba lớp test có mục đích khác nhau, không thay thế nhau:

- **`cargo test`** — kiểm tra logic nghiệp vụ ở native. Nhanh, không cần trình duyệt.
- **`node --test tests/`** — kiểm tra **hợp đồng** giữa Rust/WASM và JavaScript bằng
  mô-đun WASM **thật** trong Node. Bắt được lỗi mà `cargo test` không thể thấy: hàm
  bị đổi tên khi sinh WASM, tên trường JSON bị lệch, phong bì sai hình dạng.
  Một test tự đối chiếu danh sách hàm trong `.d.ts` sinh ra với hàm thật có ở runtime.
- **Thao tác tay trên trình duyệt** — kiểm tra thứ mà cả hai lớp trên không chạm tới:
  IndexedDB, service worker, và sự liên kết giữa các lớp. Quy trình lặp lại được
  nằm ở [docs/verification.md](docs/verification.md).

Mọi kiểm chứng liên quan tới service worker **phải** chạy qua `npm run preview`:
chế độ dev tắt service worker (`devOptions.enabled: false`), nên hành vi ngoại tuyến
và hành vi cập nhật không tồn tại ở đó.

Phase 4 baseline, benchmark instructions, release guardrails, failure-path evidence,
and known browser gaps are maintained in
[docs/release-readiness.md](docs/release-readiness.md). The earlier test counts above
are the final `npm run check` results for this Phase 4 tree.

### Dung lượng bản phát hành — build cuối Phase 4

Đo từ output thực của `npm run build` sau khi `generate` hoàn tất, ngày 2026-10-13.
Kích thước gzip là đầu ra Vite; tổng là phép cộng các tài nguyên ứng dụng ban đầu
được liệt kê dưới đây. Precache được lấy từ dòng Workbox của cùng build.

| Tệp | Kích thước | Gzip |
|---|---:|---:|
| `midori_wasm_bg-*.wasm` | 232,66 kB | 95,28 kB |
| `index-*.js` | 160,17 kB | 52,18 kB |
| `index-*.css` | 28,49 kB | 5,93 kB |
| `index.html` | 0,96 kB | 0,54 kB |
| `workbox-window.prod.es5-*.js` | 5,75 kB | 2,36 kB |
| **Tổng lần tải đầu tiên (các hàng trên)** | **428,03 kB** | **156,29 kB** |
| Precache service worker | **9 mục / 432,51 KiB** | — |

So với output đo trước các chỉnh sửa persistence Phase 4, JS gzip tăng 0,19 kB, CSS
gzip tăng 0,04 kB, precache tăng 1,12 KiB. Đây là so sánh output, không cô lập đóng
góp của từng thay đổi và không chứng minh tác động runtime.

**Phase 5 (điều hướng + màn học + màn Bài học):** `index-*.css` 32,27 kB (gzip 6,44),
`index-*.js` 165,41 kB (gzip 53,85), precache 9 mục / 441,26 KiB. So với build Phase 4
ngay trước đó, tổng gzip tăng khoảng **2,9 kB** (JS +1,67, CSS +0,51, phần còn lại ở
WASM/HTML). Đây là so sánh output của cùng một máy, không phải tuyên bố tối ưu. Baseline, benchmark,
quy trình lặp lại và giới hạn release được ghi ở
[docs/release-readiness.md](docs/release-readiness.md).

Hai con số hay bị lẫn, cần nói rõ:

| Đại lượng | Giá trị | Ý nghĩa |
|---|---|---|
| Seed hạt giống trong bundle | **5,4 KB** | Thứ thực sự đi kèm bản dựng (đã nén, không xuống dòng) |
| 3 gói nội dung xuất bản | **7,3 KB** | Thứ tải từ mạng khi cập nhật nội dung (dễ đọc, có thụt lề) |

Số đo này là **điểm chuẩn để so sánh về sau**, không phải một tuyên bố tối ưu. Muốn
xác nhận một tối ưu có tác dụng hay không, chạy `npm run build` trước và sau trong
cùng điều kiện.

### Tiêu chí chất lượng đang theo đuổi

- Mọi quy tắc nghiệp vụ mới phải có test ở Rust, không chỉ test giao diện.
- Mọi hàm mới vượt biên WASM phải được thêm vào test hợp đồng.
- Không tuyên bố "nhanh hơn" hoặc "nhẹ hơn" nếu chưa đo.

---

## 10. Quy ước mã nguồn

- **File Rust** dưới 300 dòng; **file TypeScript/Svelte** dưới 250 dòng. Tách module
  khi vượt ngưỡng thay vì để file phình ra.
- **Chú thích tiếng Việt, định danh tiếng Anh.** Thuật ngữ kỹ thuật giữ nguyên tiếng
  Anh (`SM-2`, `structured clone`, `staging`).
- **Chú thích trả lời "vì sao", không phải "cái gì".** Quy tắc nghiệp vụ tinh tế, quy
  tắc không hiển nhiên, và cạm bẫy đã gặp thật thì phải có chú thích.
- **Lõi Rust không import gì của nền tảng.** Không `web_sys`, không `js_sys`.
- **`src/core` là nơi duy nhất chạm WASM.** Không module nào khác được import trực
  tiếp từ `src/generated/`.
- **Dữ liệu phẳng khi ghi xuống IndexedDB.** Dùng `$state.raw` cho mọi trạng thái đi
  vào lưu trữ.
- **`lib/` không import Svelte; `ui/` không gọi WASM trực tiếp.** Giao diện đi qua
  `src/app/store.svelte.ts`.
- **Không thêm dependency mới** nếu chưa ghi lý do vào `docs/decisions.md` và chưa so
  sánh chi phí với lợi ích.

---

## 11. Hạn chế đã biết và nợ kỹ thuật

Xếp theo mức độ nên xử lý trước.

1. **Luồng cập nhật ứng dụng không có test tự động.** Lỗi trắng trang vừa rồi chỉ lộ
   ra khi chạy thật; cả `cargo test` lẫn `node --test` đều không thể thấy. Hàng rào
   duy nhất hiện nay là quy trình tay ở [docs/verification.md](docs/verification.md).
   Muốn tự động hoá cần một trình duyệt thật trong CI (chi phí dependency chưa được
   cân nhắc).

2. **Katakana nửa độ rộng không được quy đổi.** Hệ quả của việc bỏ bảng NFKC để tiết
   kiệm ~128 KB WASM. Nếu gặp dữ liệu dạng `ﾊﾛｰ`, chuỗi so khớp đáp án sẽ trượt.

3. **Đồng bộ nội dung chưa dọn thẻ mồ côi.** Thẻ biến mất khỏi nội dung vẫn nằm trong
   thư viện và vẫn xuất hiện trong phiên học. Đúng về mặt "không phá dữ liệu", nhưng
   chưa có cách để người dùng ẩn hoặc xoá chúng. Số lượng thẻ mồ côi đã được đếm và
   hiển thị sau khi đồng bộ.

4. **Sửa thẻ có nguồn gốc nội dung sẽ bị ghi đè ở lần cập nhật sau.** Chưa có cờ
   "người dùng đã sửa" để bỏ qua thẻ đó.

5. **`$state.raw` là ràng buộc ngầm.** Nếu một phiên sau vô tình dùng `$state` cho dữ
   liệu đi vào lưu trữ, lỗi `DataCloneError` sẽ quay lại. Đã ghi chú ở
   `src/storage/db.ts` nhưng chưa có hàng rào kỹ thuật (ví dụ hàm ép kiểu phẳng ở
   biên lưu trữ).

6. **Không có nội dung mặc định và provenance chưa xác minh.** `docs/content-coverage.md`
   đo được 0 thẻ trong 3 collection rỗng (50 bài Từ vựng, 50 bài Mẫu câu, 1/7 nhóm
   Kanji); người dùng tự nhập hoặc tự tạo thẻ. Nguồn và giấy phép chưa khai báo.

8. **Tìm kiếm giao diện và quản lý thư viện còn thiếu.** Lõi Rust hỗ trợ query trên
   front/back/furigana/romaji/tags, nhưng chưa có màn tra cứu; chưa có ẩn/khôi phục/xoá.

9. **Builder content có kiểm định và báo cáo, chưa fuzz.** `tests/build-content.test.ts`
   phủ ID xuyên gói, đường dẫn, readings, category/lesson/quiz và output không dở dang.

10. **Workflow CI mới được cấu hình, chưa xác nhận trên remote.** Cần run GitHub
   Actions thật; workspace hiện không có `.git` nên không thể push hoặc lấy trạng thái.

11. **Chưa bundle font tiếng Nhật.** Dùng font hệ thống. Thiết bị không có font JP sẽ
    hiển thị thay thế. Mitsuha đã cân nhắc font Noto Sans JP (9,6 MB) và bỏ vì quá
    nặng cho PWA.

12. **Toolchain đã pin nhưng cần theo dõi chu kỳ cập nhật.** Node 22.23.1 và Rust
    1.96.0 được ghi trong `.node-version` / `rust-toolchain.toml`; CI cũng ghim
    `wasm-pack` 0.15.0.

13. **Chỉ lưu được MỘT phiên đang dở.** Bắt đầu phiên mới (hoặc đổi bộ/chế độ) sẽ
    xoá bản lưu cũ. Cố ý ở bước này: bản lưu là để chống mất ngữ cảnh khi tải lại,
    không phải tính năng "nhiều phiên song song".

14. **Không đổi được chế độ giữa phiên.** Ô chọn chế độ chỉ hiện khi chưa bắt đầu,
    nên một phiên đã khôi phục ở chế độ lật thẻ sẽ học hết ở chế độ đó. Cần thêm một
    đường rõ ràng để đổi (có cảnh báo mất vị trí), thay vì để người dùng phải đi
    vòng qua việc kết thúc phiên.

15. **Giảm chuyển động chưa có hàng rào tự động.** Đã xử lý ở cả ba chỗ có vòng lặp
    chuyển động, nhưng không có test hay công cụ nào kiểm tra điều đó khi thêm chuyển
    động mới.

16. **Khung lật thẻ vẫn có sàn chiều cao và cuộn bên trong.** Giờ khung giãn theo
    chiều cao còn lại (`flex: 1`) và có `min-height: 216px`, nhưng nội dung DÀI hơn
    khung vẫn cuộn bên trong mặt thẻ. Cần vậy để `rotateY` không làm nhảy bố cục.

17. **Pull-to-refresh trên iOS Safari dạng tab không tắt được.** `overscroll-behavior`
    bị Safari phớt lờ; pull-to-refresh là của trình duyệt. Trong PWA đã cài (standalone)
    thì không có. Trên Chrome/Android đã vô hiệu hoá bằng `overscroll-behavior-y: none`
    ở phần tử cuộn gốc.

18. **Điều hướng chưa có test tự động trong trình duyệt thật.** `tests/navigation.test.ts`
    chỉ phủ hàm thuần (đọc/kiểm tra entry, màn hình quay về). Hành vi popstate/History
    API thật chỉ được kiểm bằng tay trên preview.

19. **Sáu nhóm Kanji còn lại vẫn chưa có.** Màn Kanji hiển thị đúng và đầy đủ những
    nhóm có trong `content/`, nhưng hiện chỉ có `kanji-noun`. Không tạo sáu nhóm rỗng
    chỉ để đủ số, vì như vậy là bịa cấu trúc dữ liệu chưa có nguồn.

---

## 12. Việc tiếp theo

Thứ tự đã cân nhắc; chi tiết ở [docs/roadmap.md](docs/roadmap.md).

### Ưu tiên 1 — đóng lỗ hổng đã hứa

- [x] Kiểm chứng PWA ngoại tuyến thật: `npm run preview`, dừng máy chủ, tải lại, học thử.
- [x] Thử luồng cập nhật ứng dụng với một bản dựng mới thật.
- [x] Thử nhánh "đã cập nhật" của cập nhật nội dung, xác nhận tiến độ học còn nguyên.
- [x] Bấm "Quay lại bản trước": ngăn `previous` phục hồi được, và khi không có bản
      trước thì báo rõ thay vì im lặng.
- [x] Kiểm tra cập nhật nội dung khi đang ngoại tuyến → báo đúng `status: 'offline'`
      và **không** làm hỏng nội dung đang dùng.
- [x] Mở lại ứng dụng sau khi trình duyệt thu hồi cache (xoá Cache Storage bằng
      DevTools) → tự cài lại từ mạng ở lần tải sau mà không mất tiến độ. Kiểm chứng
      này tìm thấy một lỗi thật: precache không bao giờ được điền lại nên ứng dụng
      **không mở được khi ngoại tuyến** — đã sửa và có test (xem mục 3 và
      [docs/verification.md](docs/verification.md) mục 9).

### Ưu tiên 2 — hoàn thiện trải nghiệm học

- [x] Lưu và khôi phục phiên học đang dở khi ứng dụng tải lại (kể cả tải lại do cập nhật).
- [x] Khôi phục màn hình đang mở sau khi tải lại.
- [x] Hiện đại hoá giao diện: token thiết kế, chuyển cảnh, biểu tượng SVG, tôn trọng
      `prefers-reduced-motion`.
- [x] Mỗi hàng bộ thẻ trên Trang chủ mở **đúng bộ** đó (cùng bộ thì tiếp tục phiên đang
      dở, khác bộ thì bỏ phiên cũ và nói rõ).
- [x] Hiện số thẻ tới hạn của bộ **trước khi** bắt đầu; bằng 0 thì nút bị vô hiệu hoá.
- [x] Mở luồng ôn thẻ chưa thuộc từ Trang chủ; bộ lọc weak dùng dữ liệu SRS của lõi và
      được lưu trong session để khôi phục đúng lựa chọn.
- [x] Màn hình 50 bài Minna ở Home/Stats và đường mở phiên theo bài đã có; nội dung
      hiện mới có vocabulary bài 1–6, patterns đã gắn đủ 50 bài.
- [x] Màn **Bài học** riêng để duyệt 50 bài (tìm theo số, lọc "chỉ bài có thẻ");
      Trang chủ chỉ còn bản xem trước. Nội dung vẫn mới có vocabulary bài 1–6.
- [x] Điều hướng Back/Home/Close đi qua History API; màn con có nút Quay lại; Back đóng
      overlay trước khi lùi màn hình.
- [x] Trình sửa thẻ và thống kê chi tiết đã có giao diện; chưa có tìm kiếm thư viện,
      lịch sử trả lời hay các thao tác ẩn/khôi phục/xoá.
- [ ] Cho đổi chế độ học ngay trong phiên, có cảnh báo rằng vị trí sẽ đặt lại.
- [x] Bảy nhóm Kanji có màn hình riêng; dữ liệu hiện tại vẫn chỉ có nhóm danh từ.
- [x] Gắn mẫu câu vào bài có căn cứ; bộ phát hành hiện phủ đủ 50 bài.
- [ ] Search/filter trong UI và quản lý vòng đời thẻ có phục hồi.
- [ ] Lịch sử ôn và độ chính xác chỉ sau khi có mô hình lưu lịch sử phù hợp.

### Ưu tiên 3 — củng cố nền tảng

- [ ] Hàng rào kỹ thuật cho `$state.raw` ở biên lưu trữ.
- [ ] Cờ "người dùng đã sửa" để không ghi đè thẻ nội dung bị sửa tay.
- [ ] Giao diện xử lý thẻ mồ côi.
- [x] `rust-toolchain.toml` để cố định phiên bản Rust.
- [x] CI chạy `npm run check` (cấu hình; cần remote run).
- [x] Test tự động cho `scripts/build-content.mjs`; content validation/audit cho Phase 2.
- [ ] Hàng rào cho `data/version.json`: hiện đã kiểm chứng bằng tay, chưa có test đối
      chiếu `dist/data/version.json` với `package.json` (cần chạy build trong test).

### Ý tưởng xa hơn

- [ ] Quy đổi katakana nửa độ rộng mà không cần bảng NFKC đầy đủ.
- [ ] Tìm kiếm không phân biệt dấu tiếng Việt (hiện chỉ hạ chữ thường).
- [ ] Font tiếng Nhật theo tập con (subset) chỉ gồm ký tự có trong dữ liệu.
- [ ] Đồng bộ nhiều thiết bị — khi đó mới cần tới backend, và `content.rs` là chỗ
      bắt đầu cho logic giải quyết xung đột.

---

## 13. Tài liệu chuyên sâu

| Tài liệu | Nội dung |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Luồng dữ liệu, ranh giới module, vì sao mỗi lớp ở đúng vị trí đó |
| [docs/contract.md](docs/contract.md) | Hợp đồng Rust ↔ JavaScript, danh sách hàm, cách kiểm chứng |
| [docs/data-model.md](docs/data-model.md) | Mô hình thẻ, SM-2, schema IndexedDB, quy tắc di trú |
| [docs/offline-and-updates.md](docs/offline-and-updates.md) | Cập nhật ứng dụng so với cập nhật nội dung, quy trình kích hoạt an toàn |
| [docs/verification.md](docs/verification.md) | Kết quả test tự động, browser smoke và giới hạn kiểm chứng |
| [docs/design-system.md](docs/design-system.md) | Vai trò token, quy ước surface/glass, motion và giới hạn accessibility |
| [docs/decisions.md](docs/decisions.md) | Nhật ký quyết định kiến trúc kèm số đo và phương án đã cân nhắc |
| [docs/roadmap.md](docs/roadmap.md) | Kế hoạch chi tiết theo giai đoạn |
| [docs/release-readiness.md](docs/release-readiness.md) | Baseline hiệu năng, recovery/offline evidence, provisional budgets và release checklist |
| [docs/content-coverage.md](docs/content-coverage.md) | Coverage báo cáo từ `content/`, có lệnh tái tạo |
| [docs/content-governance.md](docs/content-governance.md) | Yêu cầu nguồn, giấy phép và review nội dung |

### Kế thừa từ Mitsuha

Mã nguồn Mitsuha ở `../mitsuha`. Những gì đã kế thừa và vì sao:

| Kế thừa | Ghi chú |
|---|---|
| Thuật toán SM-2 và các quy tắc SRS | Chuyển sang Rust, giữ nguyên hành vi; dữ liệu SRS cũ đọc được |
| Mô hình 4 trường thẻ (nghĩa, chữ, furigana, romaji) | Giữ nguyên |
| Cấu trúc SRS + bộ lọc "Chưa thuộc" | Giữ nguyên, chuyển sang Rust |
| Định dạng file bộ thẻ JSON/CSV và các alias header | Giữ nguyên, mở rộng thêm cột `id` |
| Quy tắc bỏ trùng khi nhập (theo `front` + `back`) | Giữ nguyên, bổ sung kiểm tra theo `id` |
| Ý tưởng Dynamic Island | Đã loại bỏ ở Phase 6; thay bằng header và điều hướng màn hình |
| Stack Svelte 5 + Vite + TypeScript + idb + vite-plugin-pwa | Giữ nguyên |
| Quy tắc đọc trường `reading` cũ | Hợp nhất hai quy tắc thành một |

Những gì **không** kế thừa và lý do:

| Bỏ | Lý do |
|---|---|
| `lib/srs.ts`, `lib/importer.ts`, `lib/exporter.ts`, `lib/answers.ts`, `lib/id.ts`, `lib/storage.ts` (JS) | Chuyển toàn bộ sang Rust; giữ lại sẽ thành hai bản của cùng một quy tắc |
| `stores/*.ts` dùng `writable` của Svelte cũ | Thay bằng `$state.raw` + lớp trạng thái, tránh Proxy lọt xuống IndexedDB |
| Nút "Cập nhật" trộn lẫn hai loại cập nhật | Tách thành hai module, hai phiên bản, hai nút |
| Kiểm tra phiên bản bằng cách xoá sạch Cache Storage | Thay bằng pipeline có xác minh toàn vẹn và kích hoạt nguyên tử |
| `data-model.md`, `conventions.md` rỗng của Mitsuha | Midori có tài liệu thật (thư mục `docs/`) |
