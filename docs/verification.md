# Kiểm chứng tự động và bằng thao tác thật

Test tự động của Midori chạy ở native/Node; test storage dùng `fake-indexeddb`, không
phải triển khai IndexedDB của một browser. Những thứ sau vẫn chỉ có thể kiểm chứng
bằng cách chạy thật:

- Service worker: cài đặt, precache, chiếm quyền, dọn cache cũ.
- IndexedDB: giao dịch, kích hoạt nguyên tử, bảo toàn dữ liệu.
- Hành vi ngoại tuyến khi origin không truy cập được.
- Sự liên kết giữa các lớp: WASM nạp trong trình duyệt, giao diện phản ứng với dữ liệu.

## 1.0.4 — sửa thanh điều hướng, Mẫu câu theo bài 1–50 và vòng kiểm thử toàn bộ

Vòng này sửa lỗi bố cục ở thanh điều hướng dưới, đưa **Mẫu câu** vào cùng mô hình
chọn bài 1–50 như Từ vựng, và siết lại vài luồng dữ liệu phát hiện trong lúc kiểm thử:

- `src/app.css`: `.nav` dùng `repeat(3, 1fr)` thay cho bốn cột. Bốn cột với ba tab để
  lại một cột trống bên phải, làm cả ba tab dồn về một phía.
- `src/ui/PatternLessons.svelte` (mới): mở `Lessons` với `deckId="patterns"` để màn
  chọn bài dùng chung đúng component, đúng bộ lọc và đúng nhãn "mẫu câu".
- `content/bundles/patterns.json`: collection mặc định để rỗng, cấu trúc chọn bài
  1–50 vẫn giữ; câu do người dùng tự thêm hoặc nhập.
- `crates/midori-core/src/import.rs`: CSV/TSV đọc cột `lesson` riêng thay vì lấy lẫn
  từ `tags`/`category`; cột riêng thắng, thiếu thì mới rơi về tags. Có 3 test hồi quy.
- `src/ui/CardEditor.svelte`: thẻ Kanji không còn hiện hay gửi trường "Bài Minna".
- `src/ui/Home.svelte`: hero dùng `min(thẻ mới, giới hạn ngày)`. Giới hạn 0 có trạng
  thái riêng "Đã tắt thẻ mới" và lối mở Cài đặt, không còn mời học rồi mở hàng đợi rỗng.
