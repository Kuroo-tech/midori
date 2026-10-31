# Lộ trình

Thứ tự dưới đây phản ánh mức độ rủi ro và giá trị, không phải mức độ thú vị. Ưu tiên
1 là những việc có lời hứa đã tuyên bố nhưng **chưa được kiểm chứng** — theo đặc tả
§2.3, đó là loại việc phải làm trước. Phần lớn ưu tiên 1 đã hoàn thành trong phiên
2026-10-12 thứ hai, và việc đó đã phát hiện hai lỗi thật.

Khi một mục ở đây hoàn thành, **chuyển kết quả vào [verification.md](verification.md)**
và ghi lại trạng thái mới trong README — không để kết quả nằm trong lộ trình.

## Phase 4 — hiệu năng, độ tin cậy và phát hành

### Baseline đã thu thập (2026-10-13)

- **Đã đo:** build production trên Fedora Linux x86_64 / Node 22.23.1 / Rust
  1.96.0; output cuối 428.03 kB raw / 156.29 kB gzip; precache 432.51 KiB.
  Output pre-edit 426.88 kB / 156.06 kB được giữ làm so sánh có giới hạn.
- **Đã đo:** Chromium automation local, 7 cold + 15 warm reload; navigation-visible
  median 133 ms / 99 ms. Đây là proxy local, không đại diện thiết bị hoặc mạng thật.
- **Đã đo:** benchmark filter/parse tổng hợp 1k/10k/50k cards, 3 warm-up + 15
  samples; procedure và bảng kết quả ở [release-readiness.md](release-readiness.md).
- **Đã xác minh bằng thao tác:** production Chromium reload ngoại tuyến sau khi SW
  điều khiển trang; shell và thư viện dựng lại được.
- **Đã sửa, đã test tự động và smoke Chromium:** lỗi lưu screen preference không còn
  bị nuốt im lặng; UI hiển thị cảnh báo và log cause. Không ảnh hưởng cards/SRS/session.

### Còn cần trước khi gọi release-ready

- [x] Chạy lại `npm run check`, `npm run build`, benchmark sau sửa screen persistence;
  kết quả chính xác ở [verification.md](verification.md).
- [ ] Xác nhận clean checkout và workflow CI qua Git repository/remote runner. Hiện
  thư mục này không có `.git` metadata nên không thể xác minh.
- [ ] Kiểm tra browser Firefox, Safari/WebKit, PWA cài trên Android/iOS và thiết bị
  thật; hiện chỉ có bằng chứng Chromium automation.
- [ ] Thử quota/write failure trên browser thật hoặc chốt tài liệu về giới hạn của
  failure injection; không tuyên bố đã thử quota thật.
- [ ] Lặp lại app/content update, install/offline/refresh trên release candidate;
  xem [docs/release-readiness.md](release-readiness.md).
- [ ] Xác minh nguồn và quyền phân phối content trước phát hành.
- [ ] Xác lập ngân sách latency từ thiết bị mục tiêu; các ngưỡng bundle hiện tại là
  provisional maintenance ceilings, không phải UX targets.

## Phase 3 — Design system, motion và chất lượng trải nghiệm

### Audit baseline

- **Đã xác minh:** token light/dark, trạng thái focus-visible, `prefers-contrast`,
  `prefers-reduced-motion`, safe-area và breakpoint desktop tồn tại trong
  `src/app.css`; nav/Island là các bề mặt duy nhất dùng glass đáng kể.
- **Đã xác minh:** Study phân biệt lật đáp án với rating SRS, ẩn mặt khuất khỏi
  accessibility tree, và lưu session theo từng thay đổi quan trọng.
- **Đã xác minh lỗi:** tên trợ năng Island luôn nói “Mở” dù panel đang mở; mục tiêu
  chạm cao 36px; panel Island không kế thừa fallback dùng chung của `.surface-panel`.
- **Cơ hội:** giảm trùng lặp style panel, giữ glass có chọn lọc, bổ sung kiểm tra ở
  production browser cho trạng thái media và viewport.
- **Chưa kiểm chứng:** WCAG/contrast audit, screen reader, browser ngoài Chromium,
  thiết bị thật, zoom/reflow và mọi trạng thái dài/empty/error của từng màn.
- `git status` không khả dụng: thư mục làm việc không có `.git`; không thể chứng
  minh trạng thái thay đổi không liên quan trước khi bắt đầu.

### Milestone 3.1 — Bề mặt dùng chung và Island

- [x] Island phát hiện trạng thái Mở/Đóng trong accessible name; kích thước mục tiêu
  chạm đặt thành 48 CSS px.
- [x] Island tái sử dụng `.surface-panel`; panel và viên thuốc có fallback đặc khi
  không hỗ trợ backdrop blur hoặc `prefers-reduced-transparency: reduce`.
- [x] Smoke Chromium production Study ở 390×844, 768×1024, 1280×800; bàn phím mở/
  đóng Island, reveal thẻ và emulation reduced-motion — [verification.md](verification.md).

### Milestone 3.2 — Áp dụng quy ước và xác minh toàn diện

- [x] Ghi quy ước Material nền tảng, Liquid Glass chọn lọc, token, motion và giới
  hạn accessibility tại [design-system.md](design-system.md).
- [ ] Kiểm tra các màn Home, Study, Transfer, Settings, Kanji, Stats và Editor ở
  viewport đại diện; chỉ sửa lỗi cụ thể có thể tái hiện.
- [ ] Đánh giá screen-reader, text zoom/reflow, tương phản và các browser/thiết bị
  mục tiêu; không tuyên bố WCAG trước khi có audit có phương pháp.

## Phase 1 — correctness, data safety, verified documentation

| Hạng mục | Trạng thái | Căn cứ |
|---|---|---|
| Kanji lọc theo danh tính bộ; sửa mặt trước/sau; điều hướng mục cha | Đã làm, có regression test | `src/app/content-sections.ts`, `src/app/screen.ts`, `tests/session-storage.test.ts` |
| Cách ly bản ghi sai schema, xuất dữ liệu cứu hộ | Đã làm, IndexedDB giả kiểm tra đường thành công và abort | `src/storage/cards.ts`, `tests/storage-recovery.test.ts` |
| Backup cá nhân version 1, SRS/session tùy chọn, kiểm tra trước restore atomic | Đã làm, unit + IndexedDB giả | `src/storage/backup.ts`, `tests/backup.test.ts`, `tests/storage-recovery.test.ts` |
| Lưu phiên báo lỗi; reconciliation có thể retry sau lỗi commit | Đã làm, có test lỗi | `src/storage/session.ts`, `src/content/reconciliation.ts` |
| Test builder nội dung | Đã làm | `tests/build-content.test.ts` |
| Pin Rust/Node và workflow CI | Cấu hình đã thêm; chưa xác minh run remote | `.node-version`, `rust-toolchain.toml`, `.github/workflows/ci.yml` |
| Smoke test Chromium cho Kanji/Editor | Đã làm trên production preview | [verification.md](verification.md), mục Phase 1 |
| Smoke test backup UI valid/invalid | Đã làm trên production preview | Khôi phục thành công hiện thông báo toàn cục; JSON lỗi giữ nguyên thư viện |
| Smoke test export recovery, backup không tiến độ, Stats navigation, thiết bị thật | Chưa làm | Còn checklist tại [verification.md](verification.md), mục Phase 1 |

---

## Ưu tiên 1 — Đóng lỗ hổng đã hứa

Toàn bộ mục này là **kiểm chứng**, không phải viết mã mới: mỗi việc đóng một khoảng
trống giữa "đã viết mã" và "đã chứng minh hoạt động".

**Trạng thái: phần lớn đã xong trong phiên 2026-10-12 thứ hai.** Bốn việc ở bảng dưới,
một việc còn lại (1.4), cộng một việc phát sinh sau đó (1.3b) đã xong trong phiên
2026-10-13. Quy trình đầy đủ và lặp lại được đã được tách sang
[verification.md](verification.md) — dùng tài liệu đó, không dùng mô tả ở đây.

| Việc | Trạng thái | Kết quả |
|---|---|---|
| 1.1 Kiểm chứng PWA ngoại tuyến thật | **Xong** | Dừng máy chủ (cổng đóng, `curl` trả `000`), tải lại trang → ứng dụng dựng đầy đủ từ precache, chấm điểm được, tiến độ vào IndexedDB |
| 1.2 Cập nhật ứng dụng với bản dựng mới thật | **Xong** | Phát hiện bản đang chờ; bấm cập nhật → tải lại sạch, không trắng trang |
| 1.3 Nhánh "đã cập nhật" của cập nhật nội dung | **Xong** | `.1 → .2`; thẻ đã học giữ nguyên lịch SRS; thẻ bị xoá khỏi nội dung vẫn còn trong thư viện; thẻ mới được thêm |
| 1.3b Mở lại sau khi trình duyệt thu hồi Cache Storage | **Xong** | Tìm thấy lỗi mất khả năng ngoại tuyến im lặng (precache không được điền lại); đã sửa bằng cách gỡ đăng ký không đăng ký lại trong cùng lần tải — xem ADR-017 và verification.md mục 9 |
| 1.4 Kích hoạt nguyên tử dưới lỗi dung lượng thật | **Chưa** | Mới mô phỏng bằng store giả trong test |