- `src/app.css`: thêm `--accent-strong` (#1b7a5d ở theme sáng, #67d3a7 ở theme tối)
  cho chữ nhấn nhỏ. `--accent` chỉ đạt ~3,2:1 trên surface sáng, không đủ 4,5:1.
- **Cơ sở dữ liệu mặc định rỗng:** cả ba bundle nguồn, `content/content.json`, manifest
  và `src/generated/content-seed.json` phát hành **0 thẻ**; 50 bài Từ vựng, 50 bài
  Mẫu câu và 7 nhóm Kanji chỉ còn là cấu trúc. Khởi động, xoá thư viện rồi tải lại
  đều không sinh thẻ nào.
- `scripts/audit-layout.mjs`: tự gieo thư viện mẫu cố định vào profile Chrome tạm
  (`FIXTURE_CARDS`) thay vì trông vào nội dung hạt giống; nhờ vậy audit vẫn đo được
  màn Collection và phiên học khi bản dựng phát hành rỗng, mà không đụng dữ liệu
  người dùng.
- Cùng script: phép dò cử chỉ vuốt đọc `aria-selected` của tab Liquid Glass thay vì
  class `active` cũ, và vuốt trên thân khối `.scope` thay vì trên thanh tab (thanh
  tab nay là bề mặt kéo lớp kính). Phép kiểm `clipped-text` bỏ qua `text-overflow:
  ellipsis` có chủ ý, nên nhãn dài trong danh sách xem trước không còn bị báo oan.
- `src/ui/LiquidTabs.svelte` + `src/app.css`: lớp kính bị **kẹp trong dải tab** — kéo
  quá tab đầu/cuối thì dừng ở mép, không trượt ra khỏi khung; khi kéo, lớp kính
  giãn nhẹ theo trục tay (scaleX tối đa 1,07, scaleY 0,96) và nghiêng tối đa 2,2°,
  trả về 1 khi thả. Độ bóng giảm ở lớp kính (highlight trắng 24%), công tắc (núm
  42%, quầng sáng 8%), nút chính (quầng 14%) và thanh điều hướng (saturate 1,08).
- Câu chữ bỏ lời hứa "cài lại nội dung có sẵn": Trang chủ trống mời nhập hoặc mở
  Trình biên tập (nút **Tạo thẻ mới**), Collection trống chỉ mời nhập/tạo thẻ, và
  thông báo xoá thư viện nói đúng là thư viện sẽ trống.

### Dữ liệu mặc định và luồng nhập/xuất

- `npm run content:audit`: **0 thẻ trong 3 gói**; 50 bài Mẫu câu vẫn được giữ làm lựa
  chọn collection (51 mục: “Tất cả mẫu câu” + 50 bài), cả khi nhập lẫn khi xuất.
  Nhập một file JSON 2 mẫu câu vào bài 3 và bài 50 ghi đúng `lesson` tương ứng và
  hiện thông báo “Đã thêm 2 thẻ vào Tất cả mẫu câu.”
- Trang chủ sau khi xoá thư viện hiện “Thư viện đang trống”; nút **Tạo thẻ mới** mở
  Trình biên tập; tải lại trang vẫn 0 thẻ.

### Liquid Glass trên bản dựng thật

- Nhấn tab Trang chủ / Nhập/Xuất / Cài đặt: `aria-current="page"` và lớp kính chỉ
  báo cập nhật, lớp kính trượt bằng `transform` với transition 300ms.
- Nhấn giữ lớp kính rồi kéo ngang: lớp kính bám theo con trỏ từng bước, tab đích
  được đánh dấu; thả đúng tab thì chuyển màn hình và căn lại; thả vào vùng không
  phải tab thì đàn hồi về tab cũ và không đổi màn hình.
- Kéo quá hai đầu: lớp kính dừng trong dải tab (đo được mép phải 412px so với tab
  cuối 417px ở thanh dưới, và 390px so với 392px ở bộ chọn giao diện), không tràn
  ra ngoài khung; transform lúc kéo có scale/skew, lúc thả trở về `matrix(1,0,0,1,…)`.
- Công tắc “Trộn thứ tự khi bắt đầu phiên học” dùng track kính: bật → núm trượt
  `translateX(18px)`, track đổi sang màu nhấn; giá trị đọc lại từ IndexedDB khớp
  (`shuffleByDefault: true`).
- Màn Nhập: ở 1280px là vùng kéo-thả 427×166; ở 390px cùng phần tử thu thành nút
  cao 61px. Thả file JSON vào vùng kéo-thả ở desktop mở đúng bước xem trước;
  kéo-thả và bấm chọn dùng chung một đường xử lý.

### Tự động

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | 0 lỗi, 0 cảnh báo Svelte |
| `npm run test:js` | **182/182** |
| `npm run test:rust` | **190 + 4** |
| `npm run content:audit` | 0 thẻ mặc định / 3 collection rỗng; vẫn giữ đủ 50 bài Mẫu câu. Nguồn/giấy phép vẫn chưa khai báo |
| `npm run build` | Xanh; precache **38 mục / 571,15 KiB** |
| `npm run audit:layout` | **0 vi phạm** sau khi làm mới chuẩn bằng dữ liệu mẫu: 16 màn hình × 10 khung nhìn, 320 phép đo, 160 trạng thái hình học, 160 ảnh chuẩn, 90 bước cử chỉ; renderer Chrome/156.0.8078.73 |

Ba test CSV mới kiểm đúng lỗi đã sửa: cột `lesson` riêng thắng `tags`, file chỉ có
`tags` vẫn đọc được như cũ, và cột `lesson` nhận cả dạng số lẫn "Bài 12" (ô trống mới
rơi về tags). Giá trị ngoài 1–50 không được nhận; nếu không có tag hợp lệ, thẻ không
có bài. Test này chạy trên lõi Rust/WASM thật, không phải bản giả lập.

### Xác nhận trên bản dựng production (`vite preview`, Chromium)

- **Điều hướng:** ba tab chia đều bề ngang; `aria-current="page"` đổi đúng khi mở
  Trang chủ / Nhập xuất / Cài đặt; Back/Forward và màn hình được nhớ sau reload đúng.
- **Mẫu câu:** màn chọn bài hiện 50/50, mở được bài 1, bài 50 và "Học toàn bộ";
  Collection của bài mẫu câu hiện đúng số thẻ, đúng nhãn "mẫu câu", và phiên chạy
  đúng phạm vi. Hàng chủ đề trên Trang chủ đọc cùng `deckStats` nên khớp số.
- **Từ vựng / Kanji:** màn 50 bài, Collection theo bài và theo nhóm Kanji, phiên lật
  thẻ và phiên tự trả lời, khôi phục phiên, phím Space/Enter và 1–4 đều chạy.
- **Nhập CSV:** file có cả `category` và `lesson` nhập đúng bài 5 và bài 50; file chỉ
  có tags vẫn giữ hành vi cũ. `.xlsx`, JSON hỏng và dữ liệu sai kiểu bị từ chối.
- **Editor:** thẻ Kanji không hiện "Bài Minna"; lưu xong bản ghi không mang `lesson`.
- **Cài đặt:** giới hạn ngày `-5 → 0`, `9999 → 500`, rỗng → giữ giá trị cũ kèm lỗi;
  theme và trộn thứ tự còn nguyên sau reload. Hero hiện "20 thẻ mới hôm nay" với
  giới hạn 20 và "Đã tắt thẻ mới" với giới hạn 0.
- **Nhập/xuất & sao lưu:** JSON, CSV, gói Kanji nhiều nhóm, backup có/không tiến độ,
  dedupe, bài không hợp lệ, file quá lớn và restore đều đúng thông báo; không ghi
  thư viện khi kiểm tra thất bại.
- **Xoá thư viện:** xác nhận hai bước, xoá dữ liệu người dùng; reload không tạo lại thẻ mặc định vì seed chỉ chứa collection rỗng; cài đặt được giữ nguyên.

### Accessibility

- Lighthouse 13.6.0, chỉ category accessibility, Trang chủ trên bản dựng production:
  **1.0** sau khi sửa (trước đó 0.94). Hai lỗi được sửa là `color-contrast` ở các nhãn
  "tới hạn" và `label-content-name-mismatch` ở nút chủ đề (bỏ `aria-label` ghi đè
  phần chữ hiển thị).
- axe-core 4.10.3, bộ luật WCAG 2.0/2.1 A+AA: **0 vi phạm** trên 16 trạng thái —
  Trang chủ, Từ vựng, Mẫu câu, Kanji, Collection (tất cả / theo bài / theo nhóm),
  Nhập, Xuất, Sao lưu, Thống kê, Editor (danh sách và tạo mới), Cài đặt, Phiên học
  (đang hỏi và đã lật), cùng các trạng thái rỗng/đầy đủ.

Đây là audit tự động, không phải tuyên bố tuân thủ WCAG: chưa nghe bằng trình đọc màn
hình, chưa thử zoom 200%, chưa thử Safari/Firefox hay thiết bị thật.

### PWA và ngoại tuyến

- Service worker cài và kiểm soát trang; precache có **39 mục**, gồm app shell, WASM,
  nội dung, manifest và icon.
- Dừng hẳn server preview rồi reload: ứng dụng vẫn dựng, khôi phục phiên đang dở,
  lật thẻ và chấm điểm được; tiến độ vẫn còn sau reload ngoại tuyến.
- Đây mới là Chromium trên Linux. Chưa kiểm cài PWA trên Android/iOS, Safari, Firefox,
  chế độ tiết kiệm pin hoặc quota storage cạn.

### Những gì vòng này KHÔNG kiểm

- Không có lần xem bằng mắt trên thiết bị thật; kết luận bố cục dựa trên số đo, DOM
  và so ảnh từng pixel với chuẩn.
- Cử chỉ trong `audit:layout` là `TouchEvent` tổng hợp: nó kiểm logic xử lý, không
  kiểm việc hệ điều hành giao sự kiện chạm.
- Không kiểm trình đọc màn hình, bàn phím ảo, zoom văn bản, reduced-motion toàn bộ
  màn hình mới, hoặc font hệ thống khác ngoài cấu hình đo.

## 1.0.3 — tái thiết kế màn Nhập/xuất: ba tác vụ, vùng chọn file gọn, kiểm tra trước khi nhập

Vòng này đổi **cấu trúc màn** chứ không chỉ CSS: màn Nhập/xuất tách thành ba tác vụ
(Nhập · Xuất · Sao lưu), mỗi lúc một tác vụ; vùng chọn file trên điện thoại thu còn một
hàng thấp; luồng nhập có bước KIỂM TRA trước khi ghi. Kèm theo là hai thay đổi ở lớp
khác:

- `crates/midori-core/src/import.rs`: `ImportResult` thêm `skipped` — số bản ghi có
trong file nhưng không đọc thành thẻ được, đếm cho cả JSON lẫn CSV/TSV.
- `src/storage/backup.ts`: **sửa lỗi thật** — `furigana`/`romaji` bị đòi khác rỗng trong
khi lõi khai báo chúng `#[serde(default)]`, nên một thẻ không có cách đọc (kể cả thẻ
Mẫu câu của nội dung phát hành) làm CẢ file backup bị từ chối.
- `src/app/transfer.ts` (mới): luật đọc file và chọn phạm vi tách khỏi component để
kiểm thử được; `src/ui/TransferScope.svelte` (mới): một bộ chọn phạm vi duy nhất dùng
cho cả nhập lẫn xuất.

### Tự động

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | 0 lỗi, 0 cảnh báo (`svelte-check`) |
| `npm run test:js` | **171/171** — thêm 18 test: `tests/transfer.test.ts` (15, chạy trên WASM THẬT), 1 test hợp đồng cho `skipped`, 2 test backup cho thẻ rỗng furigana/romaji (vòng trước: 153) |
| `npm run test:rust` | **176 + 4** — thêm 3 test đếm bản ghi bỏ qua trong `import.rs` (vòng trước: 173) |
| `npm run build` | xanh — `Transfer` 30,42 kB JS (10,49 gzip) + 7,38 kB CSS (1,66 gzip); index 114,59 kB (38,67 gzip); precache 42 mục / 546,01 KiB |

Test đáng chú ý — đều là test bắt lỗi THẬT, không phải test hình thức:

- `thẻ không có furigana hoặc romaji vẫn sao lưu và khôi phục được`: dựng file backup
  qua chính `createBackup` rồi đọc lại. Test này ĐỎ trước khi sửa.
- `furigana hay romaji sai KIỂU vẫn bị từ chối, chỉ chuỗi rỗng là hợp lệ`: bảo vệ chiều
  ngược lại — nới cho chuỗi rỗng không được biến thành bỏ qua việc kiểm kiểu.
- `lõi đếm bản ghi bị bỏ qua của cả CSV và JSON` (hợp đồng WASM) và 3 test Rust tương
  ứng, để con số hiện trên giao diện có nguồn ở lõi.
- `chọn một bài thì gán cả file vào bài đó` / `toàn bộ từ vựng … thiếu bài thì từ chối
  cả file` / `gói Kanji từ chối nhóm lạ, nhóm lặp và bundles rỗng` / `xuất một bài chỉ
  đếm thẻ của bài đó, đọc từ thư viện thật`: luật cũ được giữ nguyên hành vi sau khi
  chuyển sang `src/app/transfer.ts`.

### Bố cục: `npm run audit:layout`

| Lần chạy | Kết quả |
|---|---|
| Đo riêng `transfer` trước khi làm mới gì (`LAYOUT_SCREENS=transfer`, có `LAYOUT_VERBOSE=1`) | Đúng như mong đợi: các vi phạm chỉ thuộc `geometry-*` (khối `child[1] section.card` cũ biến mất, `child[1] div.task-picker` xuất hiện, trang ngắn hơn) và `pixel-drift` — **không** có vi phạm nào về tràn ngang, cắt chữ, vùng chạm dưới 32px, nút không chạm tới được, nút nằm sau thanh điều hướng |
| Cử chỉ vuốt ở màn Nhập/xuất (10 khung nhìn × 9 bước = 90 bước) | **0 vi phạm** — mục được chọn sau mỗi bước, việc khối nội dung được dựng lại, và chiều trượt vào vẫn đúng như trước khi tách component |
| Làm mới chuẩn + ảnh chụp cho riêng `transfer` (`LAYOUT_UPDATE_BASELINE=1` + `LAYOUT_UPDATE_SHOTS=1`) | 10 trạng thái hình học / 10 ảnh chụp ghi lại; codec WebP tự kiểm không mất dữ liệu |
| Sau khi làm mới, chạy đầy đủ | **0 vi phạm** — 10 khung nhìn × 15 trạng thái × 2 vị trí = 300 phép đo, 90 bước cử chỉ, 150 ảnh hình học, 150 ảnh màn hình. 14 màn hình khác khớp chuẩn cũ từng pixel, tức vòng này không đụng tới chúng |

Chiều cao trang của màn Nhập/xuất trước/sau (cùng một chuẩn đo, Chromium headless):

| Khung nhìn | Trước | Sau |
|---|---|---|
| 320×568 | 1494 | **610** |
| 360×640 | 1432 | **640** (vừa khung) |
| 390×844 | 1372 | **844** (một màn, không cuộn) |
| 414×896 | 1372 | **896** |
| 768×1024 | 1206 | **1024** |
| 1024×768 | 1188 | **768** |
| 1440×900 | 1188 | **900** |

Giới hạn của phép đo này: giá trị bằng chiều cao khung nhìn nghĩa là "không cuộn",
không phải "cao đúng bằng đó" — `.screen` giãn theo `flex`, nên sàn là khung nhìn.

### Xác nhận trên trình duyệt (thao tác thật trên dev server, Chromium)

Mười hai kịch bản chạy bằng cách gieo file thật vào `input[type=file]` (qua
`DataTransfer`) và đọc lại DOM, chứ không đọc mã nguồn:

1. **CSV hợp lệ**: `2 thẻ sẽ được thêm vào toàn bộ Từ vựng`, `2 bản ghi hợp lệ`, nút
   `Nhập 2 thẻ`; sau khi bấm: `Đã thêm 2 thẻ vào toàn bộ Từ vựng.` và vùng chọn file
   trở lại trạng thái trống.
2. **Nhập lại chính file đó**: `0 thẻ sẽ được thêm`, `2 thẻ đã có, bỏ qua`, nút Nhập bị
   vô hiệu kèm dòng giải thích — không báo thành công giả.
3. **`.xlsx`** → `Chỉ hỗ trợ .json, .csv và .tsv`; **JSON hỏng** → lỗi cú pháp; cả hai
   đều ở trạng thái lỗi của thẻ file, thư viện không đổi.
4. **JSON một phần hợp lệ** (3 phần tử, 1 đọc được): `1 thẻ sẽ được thêm`,
   `2 bản ghi trong file thiếu mặt thẻ hoặc mặt nghĩa — không nhập`.
5. **Đổi chủ đề khi đang có file chờ**: file giữ nguyên, được kiểm tra lại, đích đổi
   `toàn bộ Từ vựng` → `Danh từ`.
6. **Chọn “Bài 3”**: dòng mô tả thành `Gán mọi thẻ trong file vào bài 3.`, đích thành
   `Bài 3`, và bản xem trước hiện `Bài 3` (ghi đè số bài 7 trong file — đúng luật cũ).
7. **Đổi tác vụ khi có file chờ**: sang Xuất rồi về Nhập, file vẫn ở đó; thẻ Nhập mang
   dấu chấm và `aria-label` `Nhập — có file đang chờ`.
8. **Xuất theo phạm vi**: Bài 3 → `midori-2026-10-17.json`, `name` = `Từ vựng · Bài 3`,
   `version: 2`, 5 thẻ, **không** có `srs`; nhãn nút khớp (`Xuất 5 thẻ · Bài 3`).
   Bài 12 (trống) → `Xuất 0 thẻ`, nút vô hiệu.
9. **CSV**: chọn CSV rồi đổi sang “Toàn bộ từ vựng” → định dạng tự về JSON và ô CSV bị
   khoá; xuất CSV một bài cho ra header `front,back,furigana,romaji,tags`.
10. **Gói nhiều nhóm Kanji**: nhập 2 nhóm (1 bản ghi thiếu mặt bị đếm riêng), kết quả
    `2 thẻ sẽ được thêm vào gói nhiều nhóm Kanji` + `2 nhóm: Danh từ (1) · Động từ (1)`;
    xuất lại cho ra `bundles` giữ `deckId` từng nhóm và nhãn `Xuất 8 thẻ · gói nhiều nhóm Kanji`.
11. **Backup**: file tạo ra có đúng 10 khoá của `createBackup`, `srs` chỉ khi bật tiến độ;
    khôi phục file đó hiện `Bản sao lưu hợp lệ · 39 thẻ · có tiến độ học · Tạo lúc 08:28
    17/10/26` + cảnh báo ghi rõ số thẻ hiện có sẽ bị thay; sau khi xác nhận, ứng dụng mở
    lại màn hình lưu trong file và thư viện hiện 39 thẻ. File bộ thẻ (không phải backup)
    bị từ chối: `Đây không phải file backup cá nhân của Midori. Thư viện hiện tại chưa bị
    thay đổi.`
12. **Trần kích thước**: file 13 MB → `File 13.0 MB vượt giới hạn 12.0 MB.`

Thêm hai phép kiểm không thuộc luồng dữ liệu:

- **Bàn phím**: Tab đi theo đúng thứ tự đọc — tác vụ → chủ đề → ô chọn phạm vi → vùng
  chọn file → thanh điều hướng — và vòng focus dùng `:focus-visible` của ứng dụng
  (`1.6px solid rgb(73, 211, 159)` khi đi bằng bàn phím).
- **Mạng**: nhật ký yêu cầu của trình duyệt trong lúc nhập/xuất/sao lưu chỉ có các gói
  mô-đun của dev server — không có yêu cầu nào ra ngoài, tức ba tác vụ không phụ thuộc
  mạng.

### Những gì vòng này KHÔNG kiểm

- **Không có ảnh chụp màn hình để mắt người xem.** Phiên này không lấy được khung hình
  từ webview (`produced no frames`), nên mọi kết luận về bố cục dựa trên số đo, cây trợ
  năng và phép so ảnh từng pixel với chuẩn. Cần một lần xem bằng mắt trên thiết bị thật.
- **Không kiểm trên thiết bị thật**: chọn file mở hộp thoại hệ điều hành, kéo thả thật
  bằng ngón tay, và vuốt thật (cử chỉ trong `audit:layout` là `TouchEvent` tổng hợp —
  nó xác nhận LOGIC của trình xử lý, không xác nhận việc trình duyệt giao sự kiện chạm).
- **Không đo file rất lớn.** Trần 12 MB/32 MB là chặn ở biên; thời gian đọc + phân tích
  một file 11 MB, và việc giao diện có bị khựng trong lúc `deckParse` chạy hay không,
  chưa được đo. Việc phân tích vẫn chạy trên luồng chính (không có worker).
- **Không kiểm trình đọc màn hình**: dấu chấm “có file đang chờ”, thông báo kết quả và
  trạng thái `Đang kiểm tra…` chỉ được kiểm về mặt đánh dấu (`role`, `aria-*`), không
  nghe thật.
- **Không smoke trên bản dựng production** cho màn này: các kịch bản ở mục “Xác nhận
  trên trình duyệt” chạy trên dev server. `npm run audit:layout` thì chạy trên
  `dist/` — nhưng nó chỉ đo trạng thái TĨNH ban đầu của màn, không bấm nút.

## 1.0.3 — Chuyển mục Cập nhật có hiệu ứng trượt; "Theo bộ thẻ" về Trang chủ

Vòng này chỉ đụng giao diện và lớp JS — không đổi lõi Rust, schema lưu trữ hay
dependency. Hai thay đổi (xem ADR-032): thanh chọn "Ứng dụng / Nội dung" trong
Cài đặt → Cập nhật có hiệu ứng trượt theo chiều như thanh chọn chủ đề ở màn
Nhập/xuất; mục "Theo bộ thẻ" CHUYỂN từ Thống kê chi tiết ra Trang chủ, và khuôn
hàng bộ thẻ gộp thành một component dùng chung (`DeckRow.svelte` +
`StructureBar.svelte` + `deck-rows.ts`).

### Tự động

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | 0 lỗi, 0 cảnh báo (`svelte-check`) |
| `npm run test:js` | **151/151** — không đụng logic; vòng này chỉ ở component và tách snippet dùng chung |
| `npm run test:rust` | **174 + 4** — không sửa mã Rust |
| `npm run build` | xanh — index JS 111,36 kB (gzip 37,68), index CSS 14,87 kB (gzip 4,01), precache 35 mục / 495,29 KiB; `Home` 2,88 kB (1,45 kB gzip), gói dùng chung `DeckRow` 4,89 kB (2,22 kB gzip) + CSS riêng 1,43 kB, `StatsDetail` 11,72 → 8,60 kB (3,22 kB gzip), `Settings` 11,54 kB (4,22 kB gzip) |

### Bố cục: `npm run audit:layout`

| Lần chạy | Kết quả |
|---|---|
| Đo riêng `settings` (`LAYOUT_SCREENS=settings`) trước khi làm mới gì | **0 vi phạm** (20 phép đo, 10 trạng thái hình học, 10 ảnh) — hiệu ứng chuyển mục là chuyển động lúc chạy, không đổi bố cục lúc nghỉ, nên `settings` không cần làm mới chuẩn |
| Làm mới chuẩn + ảnh chụp cho riêng `home` + `stats` (`LAYOUT_UPDATE_BASELINE=1` + `LAYOUT_UPDATE_SHOTS=1`) | 20 trạng thái hình học / 20 ảnh chụp ghi lại (mục kiểm kê đổi màn là thay đổi bố cục có chủ ý); codec WebP tự kiểm không mất dữ liệu |
| Sau khi làm mới, chạy đầy đủ | **0 vi phạm** — 10 khung nhìn × 11 trạng thái × 2 vị trí = 220 phép đo bố cục, 90 bước cử chỉ, 110 ảnh hình học, 110 ảnh màn hình; Chrome/155.0.8059.39, `baseline: compared`, `shotsBaseline: compared` |

### Xác nhận trên bản dựng production (`vite preview`)

Hai kịch bản CDP trên `dist/` (Chrome 155.0.8059.39, hồ sơ mới tinh), mỗi kịch
bản tự dựng preview và tự dọn; cả hai ghim `prefers-reduced-motion: no-preference`
qua `Emulation.setEmulatedMedia` trước khi đo, vì Chrome headless mặc định có thể
trả `reduce`:

- **Hiệu ứng chuyển mục.** Bấm "Nội dung" → khối `.scope` chạy animation trượt
  `translate(+14px → 0)` dài đúng **200ms**; bấm "Ứng dụng" → chạy từ `−14px`;
  chiều lấy từ vị trí trên thanh chọn nên đúng cả hai hướng. Chuyển sang
  `prefers-reduced-motion: reduce` rồi chuyển mục → **0 animation**: khối hiện ra
  ngay, không còn chuyển động nào để giảm.
- **Vị trí mục kiểm kê.** Trang chủ có mục "Theo bộ thẻ" (tag "Decks") với đủ 3
  hàng — Từ vựng, Mẫu câu, Kanji — Danh từ — mỗi hàng có thanh cơ cấu và pill
  "% thành thạo"; Thống kê chi tiết còn đúng bốn tiêu đề **Tổng quan → Bài Minna
  → Kanji → Mẫu câu** và không còn mục bộ thẻ nào. Console sạch ở cả hai màn.

### Vẫn chưa kiểm chứng

- Firefox/Safari, thiết bị thật, screen-reader, zoom văn bản — như các vòng trước.
- Hiệu ứng chuyển mục khi bấm nhanh liên tiếp hai lần (trước khi animation 200ms
  kết thúc) — chỉ mới kiểm từng lần chuyển rời rạc.

## 1.0.3 — Thống kê chi tiết thêm hai mục theo chủ đề: Kanji và Mẫu câu

Vòng này chỉ đụng giao diện và lớp JS — không đổi lõi Rust, schema lưu trữ hay
dependency. Màn Thống kê chi tiết có thêm hai mục dưới "Bài Minna": **Kanji** (đủ bảy
nhóm từ `KANJI_CATEGORIES`) và **Mẫu câu** (bộ `patterns` duy nhất), dùng chung khuôn
hàng và snippet với "Theo bộ thẻ" (xem ADR-031).

### Tự động

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | 0 lỗi, 0 cảnh báo (`svelte-check`) |
| `npm run test:js` | **151/151** — không đụng logic đếm; vòng này chỉ ở component |
| `npm run test:rust` | **174 + 4** — không sửa mã Rust |
| `npm run build` | xanh — index JS 111,32 kB (gzip 37,66), index CSS 14,87 kB (gzip 4,01), precache 34 mục / 493,79 KiB; `StatsDetail` 11,72 kB (4,03 kB gzip), `content-sections` (gói dùng chung) 1,17 kB (0,53 kB gzip) |

### Bố cục: `npm run audit:layout`

| Lần chạy | Kết quả |
|---|---|
| Lần đầu, đo riêng `stats` (`LAYOUT_SCREENS=stats`) | **58 vi phạm, tất cả ở màn `stats`** và tất cả từ thay đổi cố ý: hai mục mới (+1148…1168px chiều cao trang tuỳ khung nhìn) và phụ đề dài thêm một dòng ở khổ hẹp (header +21px ở 390x844/414x896) |
| Sau khi làm mới chuẩn + ảnh chụp cho riêng `stats` (`LAYOUT_UPDATE_BASELINE=1` + `LAYOUT_UPDATE_SHOTS=1`, 10 trạng thái) | **0 vi phạm** trên bộ đầy đủ: 10 khung nhìn × 11 trạng thái × 2 vị trí = 220 phép đo bố cục, 90 bước cử chỉ, 110 ảnh hình học, 110 ảnh màn hình; Chrome/155.0.8059.39, mã băm ảnh khớp hồ sơ, codec tự kiểm không mất dữ liệu |

### Xác nhận trên bản dựng production (`vite preview`)

Mở màn Thống kê chi tiết sau khi ghi `meta.screen = 'stats'` vào IndexedDB, đọc DOM
và chụp toàn trang: năm mục đúng thứ tự **Tổng quan → Theo bộ thẻ → Bài Minna →
Kanji → Mẫu câu**; Kanji có đủ 7 hàng (tag "1/7 nhóm có nội dung"), nhóm "Danh từ"
hiện "6 thẻ · 0 đã học / 0% thành thạo / 6 tới hạn · 6 chưa học", sáu nhóm còn lại bị
làm mờ với "Trống" + "Nhóm chưa có thẻ nào"; Mẫu câu 1 hàng ("6 thẻ", "6 tới hạn ·
6 chưa học"). Console sạch.

### Vẫn chưa kiểm chứng

- Firefox/Safari, thiết bị thật, screen-reader, zoom văn bản — như các vòng trước.
- Màn Thống kê khi bộ Kanji có nhiều nhóm hơn một: nội dung hiện tại chỉ có
  `kanji-noun`; hàng trống đã được kiểm, hàng có tiến độ của nhóm khác thì chưa.

## 1.0.3 — một chức năng một chỗ: bốn mục điều hướng

Vòng này không đổi lõi Rust, schema lưu trữ hay dependency: chỉ tổ chức lại điều hướng
theo ADR-030 — mỗi mục dưới cùng sở hữu một tập chức năng riêng (Trang chủ: bảng tình
trạng thư viện; Học: mọi lối vào phiên học; Nhập/Xuất: chuyển dữ liệu; Cài đặt: tuỳ
chọn, cập nhật, công cụ), và màn con gắn chủ sở hữu qua `SECTION_OF` nên tab dưới luôn
đánh dấu đúng mục.

### Tự động

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | 0 lỗi, 0 cảnh báo (`svelte-check`) |
| `npm run test:js` | **151/151** — ca ánh xạ mục viết lại theo `SECTION_OF`, ca Back tách đôi theo mục sở hữu màn con (vòng trước: 150) |
| `npm run test:rust` | **174 + 4** — chạy qua `npm run check`; không sửa mã Rust |
| `npm run build` | xanh — index JS 111,32 kB (gzip 37,66), index CSS 14,87 kB (gzip 4,03), precache 34 mục / 492,77 KiB; `Study` 19,62 kB (7,30 kB gzip), `StatsDetail` 10,68 kB (3,68 kB gzip), `Lessons` 3,56 kB (1,73 kB gzip) |

### Bố cục: `npm run audit:layout`

| Lần chạy | Kết quả |
|---|---|
| Lần đầu | **40 vi phạm pixel-drift, tất cả ở các màn đổi bố cục có chủ ý** (Trang chủ, Thiết lập phiên, Bài học, Thống kê, Kanji, Editor; tab dưới của màn con nay nằm dưới Học/Cài đặt) |
| Sau khi làm mới chuẩn và ảnh chụp (`LAYOUT_UPDATE_BASELINE=1` rồi `LAYOUT_UPDATE_SHOTS=1`) | **0 vi phạm** — 10 khung nhìn, 220 phép đo bố cục, 90 bước cử chỉ, 110 ảnh hình học, 110 ảnh màn hình; Chrome/155.0.8059.39, `baseline: compared`, `shotsBaseline: compared` |

### Smoke trình duyệt — bản dựng production (`vite preview`)

Kịch bản CDP **26 phép kiểm** trên `dist/` phục vụ tại `localhost:4173`, Chrome headless
155.0.8059.39, hồ sơ mới tinh, xoá phiên IndexedDB giữa các chặng. Hành trình: Trang chủ
→ Thống kê chi tiết → Học → Mẫu câu → Kanji → nhóm Kanji → Bài học → phiên học → xoá
phiên → Học toàn bộ → phiên học → Cài đặt → Trình biên tập.

- Trang chủ chỉ còn bảng tình trạng (ba ô số liệu + dòng tóm tắt); không còn "Bắt đầu
  phiên học", "Học ngẫu nhiên" hay "Bộ lọc".
- Thống kê chi tiết chỉ đọc: không hàng nào còn là `button`, không chevron, bấm hàng bộ
  thẻ không điều hướng đi đâu.
- Màn Học: ba hàng chủ đề, hàng đang nhắm hiện "Đang chọn"; thiết lập phiên chỉ còn hai
  ô chọn ("Chế độ", "Thẻ cần học") cùng dòng "Đang học: …". Mẫu câu chọn tại chỗ; màn
  Kanji, nhóm Kanji và Bài học đều giữ tab dưới đánh dấu "Học".
- Bài học: hàng "Học toàn bộ từ vựng" hiện và bấm được; chọn bài đầu → phiên "Thẻ 1 / n"
  với mục tiêu "Từ vựng · Bài 1"; sau khi xoá phiên, "Học toàn bộ" cho mục tiêu "Từ
  vựng" không kèm bài.
- Cài đặt → Trình biên tập thẻ: tab dưới đánh dấu "Cài đặt".
- Lỗi console (Runtime/Log): sạch suốt kịch bản.

### Phát hiện trong lúc kiểm chứng

- Hai phép kiểm đỏ ở lần chạy đầu (số 10 và 22 của kịch bản) — cả hai đều vì CÁCH
  ĐỌC, không phải ứng dụng: `innerText` của Chrome áp cả `text-transform: uppercase`
  (nhãn "Chế độ" đọc ra "CHẾ ĐỘ") và chèn xuống dòng giữa các con của phần tử flex
  (`"Đang học:\nTừ vựng"`). Kịch bản so khớp sau khi chuẩn hoá hoa/thường và khoảng
  trắng thì 26/26 — ghi lại để script smoke sau không mắc lại.

### Vẫn chưa kiểm chứng

- Firefox/Safari, thiết bị thật, screen-reader, zoom văn bản — như các vòng trước.
- Service worker/offline của bản dựng mới: chỉ có số precache từ build, chưa cài đặt và
  chạy ngoại tuyến thủ công.

## 1.0.3 — nâng cấp chuyển động toàn diện

Vòng này chỉ chạm chuyển động: không đổi màu, kích thước, cấu trúc hiển thị, schema
lưu trữ, lõi Rust hay dependency. Chuẩn bố cục cũ được giữ nguyên có chủ đích — nó là
bằng chứng máy móc cho tuyên bố "chỉ chuyển động": nếu thay đổi lấn sang hình học, nó
đỏ ngay.

### Tự động

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | 0 lỗi, 0 cảnh báo (`svelte-check`) |
| `npm run test:js` | **150/150** (không thêm ca: hiệu ứng thuần thị giác, kiểm bằng CDP thay vì unit) |
| `npm run test:rust` | không chạy lại — vòng này không sửa mã Rust |
| `npx vite build` | xanh — index JS 111,22 kB (gzip 37,64), index CSS 14,87 kB (gzip 4,01), precache 33 mục / 496,93 KiB |

### Bố cục: `npm run audit:layout`

Lần chạy hẹp trước (390×844, `home` + `study-revealed`): 0 vi phạm. Sau đó chạy đủ:
**0 vi phạm** so với chuẩn CŨ (không làm mới): 10 khung nhìn, 11 trạng thái, 220 phép
đo, 90 bước cử chỉ, 110 ảnh hình học, 110 ảnh màn hình; renderer
Chrome/155.0.8059.39, `baseline: compared`, `shotsBaseline: compared`.

### Reduced motion: kịch bản CDP hai chiều trên bản dựng

Chạy trên `dist/` (`vite preview` tại `127.0.0.1:4173`), Chrome headless, hồ sơ mới
tinh; script Node 22 + DevTools protocol theo đúng cách `audit-layout.mjs` khởi động
Chrome, `Emulation.setEmulatedMedia` + hook `Element.prototype.animate` để bắt cả
hiệu ứng 0ms. Hai lượt: `reduce` và đối chứng không giảm. Hành trình: khởi động →
đổi tab → ghi phiên học vào IndexedDB → tải lại vào màn Học → lật thẻ → chấm 4 thẻ
`easy` → về Trang chủ lấy mẫu từng khung.

| Phép kiểm | `reduce` | Đối chứng (không giảm) |
|---|---|---|
| Đổi tab/màn | 0 hiệu ứng WAAPI được tạo | `.page` 260ms + viên nav 300ms |
| Lật thẻ | thẻ lật, `stage-swap` không xuất hiện | `stage-swap` chạy (class `swap` xuất hiện) |
| Nội dung mặt đáp án | trễ [0, 0, 0, 0], thời lượng 1ms | trễ [0,14 · 0,2 · 0,26 · 0,32]s |
| Nút chấm điểm | trễ [0, 0, 0, 0] | trễ [0 · 45 · 90 · 135]ms |
| Số "Chưa học" khi về Trang chủ | nhảy thẳng 36 → 32, không khung trung gian (112 mẫu) | đếm 36 → 35 → 34 → 33 → 32 (115 mẫu) |
| Lỗi console (Runtime/Log) | sạch | sạch |

Kết quả: `reduce` **10/10**, đối chứng **11/11** — bộ đối chứng chứng minh các phép
kiểm có "răng" (nếu hiệu ứng không hề chạy ở lượt thường thì lượt `reduce` xanh cũng
vô nghĩa).

### Phát hiện trong lúc kiểm chứng

- Svelte 5 bỏ HẲN cơ chế transition khi `duration` và `delay` đều 0
  (`transitions.js`: gọi `on_begin`/`on_finish` ngay) — nên `duration: 0` của
  `motion.ts` tốt hơn "0ms": dưới reduce không có animation WAAPI nào được tạo, và
  đó là điều được khẳng định, không phải suy đoán từ thời lượng.
- Intro của khối `{#key}` KHÔNG chạy ở lần dựng đầu (block effect chưa `REACTION_RAN`)
  — hiệu ứng vào `.page` chỉ xuất hiện từ lần ĐỔI màn đầu tiên trở đi. Đây là hành vi
  sẵn có của Svelte (trước vòng này cũng vậy), không phải của thay đổi hiện tại;
  phép đo phải bấm đổi tab mới thấy.
- Dàn so le `--rise-delay` (tới ~320ms) và làm mờ `backwards` trước vòng này vẫn giữ
  nguyên ĐỘ TRỄ dưới reduced-motion: nội dung đứng ẩn suốt dải so le rồi mới bật.
  Đã sửa bằng `animation-delay: 0ms !important` trong khối chung (`app.css`); quy tắc
  cục bộ trùng cho mặt đáp án ở `Study.svelte` được bỏ.

### Vẫn chưa kiểm chứng

- Firefox/Safari (script đo dùng `Emulation` của Chromium), thiết bị thật,
  screen-reader, zoom — như các vòng trước.
- "Cảm giác" chuyển động (thời lượng cảm nhận, jank trên máy yếu): các số ở trên là
  timeline animation, không phải frame budget.

## 1.0.3 — thống kê chi tiết theo bài, phân cấp vào phiên học

Vòng này mở rộng hợp đồng WASM (trường cộng thêm, bản ghi cũ đọc được) và viết lại màn
Thống kê. Không đổi schema lưu trữ.

### Tự động

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | 0 lỗi, 0 cảnh báo (`svelte-check`) |
| `npm run test:js` | **150/150** — hợp đồng WASM có thêm ca cho `weakRating`/`weakQuiz` và tiến độ từng bài của `lesson_summary` |
| `npm run test:rust` | **174 + 4** — thêm ca tách lý do yếu (`weak_rating + weak_quiz == weak`, ưu tiên `rating`) và tiến độ từng bài khớp toàn thư viện |
| `npm run build` | xanh |

### Bố cục: `npm run audit:layout`

| Lần chạy | Kết quả |
|---|---|
| Lần đầu | **66 vi phạm, tất cả ở màn `stats`** — viết lại bố cục là chủ ý; 10 màn còn lại giữ nguyên |
| Sau khi làm mới chuẩn và ảnh chụp (`LAYOUT_UPDATE_BASELINE=1` rồi `LAYOUT_UPDATE_SHOTS=1`) | **0 vi phạm** — 220 phép đo bố cục, 110 ảnh hình học, 110 ảnh màn hình |

### Smoke trình duyệt — dev server (`vite --port 5199`)

- Mở Thống kê chi tiết: bốn ô tổng quan; phân rã "chưa thuộc" theo lý do; hai thanh
  thành thạo/làm bài tách biệt kèm mẫu số; mục "Bài Minna" mặc định chỉ hiện bài có thẻ.
- Bấm hàng **"Bài 4"** → màn Học với nhãn "Lọc hiện tại: Bài 4" và nút "Ôn thẻ tới hạn
  · 2 thẻ"; nút quay lại trở về màn Thống kê.
  *(Hành vi này đã bị thay thế ở vòng "một chức năng một chỗ": hàng Thống kê chỉ đọc,
  chọn bài nằm ở màn Bài học — xem mục đầu file.)*
- Hàng bài 0 thẻ bị vô hiệu kèm "Chưa có nội dung" — thay cho ngõ cụt cũ; công tắc
  "Chỉ bài có thẻ" tắt đi hiện đủ 50 hàng, các hàng trống vẫn vô hiệu.
  *(Nay các hàng không có nút; hàng trống chỉ hiện nhãn và bị làm mờ.)*

### Vẫn chưa kiểm chứng

- Bản dựng production/preview (service worker, offline) chưa smoke lại vòng này; smoke
  chạy trên dev server.
- Screen-reader, thiết bị thật, Firefox/Safari và zoom văn bản: như trước, chưa thử.

## 1.0.3 — danh mục học về màn Học, phiên ngẫu nhiên, trình biên tập thẻ

Vòng này không đổi lõi Rust và không đổi schema lưu trữ: phiên `focus: 'random'` là
giá trị mới của trường đã có, đường đọc bản lưu cũ không đổi.

### Tự động

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | 0 lỗi, 0 cảnh báo (`svelte-check`) |
| `npm run test:js` | **143/143** — đầu vòng 128; +15 ca: `tests/card-search.test.ts`, `tests/random-study.test.ts`, ca `focus: 'random'` ở `tests/session-storage.test.ts` và `tests/backup.test.ts` |
| `npm run test:rust` | 169 + 4 (không đổi; vòng này không sửa Rust) |
| `npm run build` | xanh |

### Bố cục: `npm run audit:layout`

Danh mục chuyển màn và editor viết lại là thay đổi bố cục **chủ ý**, nên các trạng thái
liên quan đỏ ngay ở lần chạy đầu (đúng như thiết kế của chuẩn hình học). Trong đó có
một phát hiện thật: thiết kế editor đầu tiên giữ danh sách kết quả cuộn trong lồng ở
mọi trạng thái, khiến **25 nút** không `elementFromPoint` tới được khi cuộn hết trang
(đúng loại lỗi mà đọc CSS không thấy) — đã sửa bằng cấu trúc danh sách → chi tiết. Sau
khi sửa: `LAYOUT_UPDATE_BASELINE=1 npm run audit:layout` rồi
`LAYOUT_UPDATE_SHOTS=1 npm run audit:layout`; chạy lại sạch: **0 vi phạm** — 220 phép
đo bố cục (10 khung nhìn × 11 trạng thái × 2 vị trí), 110 ảnh hình học, 110 ảnh màn hình.

### Smoke trình duyệt — bản dựng production (`vite preview`, Chromium)

**Danh mục ở màn Học.**
Trang chủ không còn khối "Danh mục học" (kiểm cả cây trợ năng lẫn văn bản DOM). Màn
Học hiện đủ ba hàng — Từ vựng 24 thẻ, Kanji 6 thẻ · 6 tới hạn, Mẫu câu 6 thẻ — cùng
nút "Học ngẫu nhiên · 20 thẻ". Bấm "Mẫu câu": ô "Bộ thẻ" đổi thành Mẫu câu, nút bắt
đầu còn **6 thẻ**, và giữ nguyên sau 20 giây không tương tác. Bấm "Từ vựng" mở màn Bài
học; bấm "Kanji" mở màn Kanji ("1/7 nhóm có nội dung").
*(Vòng "một chức năng một chỗ" đã gỡ ô "Bộ thẻ": bấm "Mẫu câu" đánh dấu "Đang chọn"
ngay trên hàng, và dòng "Đang học: Mẫu câu" trong Thiết lập phiên là bản đối chiếu —
xem mục đầu file.)*

**Phiên Mẫu câu và khôi phục giữa phiên.**
Bắt đầu phiên: "Thẻ 1 / 6", nhãn "Mẫu câu · hỏi nghĩa". Chấm 1 thẻ Good → "Thẻ 2 / 6
· đã chấm 1". Tải lại trang → khôi phục đúng "Thẻ 2 / 6 · đã chấm 1" kèm thông báo
"Đã khôi phục phiên học đang dở."; ở lần tải lại trước đó mặt đáp án đã lật cũng được
khôi phục (bốn nút tự chấm hiện lại).

**Phiên ngẫu nhiên.**
Bấm "Học ngẫu nhiên · 20 thẻ" → hàng đợi 20 thẻ; đọc `meta.session` từ IndexedDB:
`deckId '*'`, `focus 'random'`. Phân bố theo bộ, đối chiếu id hàng đợi với store
`cards`: **11 từ vựng + 4 mẫu câu + 5 kanji**. Nhãn từng thẻ trong phiên đúng bộ của
thẻ đang hỏi ("Từ vựng · hỏi nghĩa", "Mẫu câu · hỏi nghĩa", "Kanji — Danh từ · hỏi chữ
Nhật"). Chấm hết 20 thẻ → màn kết thúc "Xong phiên học" + nút "Bốc phiên ngẫu nhiên
mới"; bấm nút này ra phiên mới 20 thẻ (thẻ đầu khác), "Làm lại" sau đó cũng xáo tập
mới; hoàn thành phiên **xoá** bản lưu `meta.session`. Tải lại giữa phiên ngẫu nhiên →
khôi phục đúng thẻ và nhãn. Đặt "thẻ mới tối đa mỗi ngày" = 0 → nút ngẫu nhiên vô hiệu
kèm "Giới hạn thẻ mới mỗi ngày đang là 0 — tăng trong Cài đặt để bốc thẻ ngẫu nhiên.";
trả lại 20 → nút bật lại ("Học ngẫu nhiên · 20 thẻ").

**Trình biên tập thẻ.**
36 kết quả xếp theo mặt trước (thứ tự tiếng Việt), không tự chọn thẻ. Tìm `cơm` → 1
kết quả; tìm `gohan` (romaji) → đúng thẻ đó; lọc "Kanji — Danh từ" → 6. Mở "Cơm": nháp
điền đúng dữ liệu thẻ. Nhập bài **51** → chặn kèm "Bài Minna phải là số từ 1 đến 50.",
thẻ không bị lưu. Sửa "Cơm" → "Cơm nấu chín" → lưu → đọc lại IndexedDB (`v-gohan`)
thấy `front` đổi ngay. Chuyển tab giữa chừng không nuốt chữ đang gõ (chữ nháp còn
nguyên sau vòng tab). Tạo thẻ trống bị chặn kèm "Cần điền ít nhất mặt trước và mặt
sau.". Tạo "Thẻ kiểm thử" trong Mẫu câu, bài 3 → "37 kết quả" và tìm thấy **ngay** ở
tab "Sửa thẻ đã có" không cần tải lại (bug upsert đã sửa), tải lại vẫn còn; danh mục ở
màn Học đổi thành "Mẫu câu 7 thẻ". Console trình duyệt: **0** thông báo ở mức warning
và error suốt phiên smoke.

### Vẫn chưa kiểm chứng

- Screen-reader, thiết bị thật, Firefox/Safari, zoom văn bản: như trước, chưa thử.
- Phiên ngẫu nhiên khi tập bốc **nhỏ hơn** N (ví dụ 5 thẻ mà N = 20): chỉ có test đơn
  vị cho `randomDrawSize`; chưa dựng thư viện nhỏ để smoke thật.
- Phiên ngẫu nhiên ở chế độ **Tự trả lời**: dùng chung đường đi `start()` nên kỳ vọng
  đúng, nhưng smoke vòng này chỉ chạy chế độ lật thẻ.
- Backup cá nhân có `focus: 'random'`: có test JS; chưa nhập/xuất vòng thật trên trình
  duyệt.

## 1.0.3 — chấm điểm theo mức, thành thạo, tách gói

### Chấm điểm: đo bằng hai chỉ số trên bộ dữ liệu có nhãn

`crates/midori-core/tests/answer-scoring.rs` (39 ca, có nhãn do người đặt: mỗi ca kèm
kết luận mà một người chấm công bằng sẽ đưa ra). Chạy
`cargo test -p midori-core --test answer-scoring -- --nocapture` để đọc lại bảng số:

| Chỉ số | Thuật toán cũ (khớp chính xác) | Thuật toán 1.0.3 |
|---|---|---|
| recall (ca đáng nhận được nhận) | 0,880 | **1,000** |
| precision (ca được nhận là đáng nhận) | 1,000 | **1,000** |
| âm tính giả | 3 | **0** |
| dương tính giả | 0 | **0** |

Corpus được kiểm là **có phủ đủ năm kết luận** — một bộ dữ liệu chỉ toàn ca “đúng
hoàn hảo” sẽ không kiểm được nhánh nào của thuật toán, nên sự hiện diện của cả năm
là một bất biến của bộ đo (`every_verdict_appears_in_the_labelled_corpus`).

`tests/answer-scoring.test.ts` chạy lại một bộ tương đương qua **đúng đường đi thật**:
`quizCheck` → biên WASM → `cardMarkAttempt` → `cardsNormalize` (đường đọc lại từ
IndexedDB). Nó cũng chứng minh bản ghi CŨ (không có `lastScore`) đọc ra vẫn vắng
trường đó — không bị gán 0 — và rằng điểm rác (9, −1, `NaN`) bị kẹp về [0,1] thay vì
làm hỏng bước ghi.

### Hiệu năng: đo lại bằng `npm run benchmark:core`

| Phép đo | Kết quả (median / p95, 15 mẫu) | Ghi chú |
|---|---|---|
| `quizCheck` (mọi kết luận) | 0,02 ms / ≤ 0,11 ms | Cấu hình đầy đủ và cấu hình "chỉ khớp chính xác" **bằng nhau ở median** — thuật toán mới không đắt thêm đo được |
| `srsIntervalPreview` — một lần gọi | 0,01 ms / 0,02 ms | 1 lần vượt biên WASM |
| `srsIntervalPreview` — bốn lần `srsSchedule` | 0,04 ms / 0,28 ms | 4 lần vượt biên; p95 gấp **14 lần** |

Thiết bị đo: workstation Linux x64, Node 22.23.1. Số bao gồm tuần tự hoá JSON và
biên JS/WASM; **không** đại diện cho điện thoại.

### Kích thước: trước và sau

| Tài nguyên | 1.0.2 | 1.0.3 | Thay đổi |
|---|---|---|---|
| JS chính | 171,10 kB (56,08 gzip) | **109,41 kB (36,74 gzip)** | −61,7 kB thô, −19,3 kB gzip |
| CSS | 32,94 kB (6,81 gzip) | **15,03 kB (4,02 gzip)** + CSS riêng màn hình | −17,9 kB thô |
| WASM | 232,60 kB (95,33 gzip) | 253,99 kB (102,70 gzip) | +21,4 kB thô, +7,4 kB gzip |
| Precache | 9 mục / 447,46 KiB | 34 mục / 480,41 KiB | Tách gói làm nhiều tệp hơn; tổng tăng vì WASM lớn hơn |

Gói màn hình tách ra: Study 16,77 kB · Transfer 13,91 · Settings 11,19 · StatsDetail
6,60 · Home 6,51 · CardEditor 4,74 · Lessons 2,97 · KanjiOverview 2,58 · KanjiCategory 2,04.
WASM lớn hơn là giá của tính năng mới (chấm điểm theo mức + mô hình thành thạo + xem
trước khoảng ôn); ADR-025 ghi lại một lần quyết định ngược lại trực giác để giành lại
0,9 kB, và hai phép đo này đều chạy lại được.

### Bố cục: `npm run audit:layout`

| Lần chạy | Kết quả |
|---|---|
| Trước khi sửa (cây 1.0.2) | 0 vi phạm |
| Sau khi sửa | **63 vi phạm, tất cả ở màn `stats`** — 100% từ hai thanh thành thạo/làm bài mới (`+72px` ở mọi khung nhìn ≥ 768px). Mọi màn hình khác giữ nguyên: tức việc tách gói và CSS theo màn hình không đổi bố cục, và không có khung hình trắng nào bị đo |

Chuẩn hình học và ảnh chụp của màn Thống kê đã được làm mới theo đúng quy trình trong
quy ước của kho (`LAYOUT_UPDATE_BASELINE=1` rồi `LAYOUT_UPDATE_SHOTS=1`), tức là thay
đổi bố cục là chủ ý và đã được ghi lại, không phải nới ngưỡng.

### Vẫn chưa kiểm chứng

- Screen-reader, thiết bị thật, Firefox/Safari, zoom văn bản: vẫn chưa thử (như trước).
- Chưa đo trên điện thoại thật: mọi con số hiệu năng ở trên là workstation.
- Chưa chạy CI trên runner từ xa (không có `.git` metadata trong workspace này).
- Nạp trước 8 mục sau `ready` làm tăng số yêu cầu mạng trong vài giây đầu; tác động
  lên pin/dữ liệu di động **chưa được đo**.

## Phase 4 — hiệu năng, độ tin cậy và release readiness

### Tự động — chạy trên cây mã sau các chỉnh sửa Phase 4

Môi trường: Fedora Linux x86_64, kernel `7.2.9-301.fc45.x86_64`; Node 22.23.1,
npm 10.9.8, Rust/Cargo 1.96.0, `wasm-pack` 0.15.0, Vite 7.3.7, Svelte 5.57.2.
Không có `.git` metadata: không thể chứng minh checkout sạch, trạng thái diff trước
task, hoặc chạy/poll CI remote.

| Lệnh | Kết quả thực chạy |
|---|---|
| `/usr/bin/time -p npm run check` | Exit 0; svelte-check 0 lỗi/0 cảnh báo; Rust 131/131; JS/TS 106/106; 4,53 s wall |
| `/usr/bin/time -p npm run build` | Exit 0; generate + Vite production build; Vite báo 1,10 s; 3,65 s wall |
| `npm run benchmark:core` | Exit 0; 3 warm-up, 15 sample cho mỗi kích thước; Linux x64 / Node 22.23.1 |
| `npm run content:audit` | Exit 0; 36 cards / 3 bundles, 24 vocabulary trong 6/50 lesson, 6 patterns chưa map lesson, 6 Kanji ở 1/7 nhóm |

Các build/test dùng cache Rust/dependency đã có; không phải clean-checkout proof.
`npm run check` không sinh generated assets, vì vậy build được chạy tuần tự sau check.
CI workflow tồn tại trong source nhưng chưa xác nhận qua remote runner.

### Core benchmark

`npm run benchmark:core` có thể chạy lại sau `npm run generate`. Script sinh dữ liệu
tổng hợp, nạp WASM từ đĩa, warm-up 3 lần và lấy 15 mẫu ở 1k/10k/50k cards. Filter
tính cả JSON serialization và biên JS/WASM; parse tính Rust deck parser nhưng không
đọc file hay ghi IndexedDB. Medians/p95 gần nhất có thể được đọc lại trong
[`release-readiness.md`](release-readiness.md). P95 với n=15 chỉ là chỉ báo đuôi,
không phải ước lượng ổn định. Thư viện nội dung hiện tại chỉ có 36 cards nên không
có căn cứ tối ưu bộ lọc quy mô lớn.

### Đo startup và bundle

Production output cuối: WASM 232,66 kB (gzip 95,28), JS 160,17 kB (52,18), CSS
28,49 kB (5,93), HTML 0,96 kB (0,54), Workbox 5,75 kB (2,36); tổng các tài nguyên
đầu tiên liệt kê 428,03 kB / 156,29 kB gzip; precache 9 mục / 432,51 KiB.
Phương pháp và provisional ceilings ở [`release-readiness.md`](release-readiness.md).
Các browser startup/offline observations bên dưới là từ build trước khi thêm cảnh
báo lỗi lưu màn hình cuối; chưa chạy lại browser trên output cuối.

Trên Chromium automation của VS Code/Electron (`Chrome/150.0.7871.250`), preview
production localhost, 7 cold launches sau khi clear origin/cache và 15 warm reloads:
thời gian từ điều hướng tới khi nav chính hiển thị có median 133 ms / 99 ms,
p95 142 ms / 143 ms. Đây là proxy cục bộ, không phải FCP hay input latency. Một
sample resource timing ghi transfer JS 52.285 B, CSS 6.190 B, WASM 232.961 B và
Workbox 2.658 B. Không đo riêng JS parse/execute hoặc browser WASM compile/init;
không quan sát long task trong số mẫu nhỏ này. Browser báo connection API 3g-like;
không xem số đo là điều kiện mạng được kiểm soát. Không có CPU/network throttling
được áp dụng chủ động và không có thiết bị thật.

Để tái lập: `npm run build`, `npm run preview -- --port 4181`; dùng cùng Chromium
automation host, giữ CPU/network settings cố định, clear site data/Cache Storage/
browser cache trước mỗi cold launch, và đo từ navigation start đến
`nav[aria-label="Điều hướng chính"]` visible. Warm sample reload cùng origin.
Đây là quy trình thủ công, không có browser automation dependency trong dự án.

### Storage recovery và PWA

- Automated `fake-indexeddb` tests xác nhận malformed backup/package bị từ chối
  trước commit; backup round-trip có/không SRS; session được bao gồm khi có; recovery
  record giữ nguyên payload gốc; lỗi ghi recovery abort thao tác thay vì xóa nguồn;
  failed content reconciliation giữ thư viện cũ và có thể retry; nội dung lỗi/hash
  sai hoặc lỗi staging/promotion không thay active package.
- Test session persistence xác nhận failure có `ok: false`; screen-preference
  regression test xác nhận kết quả failure giữ lại cause và success có dạng tường
  minh. `npm run check` cuối đã chạy sau các thay đổi đó. Trên production preview
  cuối, Chromium smoke tiêm lỗi `IDBObjectStore.put` cho `meta/screen`: bấm Học vẫn
  chuyển màn, alert có thể đóng xuất hiện và console ghi `QuotaExceededError`.
- Các test trên dùng failure injection, không mô phỏng quota thật, power loss hay
  transaction scheduling của mọi browser. Backup restore là transaction đơn cho
  learner library; reconciliation sau content activation thuộc database khác nên
  không thể atomic cross-database. Lỗi reconciliation để package active nhưng cards
  cũ nguyên vẹn, UI báo retry.
- Production-preview Chromium smoke trước thay đổi screen-preference cuối: page đã
  được service worker kiểm soát; bật network offline trong browser rồi reload vẫn
  render Home/navigation và thư viện 36 cards. Request version check có thể thất bại
  ngoại tuyến mà không chặn shell.
- App-shell update waiting/activation, cache eviction recovery, content update giữ
  SRS và interrupted-session flows có kết quả lịch sử tại các mục Phase 1–3 bên dưới;
  không chạy lại tất cả trong Phase 4.

Firefox, Safari/WebKit, Android/iOS installed PWA, device hardware, quota exhaustion,
screen-reader, assistive tech, constrained CPU/network, cross-browser service-worker
updates và clean checkout CI **chưa được kiểm chứng**. Xem
[`release-readiness.md`](release-readiness.md) để có release checklist và giới hạn.
Không tuyên bố tương thích browser đầy đủ hay WCAG.

## Phase 3 — design system, motion và trải nghiệm

### Đã xác minh bằng mã nguồn

- Token light/dark, focus-visible, tương phản cao, reduced-motion, safe-area và
  breakpoint 720/1000 CSS px nằm trong `src/app.css`.
- Nav là bề mặt glass cố định phía dưới. Thẻ và biểu mẫu giữ nền đặc; màn hình con
  dùng header thường và nút quay lại.
- Study chỉ cho rating sau khi reveal ở flip; tự trả lời không cập nhật lịch SRS.
  Mặt thẻ bị che có `aria-hidden`.

### Chromium production smoke — Phase 3 milestone (giao diện cũ)

Các số đo bên dưới được ghi trước Phase 6 khi Dynamic Island còn tồn tại; chúng là
nhật ký lịch sử, không mô tả giao diện hiện tại. Production build đã chạy sau Phase
6; browser smoke của giao diện mới chưa được thực hiện.

Đã chạy trên `http://127.0.0.1:4180/`, build production mới, Chromium; phép đo
viewport được ghi theo CSS px:

| Viewport / thao tác | Kết quả |
|---|---|
| Study 390×844 | `document.scrollWidth=390`; không tràn ngang |
| Study 768×1024 | `document.scrollWidth=768`; không tràn ngang |
| Study 1280×800 | `document.scrollWidth=1280`, screen giới hạn 940px; không tràn ngang |
| Flashcard bàn phím | Enter trên “Hiện đáp án” lật thẻ; mặt trước `aria-hidden=true`, mặt sau false, 4 nút rating xuất hiện |
| Reduced motion | Emulate `prefers-reduced-motion: reduce`; `.flipper` transition tính toán `0.001s` |
| Study/session | Phiên có 20 thẻ trong thử nghiệm; thao tác chỉ reveal, không bấm rating; phiên hiển thị lại sau khi mở lại trang. SRS không được truy vấn độc lập trong smoke Phase 3 |

`prefers-reduced-transparency` và fallback trình duyệt không hỗ trợ backdrop blur đã
được xác nhận trong CSS, chưa giả lập runtime. Cũng chưa xác nhận chuyển cảnh mặc
định sau khi bỏ emulation, toàn bộ các màn, focus indicator bằng kiểm tra hình ảnh,
screen-reader, contrast toàn diện, zoom 200%, thiết bị thật hoặc Safari/Firefox.
Không tuyên bố WCAG compliance.

Build cùng toolchain/lệnh/nội dung so với Phase 2 trước đó: CSS gzip 5,88 → 5,89 kB,
JS gzip 51,96 → 51,99 kB, precache 431,28 → 431,39 KiB. Đây là kích thước output,
không phải phép đo thời gian tương tác.

Tài liệu này là quy trình lặp lại được. **Mỗi lần chạm vào `src/pwa/`, `src/content/`,
`vite.config.ts` hoặc `src/storage/`, hãy chạy lại phần liên quan** — lỗi ở những chỗ
này không lộ ra ở test.

## Phase 2 — kiểm định nội dung và luồng học

### Tự động

```bash
npm run content:audit
node --test tests/build-content.test.ts tests/session-storage.test.ts
npm run check
npm run build
```

`content:audit` chỉ đọc nguồn và in báo cáo; `npm run generate` dùng chung validator
và chỉ bắt đầu ghi bundle/seed sau khi đã đọc, kiểm tra toàn bộ nguồn. Test fixture
kiểm tra ID trùng xuyên bundle, source reference thiếu/không an toàn, readings lỗi,
quiz/category/lesson không nhất quán, bundle lỗi không tạo manifest một phần, cùng
các số liệu coverage không suy diễn taxonomy.

Số liệu của nguồn hiện tại được ghi ở [content-coverage.md](content-coverage.md);
phạm vi nguồn/giấy phép và review ở [content-governance.md](content-governance.md).
Kết quả audit không chứng minh tính đúng sư phạm hoặc bản quyền.

Study filter weak dùng `cardsFilter.weakOnly` Rust hiện có. Session lưu `focus` để
khôi phục phiên weak; session cũ thiếu trường này được diễn giải là `due`. Test
Rust hiện có kiểm tra ý nghĩa weak filter; `tests/session-storage.test.ts` kiểm tra
focus và tương thích bản lưu cũ.

### Browser smoke đã chạy và còn thiếu

Đã chạy build production qua Chromium trên origin mới
(`http://127.0.0.1:4178/`):

- Tạo một dấu weak bằng câu trả lời sai ở mode Tự trả lời; Home tăng số “Chưa thuộc”
  từ 0 lên 1.
- Nút Home mở setup Study với `focus=weak`; nút bắt đầu hiển thị 1 thẻ. Bắt đầu
  phiên cho đúng một card (“Xin chào”), không lấy 35 thẻ còn lại.
- Chuyển sang flip, lật card rồi tải lại; Study khôi phục cùng queue 1 card, đúng
  focus weak, mặt đáp án đã lật và thông báo khôi phục.
- Đọc lại IndexedDB `midori` trên origin thử: session ghi `focus: "weak"` và
  `queue: ["v-chao"]`; SRS vẫn `interval=0`, `repetitions=0`, `lapses=0`; dấu quiz
  `lastWrongAt` tồn tại. Quiz không dời lịch SM-2.

Chưa thử: weak + lesson intersection, lần trả lời sai Again/Hard trong flip và lịch
SM-2 sau đó, empty state trên browser, accessibility/keyboard/focus và responsive
mobile cho luồng mới. Browser smoke chỉ xác nhận Chromium ở viewport hiện tại.

Chưa thử tìm kiếm/filter bằng giao diện vì chưa có UI tra cứu thư viện. Rust query
hiện khớp substring, hạ chữ thường, tìm `front`, `back`, `furigana`, `romaji` và
tags; chưa bỏ dấu tiếng Việt hoặc chuẩn hóa katakana half-width.

## Phase 1 — tự động hóa correctness và an toàn dữ liệu

Trên checkout sạch, dùng toolchain trong `.node-version` và `rust-toolchain.toml`:

```bash
npm ci
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --version 0.15.0 --locked
npm run generate
npm run check
npm run build
```

`npm run check` chỉ chạy `svelte-check`, `cargo test --workspace` và
`node --test tests/*.test.ts`; lệnh này **không** sinh WASM/content. `npm run build`
tự chạy `generate` rồi `vite build`. CI thực hiện đúng thứ tự trên.

Test tự động Phase 1:

| Kiểm tra | Test | Bằng chứng / giới hạn |
|---|---|---|
| Chỉ lọc deck Kanji; tab chính hoạt động trên màn phụ | `tests/session-storage.test.ts` | Hàm lọc/ánh xạ thuần; chưa test render Svelte |
| Backup version 1, round-trip có/không SRS, session, schema lỗi, session cũ | `tests/backup.test.ts` | Parser/validator; không thay smoke test UI |
| Backup thật được ghi; lỗi ghi không phá thư viện cũ | `tests/storage-recovery.test.ts` | `fake-indexeddb`; không kiểm tra quota/browser vendor |
| Quarantine giữ record gốc và abort nếu không ghi được recovery | `tests/storage-recovery.test.ts` | IDB giả, lỗi add được tiêm có chủ đích |
| Reconciliation commit lỗi rồi retry | `tests/content-reconciliation.test.ts` | Lỗi commit được giả lập; quota thật chưa thử |
| Manifest, bundle, hash, seed và nội dung lỗi | `tests/build-content.test.ts` | Tạo fixture tạm riêng, không sửa `content/` |
| Lưu phiên báo rõ thành công/thất bại | `tests/session-storage.test.ts` | Hàm lưu được tiêm lỗi; chưa tạo quota browser thật |

### Browser smoke test Phase 1 — đã thực hiện một phần

Đã chạy production preview cuối Phase 1 qua Chromium trên origin mới
(`http://127.0.0.1:4177/`):

- Màn Kanji hiện `Thống kê Kanji`, `Các bộ Kanji`, đúng một hàng `Kanji — Danh từ`;
  không hiện bộ `Từ vựng` hoặc `Mẫu câu`.
- Khi đang ở Kanji, `nav button[aria-current="page"]` là `Trang chủ`.
- Editor hiển thị `Mặt trước · nghĩa tiếng Việt` (ví dụ `Cảm ơn`) và
  `Mặt sau · chữ Nhật` (ví dụ `ありがとう`).
- Restore backup hợp lệ một thẻ trên origin sạch đã thay thư viện, ép đồng bộ lại
  36 thẻ nội dung xuất bản dù backup khai cùng content version, và hiện thông báo
  thành công toàn cục sau khi chuyển về Home (tổng 37 thẻ).
- Restore JSON sai hiện lỗi; màn Nhập/Xuất vẫn hiện 1 thẻ và thư viện không đổi.

Những phần sau vẫn cần smoke test trình duyệt trên origin sạch:

1. Nút Kanji mở đúng bộ học; Tab Trang chủ được đánh dấu ở Stats và Editor cũng chưa thử.
2. Tạo một thẻ và chấm tiến độ; xuất backup cá nhân có tiến độ; restore trên origin
   test sạch; so sánh SRS, cài đặt, phiên dở và metadata. Lặp lại với backup không
   tiến độ, xác nhận SRS/session không có trong file và thẻ restore là mới; xác nhận
   thông báo thành công vẫn hiện sau khi giao diện chuyển sang màn hình đã restore.
3. Chọn JSON bộ thẻ chia sẻ và xác nhận file không chứa SRS.
4. Đưa một record sai schema vào `midori.cards` trong DevTools rồi tải lại; xác nhận
   nó xuất hiện ở `recovery`, tải export cứu hộ, và record gốc trong file export
   giống giá trị trước khi cách ly.

Trường hợp JSON backup hỏng và thông báo restore thành công đã được thử trực tiếp.
Các trường hợp còn lại trên đây là checklist, chưa có kết quả. Transaction tests
hiện dùng `fake-indexeddb`; không tuyên bố quota thật hoặc mọi browser vendor đã qua.

## 0. Chuẩn bị

```bash
npm run generate # cần cho checkout mới và npm run check
npm run check    # phải xanh trước khi bắt đầu kiểm chứng thủ công
npm run build    # sinh lại và tạo bản production mới nhất
npm run preview
```

Mặc định là `http://127.0.0.1:4173/`.

> **Vì sao bắt buộc dùng `preview`:** `devOptions.enabled: false` — chế độ dev **không
> có service worker**, nên mọi hành vi ngoại tuyến và cập nhật đều không tồn tại ở đó.

> **Dùng một origin sạch khi thử lần chạy đầu tiên.** `localhost:5173` và
> `127.0.0.1:4173` là hai origin khác nhau, có IndexedDB và Cache Storage riêng. Đổi
> cổng hoặc tên máy chủ là cách nhanh nhất để có một cài đặt mới tinh.

## 1. Service worker cài và precache đúng

Sau khi mở trang lần đầu, trong console của trang:

```js
const reg = await navigator.serviceWorker.getRegistration();
({ active: reg.active?.state, waiting: !!reg.waiting });
```

```js
const keys = await caches.keys();
const cache = await caches.open(keys[0]);
(await cache.keys()).map((r) => new URL(r.url).pathname);
```

Mong đợi:

- `active: 'activated'`, `waiting: false`.
- Danh sách precache có `index.html`, JS, CSS, `.wasm`, manifest, biểu tượng.
- **Không có** đường dẫn nào bắt đầu bằng `/data/content/` — đây là ADR-005.
- Lần tải đầu tiên `controller` còn `null`: service worker cài xong nhưng chỉ chiếm
  quyền ở lần điều hướng sau. Tải lại một lần là bình thường, không phải lỗi.

## 2. Khởi động ngoại tuyến thật

Cách làm: **dừng hẳn máy chủ**, xác nhận origin không truy cập được, rồi tải lại trang.

```bash
ss -ltn | grep 4173                  # trước khi dừng: phải thấy cổng đang nghe
kill <pid-cua-vite-preview>
ss -ltn | grep 4173 || echo "4173 ĐÃ ĐÓNG"
curl -s -m 3 -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4173/   # mong đợi 000
```

Rồi tải lại trang trong trình duyệt (Tab vẫn mở). Mong đợi:

- Trang tải lại và **dựng đầy đủ**: tiêu đề, thống kê, danh sách bộ thẻ, số thẻ.
- Chấm một thẻ trong phiên học → **thành công** (ghi vào IndexedDB không cần mạng).
- Tiến độ đã chấm trước đó vẫn còn sau khi tải lại.
- Lõi WASM chạy được: đây là điều cần xác nhận riêng, vì nếu `.wasm` không có trong
  precache thì trang vẫn hiện nhưng thống kê sẽ không tính được.

Sau đó khởi động lại máy chủ cho các bước tiếp theo.

## 3. Cập nhật nội dung — nhánh "đã cập nhật"

Dựng một bản nội dung mới có đủ ba tình huống trong **một** lần thử:

1. Sửa nội dung một thẻ **đã học** (giữ nguyên `id`).
2. **Xoá** một thẻ khác khỏi bundle (giữ nguyên `id` ở bản cũ, chỉ bỏ khỏi file).
3. **Thêm** một thẻ mới với `id` mới.
4. Tăng `contentVersion` trong `content/content.json`.
5. `npm run content && npm run build`, rồi tải lại trang.

Bấm "Kiểm tra cập nhật nội dung" trong Cài đặt: quy trình dừng ở bước **xem trước**.
Bảng mong đợi:

| Kiểm tra | Giá trị mong đợi |
|---|---|
| Khối xem trước | `1 thẻ cập nhật, 1 thẻ mới, 1 thẻ bị bỏ` |
| Bấm "Xem chi tiết N thẻ" | Ba nhóm đúng: thẻ đã sửa, thẻ mới, thẻ bị bỏ (đúng mặt trước/sau); ẩn/hiện được |
| Trước khi bấm Kích hoạt | `active` và `meta.contentVersion` **vẫn là bản cũ**; `staging` chứa bản mới |
| Sau khi bấm Kích hoạt | `Đã kích hoạt nội dung <mới>: cập nhật 1 thẻ, thêm 1 thẻ mới, 1 thẻ bị bỏ (vẫn giữ trong thư viện).` |
| `meta.contentVersion` | phiên bản mới |
| Ngăn `slots` trong `midori-content` | `active` + `previous`; **không còn** `staging` |
| Thẻ đã sửa | 4 trường nội dung đổi; `srs.interval`, `repetitions`, `lastRating` **giữ nguyên** |
| Thẻ đã xoá khỏi nội dung | **vẫn có** trong thư viện (mồ côi) |
| Thẻ mới | đã có |
| Tổng số thẻ | `cũ + 1` (thêm 1, không mất thẻ nào) |
| `meta.contentCardIds` | danh sách id công bố mới: **có** thẻ mới, **không có** thẻ bị xoá |

> Nếu quên, `contentCardIds` là **object theo `deckId`**, không phải mảng — dùng
> `ids.vocabulary.includes('v-…')`.

**Dọn dẹp:** hoàn nguyên `content/` rồi `npm run content && npm run build`. Đừng để lại
nội dung thử trong kho.

## 4. Cập nhật ứng dụng

Đây là phần dễ hỏng nhất, cần thử **hai** lần để có bản dựng mới thật.

1. Chạy bước 0. Mở trang, xác nhận service worker đã **điều khiển**
   (`navigator.serviceWorker.controller` khác `null`).
2. Gây ra một bản dựng khác: đổi nội dung một tệp được precache (ví dụ thêm một tệp
   `.svg` tạm vào `public/`), rồi `npm run build`. **Không** dùng thay đổi trong
   `src/` rồi quên hoàn nguyên.
3. Trong trang đang mở, gọi `(await navigator.serviceWorker.getRegistration()).update()`
   và chờ tới khi `reg.waiting` khác `null`.
4. Vào Cài đặt. Mong đợi thấy "Có bản dựng mới đang chờ kích hoạt".
5. Bấm **"Cập nhật và tải lại"**.

Mong đợi:

- Trang tải lại và **dựng đầy đủ** — không trắng trang, không lỗi trong console.
- Nhật ký mạng **không** có yêu cầu script nào thất bại. Đây chính là dấu hiệu của
  ADR-013.
- `waiting: false`; precache chỉ còn tài nguyên của bản mới (không còn tệp cũ).
- Dữ liệu người học không đổi: số thẻ, tiến độ, phiên bản nội dung giữ nguyên.
- Bấm "Kiểm tra bản mới" → `Đang chạy bản mới nhất (1.0.1)`.

> Có thể thấy hai lần điều hướng trong nhật ký mạng (`ERR_ABORTED` rồi `200`) vì
> `vite-plugin-pwa` cũng tự tải lại ở sự kiện `controlling`. Vô hại — xem ADR-013.

**Dọn dẹp:** xoá tệp tạm khỏi `public/` rồi `npm run build`.

## 5. Bảo toàn dữ liệu

Đây là lời hứa trung tâm của dự án (§7.4). Kiểm tra nhanh, độc lập với các bước trên:

| Thao tác | Mong đợi |
|---|---|
| Cập nhật ứng dụng | Số thẻ, tiến độ, `contentVersion` không đổi |
| Cập nhật nội dung | Thẻ đã học giữ nguyên lịch SRS |
| Tải lại trang | Mọi thứ còn nguyên |
| Tải lại trang GIỮA phiên học | Quay về đúng thẻ đang làm dở (xem mục 6) |
| Ngoại tuyến rồi chấm điểm | Ghi được, tồn tại sau khi tải lại |

Câu hỏi cần trả lời được: **hai IndexedDB có thật sự tách nhau không?**

```js
(await indexedDB.databases()).map((d) => d.name + '@v' + d.version);
// → ['midori@v1', 'midori-content@v1']
```

Có cả hai, và pipeline nội dung chỉ mở được cái thứ hai (`src/content/` không import
`src/storage/`) — đó là bảo đảm bằng cấu trúc, không phải bằng quy ước.

## 6. Lưu và khôi phục phiên học đang dở

Đây là hành vi bảo vệ người học khỏi chính cơ chế cập nhật: cập nhật ứng dụng kết
thúc bằng một lần **tải lại trang** (mục 4), mà người dùng không chọn thời điểm đó.

### Cách làm

1. Vào tab **Học**, chọn bộ **Từ vựng**, để chế độ "Lật thẻ và tự chấm", bấm nút bắt
   đầu phiên (nhãn có kèm số thẻ tới hạn, ví dụ `Bắt đầu phiên học · 20 thẻ`). Ghi lại
   số ở tiêu đề (ví dụ `Tiến độ 0/20`).
2. Bấm **Hiện đáp án** rồi chấm một mức bất kỳ (ví dụ `3 · Good`).
3. Bấm **Hiện đáp án** cho thẻ kế tiếp nhưng **đừng chấm** — giữ nguyên ở mặt đáp án.
4. **Tải lại trang** (F5).
5. Kiểm tra tiêu đề, mặt thẻ, thông báo, và bốn mức chấm.
6. Lặp lại từ đầu với chế độ **Tự trả lời**: trả lời sai một thẻ, rồi tải lại.
7. Chấm hết phiên, rồi tải lại lần nữa.

Kiểm tra bản ghi trực tiếp (tuỳ chọn, DevTools → Application → IndexedDB → `midori`
→ `meta` → khoá `session`):

```js
// Trong Console, sau bước 3.
const db = await new Promise((r) => { const q = indexedDB.open('midori'); q.onsuccess = () => r(q.result); });
const tx = db.transaction('meta', 'readonly');
const get = (k) => new Promise((r) => { const q = tx.objectStore('meta').get(k); q.onsuccess = () => r(q.result); });
await get('session'); // → { deckId, mode, queue: ['id', …], index, revealed, rated, mistakes, savedAt }
await get('screen');  // → 'study'
```

**Mong đợi.** `queue` chỉ chứa **id thẻ**, không có nội dung thẻ nào; `revealed` là
`true` sau bước 3; `savedAt` là mốc vừa mới.

### Tiêu chí đạt

| Điều kiểm | Mong đợi |
|---|---|
| Tiêu đề sau khi tải lại | Đúng vị trí đã rời (bước 2 ⇒ `1/20`), không quay về `0/20` |
| Thẻ đang hiện | Đúng thẻ đang làm dở, đúng mặt (đã lật thì vẫn lật) |
| Bốn mức chấm | Hiện đủ, kèm khoảng ôn dự kiến (không hiện nhãn phụ mặc định) |
| Thông báo | "Đã khôi phục phiên học đang dở." |
| Chế độ tự trả lời | Ô nhập **rỗng**, không còn thông báo đúng/sai của lần trước |
| Màn hình đang mở | Quay lại tab Học, không về Trang chủ |
| Chấm hết phiên rồi tải lại | Không còn phiên nào được khôi phục (bản lưu đã bị xoá) |
| Dấu "làm sai" đã ghi | Vẫn còn trong thư viện sau khi tải lại |

### Những gì mục này **không** phủ

- **Quá hạn 12 giờ.** Muốn thử, sửa tay `savedAt` thành `Date.now() - 13*3600*1000`
  trong DevTools rồi tải lại ⇒ phải **không** khôi phục.
- **Thẻ trong bản lưu đã biến mất.** Đường đi này có test đơn vị Rust đầy đủ
  (`session::restore`), nhưng chưa dựng tình huống thật trong trình duyệt bằng cách
  xoá thư viện giữa phiên.
- **Bản lưu hỏng do sửa tay.** Có test JS cho hàm thuần; chưa sửa tay trong DevTools.

## 7. Những gì quy trình này **không** phủ

Nói rõ để không ai tưởng đã kiểm chứng đủ:

- **Thiết bị thật** (điện thoại, Safari, Firefox). Mọi số đo hiện tại là Chromium trên
  máy phát triển.
- **Cài đặt PWA** lên màn hình chính và biểu tượng maskable.
- **Hết dung lượng thật.** Đã mô phỏng bằng store giả trong test.
- **Trình duyệt thu hồi cache.** Đã kiểm chứng — xem mục 9.
- **Tự động hoá.** Toàn bộ tài liệu này là thao tác tay. CI có **một** kiểm tra bằng
  trình duyệt thật — `npm run audit:layout` chạy trong job `layout`, **song song** với
  job `verify` (`.github/workflows/ci.yml`), vì mục đích của nó là bố cục hỏng lộ ra
  ngay thay vì chờ `cargo test` xong. Nó đo bố cục, cử chỉ ở màn Nhập/xuất, so
  **ảnh chụp hình học** của từng trạng thái màn hình với chuẩn đã commit
  (`scripts/layout-baseline.json`, ngưỡng 6px), và so **ảnh màn hình** ở **cả 10 khung
  nhìn** với `scripts/layout-shots/` — ảnh so sánh được tải lên làm artifact khi job
  đỏ, kèm báo cáo máy đọc được (`layout-report.json`); service worker, IndexedDB thật,
  ngoại tuyến và luồng cập nhật vẫn chỉ có trong tài liệu này.

  Phép so ảnh màn hình có hai vùng, và những con số dưới đây là đo tại chỗ trên **cả 110
  trạng thái** (Chrome 155, đủ 10 khung nhìn) chứ không phải thiết kế trên giấy — mỗi
  ngưỡng trong bảng này là kết quả của một phép đo, không phải một con số chọn trước:

  | | ngoài vùng chữ | trong vùng chữ |
  |---|---|---|
  | ngưỡng | 20/255 trên pixel, vượt 0,1% diện tích thì đỏ | ba thước đo trên khối 4×4: trung bình khối 12/255, màu mực 12/255, **lệch sắc** 80/255; đỏ khi vượt **40%** diện tích vùng chữ hoặc khi từ **4 khối** lệch sắc |
  | chạy lại y hệt (nhiễu nội môi trường) | 0 pixel | 0 pixel |
  | renderer khác (`--disable-font-subpixel-positioning`) | 0 pixel ở mọi trạng thái | **110/110 xanh**; vùng chữ lệch nhiều nhất 28,4% (Thống kê ở 820×1180 — chữ nhỏ dày đặc) |
  | đổi màu nền/nhấn (`--accent` lệch 32/255) | đỏ ở 57/110 trạng thái | — |
  | đổi màu chữ (`--text` `#132118`→`#7a1010`, lệch 103/255) | — | đỏ **110/110** nhờ thước đo lệch sắc (màu mực chỉ 103–120/255, không đủ để tự tách khỏi nhiễu renderer 56/255) |
  | đổi màu chữ mờ cùng hướng (`--muted` `#566d63`→`#93a89f`, 60/255, không đổi sắc) | — | đỏ ở **16/110** trạng thái — chỉ những màn có nhiều chữ mờ; đây là giới hạn đã biết của tầng chữ |

  Độ nhiễu nội môi trường ở bảng trên là thứ đáng nhớ nhất: chạy lại cùng máy cho ra
  **0 pixel lệch** (đo trên 220 lần so lại cho mỗi môi trường khi chạy đủ 110 trạng thái),
  nên ngưỡng không phải để chịu nhiễu nội máy — nó để chịu khác biệt giữa các môi trường
  render, và bảng này đặt cạnh nhau hai loại khác biệt đó. Muốn công cụ tự tách chúng:
  `npm run audit:multi-env` (hai cấu hình renderer, dán nhãn THẬT / MỘT MÔI TRƯỜNG cho
  từng vi phạm). Chạy đủ 110 trạng thái (mỗi môi trường kèm 220 lần chụp lại để đo nhiễu
  nội môi trường): **cả hai môi trường 0 vi phạm**, nhiễu nội môi trường **0/255** — tức
  tầng ảnh chịu được khác biệt renderer mà không phải dựa vào may mắn. Trước khi ngưỡng
  vùng chữ được đo lại, **cùng runner này** đã báo **môi trường subpixel 2 vi phạm** (đúng
  hai trạng thái Thống kê ở khung lớn), cả hai được dán nhãn MỘT MÔI TRƯỜNG — đó là cách công
  cụ tách "máy này vẽ khác" khỏi "mã vừa đổi": nó gọi tên nguyên nhân thay vì để người
  đọc đoán từ một con số pixel. Cách xử lý vẫn là làm mới chuẩn trong môi trường đích,
  không phải siết/nới ngưỡng.

## 8. Phụ lục: chọn bộ, số thẻ trước khi bắt đầu, và phản hồi ở Cài đặt

Ba hành vi này được thêm ở vòng hiện đại hoá thứ hai (README mục 3). Quy trình lặp lại
được:

### 8.1 Trang chủ mở đúng bộ

*(Quy trình này thuộc vòng "hiện đại hoá thứ hai": Trang chủ khi đó có hàng bộ thẻ.
Trang chủ hiện không còn hàng bộ thẻ; luồng tương đương là chọn bài/nhóm ở màn Bài
học / Kanji — xem mục đầu file.)*

1. Ở Trang chủ, bấm hàng **Mẫu câu** (không phải hàng đầu tiên).
2. **Mong đợi:** màn Học hiện ra với ô **Bộ thẻ** = `Mẫu câu`, không phải bộ mặc định.
3. Bắt đầu một phiên của bộ đó, chấm một thẻ (`3 · Good`), rồi về Trang chủ và bấm lại
   **đúng hàng đó**.
4. **Mong đợi:** phiên được **khôi phục** đúng vị trí (ví dụ `1/6`), không mất chỗ.
5. Về Trang chủ, bấm một hàng **khác**.
6. **Mong đợi:** mở bộ vừa bấm, **không** khôi phục phiên cũ, và có thông báo
   "Đã bỏ phiên học đang dở của bộ khác để mở bộ này."

### 8.2 Số thẻ tới hạn hiện trước khi bắt đầu

1. Ở màn Học (chưa có phiên), xem nhãn nút: phải là `Bắt đầu phiên học · N thẻ`.
2. Đối chiếu `N` với con số "tới hạn" của bộ đó ở Trang chủ (bằng nhau, hoặc bằng giới
   hạn thẻ mới mỗi ngày nếu bộ có nhiều thẻ mới hơn giới hạn).
3. Vào **Cài đặt**, đặt **Thẻ mới tối đa mỗi ngày** = `0`, quay lại màn Học.
4. **Mong đợi:** nút bị **vô hiệu hoá** với nhãn `Bộ này không còn thẻ tới hạn`.
5. Đặt lại `20`; nút trở về trạng thái bấm được.

### 8.3 Phản hồi của hai nút phục hồi nội dung

1. **Cài đặt** → bấm **Quay lại bản trước** khi có ngăn `previous` ⇒
   "Đã quay lại bản nội dung trước."
2. Xoá ngăn đó trong DevTools (Application → IndexedDB → `midori-content` → `slots` →
   xoá bản ghi `previous`) rồi bấm lại ⇒ "Không có bản nội dung trước để quay lại."
3. Bấm **Cài lại nội dung đi kèm bản dựng** ⇒ "Đã cài lại nội dung đi kèm bản dựng."
4. Cả ba trường hợp đều phải **không** làm mất thẻ hay tiến độ trong thư viện.

## 9. Trình duyệt thu hồi Cache Storage — mở lại và tự cài lại

Trình duyệt được quyền xoá Cache Storage để lấy lại dung lượng nhưng giữ đăng ký
service worker. Bài này kiểm tra ứng dụng **tự cài lại** sau khi bị thu hồi, mà
không mất tiến độ. Lần chạy đầu tiên của bài này tìm ra một lỗi thật (xem dưới).

### Cách làm

1. Chạy bước 0. Học vài thẻ để có tiến độ (ví dụ chấm `3 · Good` → `Tiến độ 1/20`).
2. Trong Console của trang, xoá toàn bộ cache:

   ```js
   for (const k of await caches.keys()) await caches.delete(k);
   await caches.keys(); // → []
   ```

   (Đối chiếu với DevTools → Application → Clear storage → Clear Cache Storage.)
3. **Tải lại trang** khi máy chủ còn chạy. Ghi lại: trang có dựng được không, phiên
   có được khôi phục không, và `caches.keys()` là gì.
4. Tải lại lần nữa. Ghi lại lượng mục trong cache precache.
5. **Dừng máy chủ**, tải lại trang — ứng dụng phải dựng được từ precache.
6. Chấm một thẻ khi ngoại tuyến rồi tải lại — tiến độ phải còn.
7. Khởi động lại máy chủ.

### Tiêu chí đạt

| Điều kiểm | Mong đợi |
|---|---|
| Lần tải lại đầu (máy chủ còn chạy) | Trang dựng đầy đủ, phiên được khôi phục đúng vị trí; lượt này **chưa** có cache (đã gỡ đăng ký, không đăng ký lại trong cùng lần tải) |
| Lần tải lại thứ hai | Precache được điền lại đủ 9 mục, service worker mới `activated`, **không** có worker nào bị kẹt ở `waiting` |
| Tải lại khi ngoại tuyến (máy chủ đã dừng) | Trang dựng đầy đủ từ precache, phiên được khôi phục |
| Chấm điểm khi ngoại tuyến | Ghi vào IndexedDB được; còn nguyên sau khi tải lại |
| Tiến độ, thẻ đã học | Không đổi qua toàn bộ bài |
| Console | Sạch |

### Lỗi mà bài này tìm ra (đã sửa)

Bản trước **không** điền lại precache sau khi bị thu hồi: Workbox chỉ ghi cache ở
sự kiện `install`, còn `registration.update()` bỏ qua `install` khi `sw.js` không đổi.
Hệ quả đo được: tải lại khi ngoại tuyến ra **trang lỗi mạng** (`chrome-error://`),
mặc dù toàn bộ dữ liệu người học vẫn còn trong IndexedDB — mất khả năng ngoại tuyến
một cách im lặng cho tới lần deploy sau.

Cách sửa (`repairEvictedPrecache` trong `src/pwa/updates.ts`): phát hiện precache
trống thì **gỡ đăng ký** ở lần tải đó và **không** đăng ký lại trong cùng lần tải;
lần tải sau đăng ký mới chạy `install` và điền lại precache từ mạng. Chi tiết lý do
không được đăng ký lại ngay ở [decisions.md](decisions.md) ADR-017. Hàm quyết định
có test đơn vị (`tests/pwa-precache.test.ts`).

---

## 10. Điều hướng Back/Home (Phase 6)

Dynamic Island và overlay history đã bị loại bỏ ở Phase 6. Điều hướng hiện chỉ quản
lý màn hình; phần quy tắc thuần có test tự động (`tests/navigation.test.ts`). Các
tiêu chí dưới đây mô tả luồng màn hình hiện tại, không bao gồm overlay.

### Cách làm

Chạy `npm run build` rồi `npm run preview` (service worker chỉ hoạt động ở đây).
Trong Console của trang, dùng `history.back()` thay cho cử chỉ Back của hệ điều hành,
và đọc lại `history.state` cùng màn hình đang hiện.

### Tiêu chí đạt

| Điều kiểm | Mong đợi |
|---|---|
| Mở một màn con (Kanji/Thống kê/Editor/Bài học) | `history.state.screen` là màn đó; có nút Quay lại |
| `history.back()` từ màn con | Về Trang chủ trong **một** lần Back; không có entry "rỗng" ở giữa |
| Nút Quay lại ở header màn con | Về màn trước theo luồng điều hướng |
| Bấm lại tab đang mở ở điều hướng dưới | Không đẩy thêm entry |

### Những gì mục này **không** phủ

- Cử chỉ Back của Android và nút Back phần cứng trên thiết bị thật — chỉ mô phỏng
  bằng `history.back()`.
- Safari iOS dạng tab: pull-to-refresh của trình duyệt không tắt được (xem README
  hạn chế 17).

## 11. Giao diện học thẻ (Phase 5)

| Điều kiểm | Mong đợi |
|---|---|
| Bề ngang 360/390/620px | `document.documentElement.scrollWidth` bằng bề ngang; không tràn |
| 390px (hẹp hơn 430px) | Ô nhập và nút Kiểm tra **xếp dọc**, nút giãn hết bề ngang |
| ≥430px | Ô nhập và nút Kiểm tra **cùng hàng**, thẳng hàng đáy |
| Khối thẻ | Nội dung căn giữa cả hai chiều; khung giãn theo chiều cao còn lại |
| Nộp đáp án sai | Lật sang mặt đáp án, hiện phản hồi đỏ và nút "Thẻ tiếp theo" |
| Chọn văn bản trong thẻ | Chọn/sao chép được; nút và biểu tượng thì không |

Giới hạn: chưa kiểm bằng công cụ screenshot testing tự động; các con số trên đo bằng
mắt trên bản dựng production và đọc `getComputedStyle`.

## 12. Màn Cài đặt tái thiết kế (ADR-036)

### Cách làm

`npm run build` rồi `npm run preview`, mở màn Cài đặt ở một Chromium automation host.
Hành vi của thiết lập đọc lại từ IndexedDB (`midori` → `meta.settings`, `meta.session`,
`cards`) chứ không đọc câu chữ trên giao diện — nhờ vậy phép kiểm bám vào dữ liệu thật.

### Tiêu chí đạt

| Điều kiểm | Thao tác | Kết quả đo được |
|---|---|---|
| Giao diện theo hệ thống | Bấm "Sáng" | `data-theme=light`, `aria-pressed` đổi theo, `meta.settings.theme='light'` |
| Cài đặt sống qua tải lại | `location.reload()` sau khi đổi giao diện | Còn ở màn Cài đặt, `data-theme` và giá trị trong IndexedDB không đổi |
| Kẹp giá trị hợp lệ | Nhập `999` rồi blur | Ô hiện `500`, dòng "Đã giới hạn trong khoảng 0–500 thẻ", `aria-invalid=false` |
| Kẹp giá trị âm | Nhập `-5` | Ô hiện `0` |
| Từ chối giá trị không phải số | Xoá trắng ô rồi blur | Ô trả về giá trị đang dùng, "Nhập một số từ 0 đến 500.", `aria-invalid=true` |
| Giới hạn áp vào phiên | Đặt 20, mở Collection | "Sẽ học 20 thẻ", "Tối đa 20 thẻ mới/ngày; thẻ đã học không bị giới hạn" |
| Trộn thứ tự | Bật/tắt công tắc | `meta.settings.shuffleByDefault` theo đúng trạng thái |
| Ba thay đổi liên tiếp | Giao diện → số thẻ → công tắc, không chờ | Cả ba cùng có trong `meta.settings` (hàng đợi ghi tuần tự, không mất thay đổi) |
| Mở trình biên tập | Bấm hàng Công cụ | Màn `Trình biên tập thẻ`, tab dưới vẫn là `Cài đặt`, Back về đúng Cài đặt |
| Kiểm tra bản mới (có mạng) | Bấm "Kiểm tra bản mới" | "Đang chạy bản mới nhất (1.0.3)."; nút cập nhật không xuất hiện khi không có bản chờ |
| Kiểm tra bản mới (ngoại tuyến) | Tắt máy chủ rồi bấm | "Không kiểm tra được bản công bố (có thể đang ngoại tuyến)." — không báo thành công giả |
| Kiểm tra nội dung | Bấm "Kiểm tra cập nhật nội dung" | Có mạng: "Đang là bản mới nhất (2026.10.12.1)." / ngoại tuyến: "Không có mạng. Vẫn dùng nội dung đang có trên thiết bị." |
| Thông tin ứng dụng | Mở mục gập | Ứng dụng `1.0.3`, lõi `1.0.3`, nội dung `2026.10.12.1`, thư viện `36` — đọc từ nguồn thật |
| Xoá dữ liệu — bước xác nhận | Bấm "Xoá thư viện…" | Hỏi "Xoá 36 thẻ và toàn bộ tiến độ?" trong khi `cards` vẫn đủ 36 |
| Xoá dữ liệu — huỷ | Bấm "Huỷ" | 36 thẻ còn nguyên, nút xoá trở lại |
| Xoá dữ liệu — xác nhận | Bấm "Xác nhận xoá" | `cards` 0, `meta.session` bị xoá, `meta.settings` còn nguyên, thông báo nêu đúng số thẻ đã xoá |
| Không còn phiên "ma" | Chấm một thẻ trong phiên rồi xoá thư viện | Trang chủ hiện "Thư viện đang trống", không có thẻ "tiếp tục phiên" |
| Nội dung trở lại sau khi xoá | `location.reload()` sau khi xoá | Thư viện trở lại 36 thẻ ở trạng thái chưa học |
| Ngoại tuyến | Tắt máy chủ rồi tải lại | Màn Cài đặt dựng đủ bốn nhóm với CSS đúng (service worker phục vụ) |

### Đo bố cục

`LAYOUT_SCREENS=settings npm run audit:layout` trước khi làm mới chuẩn: **0 vi phạm**
ngoài phần hình học/ảnh chụp phải làm mới; **không** có `overflow`, cắt chữ, vùng chạm
quá nhỏ hay `unreachable`. Một vi phạm `unreachable` CÓ xuất hiện ở bản đầu — hai nút
nằm trong `<details>` đóng — và cách sửa là dựng vùng mở rộng bằng `{#if}` thay vì để
nút trong `display: none` (xem `docs/design-system.md`). Sau khi làm mới chuẩn +
ảnh (`LAYOUT_UPDATE_BASELINE=1 LAYOUT_UPDATE_SHOTS=1`), chạy đầy đủ: **0 vi phạm** trên
150 trạng thái, và `LAYOUT_SCREENS=settings npm run audit:multi-env` XANH ở cả hai môi
trường renderer.

### Những gì mục này **không** phủ

- Screen reader thật, thiết bị thật, Firefox/Safari và zoom văn bản (như mọi mục khác).
- Nhánh "có bản dựng mới đang chờ kích hoạt": mọi phép kiểm ở đây chạy trên nguồn đã
  là bản mới nhất, nên nút "Cập nhật và tải lại" chỉ được kiểm là KHÔNG xuất hiện khi
  không có gì chờ; vòng tải lại thật sau cập nhật là mục 4 ở trên.