### 1.2b. Hai lỗi do bước 1.2 phát hiện (đã sửa)

Đây là lý do bước 1.2 không thể bỏ qua: nó tìm ra hai lỗi mà cả `cargo test` lẫn
`node --test` đều không thể thấy.

1. **Tải lại quá sớm sau khi gửi `SKIP_WAITING` ⇒ trắng trang.** Xem
   [decisions.md](decisions.md) ADR-013. Đã sửa bằng cách chờ `controllerchange`.
2. **`/data/version.json` chưa từng được sinh.** Xem ADR-014. Đã sửa bằng plugin Vite
   + kiểm tra `content-type` trong bộ đọc.

### 1.4. Thử kích hoạt nguyên tử dưới lỗi thật

**Cách làm.** Trong ứng dụng, dùng DevTools để làm `promote()` thất bại (ví dụ ghi đè
`IDBDatabase.prototype.transaction` để ném lỗi), rồi kiểm tra nội dung đang dùng.

**Tiêu chí đạt.** Nội dung cũ **nguyên vẹn** và ứng dụng vẫn học được. Đã mô phỏng
bằng store giả trong test; chưa từng thử với IndexedDB thật.

### 1.5. Thử trên thiết bị thật

Ít nhất một trình duyệt nhân Chromium trên điện thoại Android. Kiểm: cài PWA, biểu
tượng hiển thị đúng, font tiếng Nhật hiển thị được, và luồng học dùng được bằng chạm.

---

## Ưu tiên 2 — Hoàn thiện trải nghiệm học

Ở đây lõi Rust **đã có sẵn hàm**, chỉ thiếu giao diện. Đây là loại việc có tỉ lệ
giá trị trên công sức cao nhất.

### 2.0. Lưu/khôi phục phiên học và hiện đại hoá giao diện — ĐÃ XONG

Không nằm trong kế hoạch ban đầu của ưu tiên 2, nhưng trở thành việc bắt buộc sau khi
mục 1.2 chứng minh rằng cập nhật ứng dụng **kết thúc bằng một lần tải lại trang**:
không có bản lưu phiên thì mỗi lần cập nhật là một lần mất ngữ cảnh học.

| Việc | Trạng thái | Kết quả |
|---|---|---|
| Lưu phiên đang dở (id thẻ, chế độ, vị trí, mặt thẻ, số đếm) | **Xong** | [ADR-015](decisions.md); 8 test Rust + 9 test JS |
| Khôi phục màn hình đang mở | **Xong** | `meta.screen`; kiểm chứng bằng thao tác thật |
| Đối chiếu id với thư viện hiện tại trong lõi Rust | **Xong** | `session::restore` — bỏ id đã mất, bỏ trùng, **tính lại vị trí** |
| Hệ thống thiết kế (token, chuyển động, biểu tượng SVG) | **Xong** | [ADR-016](decisions.md); +7,7 KB gzip, không thêm dependency |
| Tôn trọng `prefers-reduced-motion` | **Xong** | Cả ba chỗ có chuyển động lặp |
| Hiện đại hoá vòng hai (mở đúng bộ, số thẻ trước khi bắt đầu, chữ co giãn, màn rộng) | **Xong** | +1,04 KB gzip; bố cục hai cột từ 780px, dự phòng cho `backdrop-filter`, `prefers-contrast` |

Kết quả kiểm chứng đầy đủ đã chuyển sang [verification.md](verification.md) mục 6 và
README mục 3.

### Phase 2.1. Kiểm định và coverage nội dung — ĐÃ LÀM

`scripts/content-validation.mjs` được dùng chung bởi build và coverage audit; các
bundle được kiểm tra toàn bộ trước khi ghi output. `npm run content:audit` báo độ
phủ dựa trên metadata nguồn. Kết quả thật và quy trình nguồn/giấy phép ở
[content-coverage.md](content-coverage.md) và
[content-governance.md](content-governance.md). Đây chỉ là hàng rào schema, không
thay review nội dung hay xác minh bản quyền.

### Phase 2.2. Ôn thẻ chưa thuộc — ĐÃ LÀM, CHROMIUM SMOKE MỘT PHẦN

Home có hành động bắt đầu Study với `weakOnly` do Rust lọc; màn Study cho chọn thẻ
tới hạn hoặc thẻ yếu, đếm trước chính xác theo cùng filter, và session lưu `focus`
để khôi phục đúng lựa chọn. Flip mode dùng SM-2 hiện có; self-answer chỉ luyện quiz
theo thiết kế. Unit test và production Chromium smoke đã phủ một hành trình: quiz
sai, Home, mở một weak card, reload khôi phục queue/focus, SRS không dời lịch.
Lesson intersection, weak Again/Hard, mobile và accessibility chưa kiểm chứng.

### Phase 2.3. Điều hướng bài Minna — ĐÃ LÀM; TỪ VỰNG CÒN THIẾU NỘI DUNG

Từ vựng và Mẫu câu đều mở danh sách 50 bài rồi Collection của đúng bài. Bản dựng
phát hành với cả 50 bài rỗng: người dùng nhập hoặc tạo thẻ và gắn số bài, không có
nội dung mặc định. Không gán bài bằng thứ tự file; chỉ bổ sung mapping sau khi đối
chiếu nguồn được cấp quyền.

### Phase 2.4. Bảy nhóm Kanji — BLOCKED BỞI TAXONOMY VÀ CONTENT

`KanjiOverview` liệt kê bundle có `kanji-*`; hiện chỉ có `kanji-noun`, và bộ này
cũng rỗng mặc định. Tên và định nghĩa sáu nhóm còn thiếu chưa có trong repository.
Cần taxonomy có nguồn/được sản phẩm duyệt trước khi xây UI chọn nhóm hoặc phân loại
thẻ.

### Phase 2.5. Search và quản lý thư viện — CHƯA LÀM

Rust `cardsFilter` đã tìm `front`, `back`, `furigana`, `romaji`, tags và lọc
deck/lesson/due/weak. UI chưa cho tìm trong thư viện, lọc review state, hoặc hide /
restore / delete. Trước khi có xóa, phải định nghĩa orphan/content-owned semantics
và bảo toàn được khôi phục; không xóa thẻ mồ côi tự động. Bỏ dấu tiếng Việt chưa
được hỗ trợ; chỉ thêm khi có test/đánh giá phù hợp, không thay chuẩn hóa dùng cho
chấm điểm.

### Phase 2.6. Stats và lịch sử — MỘT PHẦN

StatsDetail đã có: tổng quan bốn nhóm (tới hạn / chưa học / đang học / nhớ lâu),
phân rã "chưa thuộc" theo lý do (tự chấm yếu vs làm sai bài), hai thước đo tách
biệt kèm mẫu số (`mastery` + `mastered` / `accuracy` + `graded`), thống kê theo bộ
— kể cả bộ người dùng tự tạo nhờ hợp `byDeck` — và cả 50 bài Minna với tiến độ
từng bài. Mỗi hàng có thẻ là một lối vào thẳng phiên học của bộ/bài đó; hàng không
có thẻ bị vô hiệu thay vì dẫn tới ngõ cụt "không có thẻ tới hạn". Dữ liệu hỗ trợ
vẫn là trạng thái SRS mới nhất và dấu sai gần nhất; chưa đủ tính accuracy theo
phiên hoặc xu hướng lịch sử. Không thêm các metric đó trước khi có quyết định
schema về lưu review events, retention và backup/export.

### Phase 2.7. Chuyển chế độ học giữa phiên

Hiện ô chọn chế độ chỉ hiện khi phiên **chưa** bắt đầu, nên một phiên đã khôi phục
buộc phải học hết ở chế độ cũ. Cần một đường rõ ràng để đổi (kèm cảnh báo rằng vị trí
sẽ đặt lại), và phải cập nhật cả `meta.session` để lần tải lại sau không khôi phục
nhầm chế độ cũ.

### Phase 2.8. Hiện tiến độ còn lại ngay trên Island

Island đã có thanh tiến độ; phiên đã khôi phục nên kể thêm "còn N thẻ" để người học
biết mình đang ở đâu ngay khi mở lại, không phải nhìn vào tiêu đề nhỏ.

### Phase 2.9. Search/accessible interaction và Dynamic Island

Sau khi luồng dữ liệu ổn định, kiểm thử bàn phím, focus, contrast, zoom và reduced
motion trên màn hình thực. Chưa thêm gesture trước khi định nghĩa cử chỉ, xung đột
cuộn/assistive technology và có thể kiểm chứng touch target.

---

## Ưu tiên 3 — Củng cố nền tảng

Những việc này không tạo tính năng mới nhưng ngăn lỗi trong tương lai.

### 3.1. Hàng rào kỹ thuật cho `$state.raw`

Xem [ADR-009](decisions.md). Một hàm ép kiểu phẳng ở biên lưu trữ, hoặc một hàm
`structuredClone()` kiểm tra trước khi ghi, biến một quy tắc dễ quên thành một lỗi
ồn ào ngay lúc phát triển.

### 3.2. Cờ "người dùng đã sửa"

Hiện tại, sửa một thẻ có nguồn gốc nội dung sẽ bị ghi đè ở lần cập nhật sau.
Giải pháp: thêm trường `editedByUser` vào `Card`; `content_reconcile` bỏ qua thẻ có
cờ này. Cần một chỗ trong giao diện để người dùng hoàn tác cờ đó.

### 3.3. Giao diện xử lý thẻ mồ côi

Xem [ADR-012](decisions.md). Danh sách thẻ mồ côi, cho phép ẩn hoặc xoá thẻ.

### 3.4. Xác nhận CI trên remote

Toolchain và workflow đã được thêm ở Phase 1. Cần xác nhận một run GitHub Actions
trên push/PR thật; workspace hiện không có Git remote để làm việc đó.

### 3.5. Test cho đồng hồ và múi giờ

Các hàm SRS dùng ms từ epoch. Chưa có test cho hành vi quanh nửa đêm, chuyển giờ, và
`due` trùng đúng thời điểm hiện tại.

---

## Ý tưởng xa hơn

Không nằm trong kế hoạch gần. Ghi lại để không quên, và để phiên sau biết chúng đã
được cân nhắc.

### Quy đổi katakana nửa độ rộng

Hệ quả của [ADR-003](decisions.md). Cách đúng: mở rộng bảng quy đổi trong
`compat_normalize` (khoảng 60 dòng), **không** thêm lại NFKC.

### Tìm kiếm không phân biệt dấu tiếng Việt

Hiện tại tìm kiếm chỉ hạ chữ thường. Gõ "hoc" không tìm được "học". Giải pháp: một
hàm bỏ dấu trong `text.rs` (~30 dòng bảng), dùng **chỉ cho tìm kiếm**, không dùng
cho chấm điểm (dấu là thông tin khi chấm).

### Font tiếng Nhật theo tập con

Hiện dùng font hệ thống. Thiết bị không có font JP sẽ hiển thị thay thế. Mitsuha cân
nhắc Noto Sans JP (9,6 MB) và bỏ vì quá nặng. Hướng đúng: subset font chỉ gồm ký tự
có trong dữ liệu — với 36 thẻ hiện tại, subset sẽ rất nhỏ. Cần script sinh subset ở
bước build.

### Đồng bộ nhiều thiết bị

Khi đó mới cần backend (đặc tả §4.3). `content.rs` là chỗ bắt đầu cho logic giải
quyết xung đột — nó đã có khái niệm "thẻ thuộc nội dung" so với "thẻ người dùng tạo",
đó chính là ranh giới cần cho việc hợp nhất.

### Nhiều hồ sơ người học

Một IndexedDB cho mỗi hồ sơ, hoặc một trường `profileId`. Câu hỏi thiết kế chưa được
trả lời: một người dùng thật sự cần nhiều hồ sơ không?

---

## Việc KHÔNG nên làm

Ghi lại để phiên sau không mở lại những hướng đã cân nhắc và loại bỏ.

| Không nên | Vì sao |
|---|---|
| Thêm lại `unicode-normalization` | 128 KB cho năng lực không dùng — ADR-003 |
| Precache nội dung | Gộp hai loại cập nhật, đặc tả §7.2 cấm — ADR-005 |
| Thêm backend chỉ vì dùng Rust | Đặc tả §4.3 nói rõ điều này |
| Chuyển logic nghiệp vụ sang JS cho tiện | Tạo bản thứ hai của cùng một quy tắc |
| Bỏ `$state.raw` cho gọn | Sẽ tái hiện `DataCloneError` — ADR-009 |
| Dùng `$state` cho mảng thẻ | Cùng vấn đề, và mất dữ liệu âm thầm |
| Chuyển sang framework UI khác | Stack hiện tại chưa gây khó khăn nào — ADR-011 |
| Đổi `id` thẻ trong `content/` | Làm mất tiến độ học của người dùng |
| Tự động xoá thẻ mồ côi | Đặc tả §7.4 cấm — ADR-012 |
