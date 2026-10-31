# Nhật ký quyết định kiến trúc

Mỗi mục ghi lại một quyết định, phương án đã cân nhắc, và **số đo** nếu có. Số đo
là phần quan trọng nhất — nó cho phép phiên sau đánh giá lại quyết định này với dữ
liệu thật thay vì niềm tin.

Định dạng: **bối cảnh → quyết định → vì sao → đánh đổi → khi nào nên xem lại.**

---

## ADR-001 — Hợp đồng Rust ↔ JS bằng chuỗi JSON có phong bì

**Bối cảnh.** Cần một giao diện giữa lõi Rust và lớp JS. Các lựa chọn: `wasm-bindgen`
thuần với `JsValue`, `serde-wasm-bindgen`, hoặc một quy ước tự định nghĩa.

**Quyết định.** Mọi hàm vượt biên nhận và trả về **một chuỗi JSON** theo phong bì
`{ok, data}` / `{ok, error}`.

**Vì sao.**

- Hợp đồng kiểm thử được ở **native**. Cùng một đoạn mã chạy ở `cargo test` và trong
  trình duyệt — không có nhánh nào chỉ chạy được trên WASM.
- Một quy tắc lỗi duy nhất. JS chỉ cần một hàm bóc phong bì
  (`src/core/envelope.ts`), thay vì xử lý `Result`/`JsValue`/`panic` ở từng chỗ gọi.
- Không thêm dependency. `serde_json` đã cần cho việc đọc file.
- `error.code` ổn định cho phép JS rẽ nhánh logic mà không so khớp chuỗi hiển thị.

**Đánh đổi.** Tốn một lần `JSON.parse` mỗi lần gọi. Với các hàm thao tác trên tập dữ
liệu lớn, chi phí này nhỏ hơn nhiều so với việc gọi nhiều lần xuyên biên.

**Khi nào xem lại.** Nếu một hàm nào đó bị gọi trong vòng lặp nóng và số đo cho thấy
chi phí parse chiếm ưu thế. Khi đó nên sửa cách gọi (theo lô) trước khi sửa cách
truyền.

---

## ADR-002 — Lõi Rust thuần, id và thời gian do JS cấp

**Bối cảnh.** `crypto.randomUUID()` và `Date.now()` là năng lực nền tảng. Có thể gọi
chúng từ Rust qua `js_sys`, hoặc truyền giá trị từ JS vào.

**Quyết định.** Truyền từ JS vào. Lõi Rust không import `js_sys` hay `web_sys`.

**Vì sao.** Nếu lõi gọi `js_sys`, nó không còn chạy được dưới `cargo test` native, và
`wasm32-unknown-unknown` trở thành điều kiện bắt buộc cho mọi bài kiểm thử nghiệp vụ.
121 test hiện chạy trong vài giây; chuyển sang WASM sẽ chậm hơn hàng chục lần và khó
gỡ lỗi hơn nhiều.

**Đánh đổi.** Nhiều hàm phải nhận tham số `now`. Đây là chi phí thật, nhưng nó cũng
là lợi ích: nhờ có `now` là tham số, test kiểm tra SRS **xác định được** — không phụ
thuộc đồng hồ hệ thống.

**Khi nào xem lại.** Không nên xem lại. Đây là ranh giới nền tảng của kiến trúc.

---

## ADR-003 — Bỏ `unicode-normalization`, thay bằng quy full-width ASCII

**Bối cảnh.** So khớp câu trả lời cần chuẩn hoá Unicode. Crate `unicode-normalization`
cung cấp NFKC đầy đủ.

**Đo được — cách đo lặp lại được.** Thêm lại crate, cho `compat_normalize` gọi thẳng
`nfkc()`, chạy `npm run wasm`, rồi đo `src/generated/midori-wasm/midori_wasm_bg.wasm`
trên cùng một máy:

| | Kích thước WASM | Ghi chú |
|---|---|---|
| `compat_normalize` tự viết (bản đang dùng) | 230.506 byte (225,1 KiB) | xác nhận 2026-10-12 |
| Có NFKC (`s.nfkc().collect()`) | 353.169 byte (344,9 KiB) | cùng ngày, cùng cách build |
| **Chi phí NFKC** | **+122.663 byte (+119,8 KiB)** | tăng **53%** kích thước file |

Lần đo đầu tiên (lúc mới bỏ crate) là **341 KB → 218 KB, giảm 123 KB**. Chi phí đo
được gần như **không đổi** giữa hai lần đo (123 KB và 120 KB); kích thước tuyệt đối
lớn hơn vì lõi đã có thêm nghiệp vụ sau đó.

**Quyết định.** Bỏ crate. Thay bằng `compat_normalize` trong `text.rs`: quy full-width
ASCII (U+FF01–U+FF5E) về ASCII, và dấu cách ideographic (U+3000) về dấu cách thường.
Katakana nửa độ rộng **không** được quy đổi — xem phần đánh đổi.

**Vì sao.** 128 KB là ~93% kích thước WASM trong một ứng dụng offline-first mà người
dùng phải tải trước khi học được. Các trường hợp NFKC xử lý thêm (ký tự tổ hợp, chữ
số full-width, ký hiệu tiền tệ full-width) **không xuất hiện** trong dữ liệu thẻ của
Midori — nghĩa là ta đang trả 128 KB cho một năng lực không dùng tới.

**Đánh đổi đã biết.** **Katakana nửa độ rộng không được quy đổi.** Dữ liệu dạng
`ﾊﾛｰ` sẽ không khớp với `ハロー`. Đã ghi vào danh sách nợ kỹ thuật.

**Khi nào xem lại.** Nếu dữ liệu thẻ thực tế có chứa katakana nửa độ rộng. Cách xử lý
đúng là mở rộng bảng quy đổi của `compat_normalize`, không phải thêm lại NFKC.

---

## ADR-004 — Tắt `wasm-opt`

**Bối cảnh.** `wasm-pack` mặc định chạy `wasm-opt` để tối ưu kích thước.

**Đo được.** binaryen 117 có trong cache chỉ giảm **341 KB → 322 KB (~6%)**, và nó
không xác thực được codegen hiện tại của Rust — quá trình build thất bại.

**Quyết định.** Tắt `wasm-opt` (`wasm-opt = false` trong `Cargo.toml` của crate WASM).

**Vì sao.** 6% không đáng để đổi lấy một build phụ thuộc vào đúng một phiên bản
binaryen có trong cache máy này. Build tái lập được quan trọng hơn 6% kích thước —
đặc biệt với một dự án mà agent phải làm việc qua nhiều phiên và nhiều máy.

**Đánh đổi.** WASM lớn hơn ~6% so với mức có thể đạt được.

**Khi nào xem lại.** Nếu kích thước WASM trở thành vấn đề thật (ví dụ cần dưới 100 KB
gzip), hoặc nếu `wasm-opt` được ghim phiên bản trong CI bằng một bước tải xác định.

---

## ADR-005 — Không precache nội dung xuất bản

**Bối cảnh.** `vite-plugin-pwa` mặc định precache mọi tệp trong thư mục build.

**Quyết định.** Thêm `globIgnores` loại trừ `/data/content/**` khỏi precache.

**Vì sao.** Đây là đặc tả §7.2. Nếu nội dung bị precache, bản nội dung mới sẽ bị cache
cũ che cho tới khi service worker cập nhật — nghĩa là hai loại cập nhật phụ thuộc
nhau, đúng thứ đặc tả cấm. Thêm nữa, precache nội dung nghĩa là mọi lần phát hành mã
đều kéo theo tải lại toàn bộ nội dung.

**Đánh đổi.** Nội dung không có sẵn khi mới cài và chưa từng mở ứng dụng. Được giải
quyết bằng hạt giống (ADR-006).

**Khi nào xem lại.** Không nên xem lại. Việc tách hai loại cập nhật là yêu cầu cốt lõi.

---

## ADR-006 — Cấu trúc collection rỗng đóng vào bundle

**Bối cảnh.** Ứng dụng cần dựng được ngoại tuyến ngay lần đầu, nhưng dữ liệu học mặc
định không nên chứa thẻ mẫu: nội dung do người dùng tự thêm.

**Quyết định.** `scripts/build-content.mjs` sinh
`src/generated/content-seed.json`, đóng vào bundle JS. Khi `readActive()` trả về
`null` (chưa từng cài nội dung), ứng dụng cài cấu trúc các collection rỗng vào ngăn
`active`; lần đồng bộ không tạo thẻ trong thư viện.

**Vì sao.** Màn hình và collection vẫn hoạt động khi ngoại tuyến nhưng thư viện người
dùng không bị nạp nội dung rác. Seed sinh từ **cùng nguồn `content/`** như manifest,
nên chỉ có một nguồn sự thật.

**Đánh đổi.** Các bundle rỗng vẫn cần metadata để giữ tên và loại collection; người
dùng tự nhập hoặc tạo dữ liệu sau này.

**Khi nào xem lại.** Nếu cấu trúc collection mặc định đổi hoặc có nhu cầu cung cấp
nội dung được kiểm duyệt, cần rà soát cùng cơ chế đồng bộ và sự đồng ý của người dùng.

---

## ADR-007 — Hợp nhất hai quy tắc đọc trường `reading` cũ

**Bối cảnh.** Mitsuha lưu cách đọc trong một trường `reading`. Khi chuyển sang mô hình
có cả `furigana` và `romaji`, cần quyết định `reading` tương ứng với trường nào.

**Phát hiện.** Mitsuha có **hai quy tắc khác nhau** ở hai đường đọc dữ liệu khác nhau
— một đường giả định `reading` là furigana, đường kia xử lý linh hoạt hơn. Nghĩa là
cùng một bản ghi có thể được diễn giải khác nhau tuỳ theo đường đọc.

**Quyết định.** Một quy tắc duy nhất dựa trên **hệ chữ**: nếu `reading` là kana thuần
→ `furigana`; ngược lại → `romaji`.

**Vì sao.** Hai quy tắc khác nhau cho cùng một dữ liệu là nợ kỹ thuật, kể cả khi hiện
tại chúng cho kết quả giống nhau. Đã kiểm tra: với dữ liệu thật của cả hai dự án, một
quy tắc duy nhất cho kết quả **không đổi**.

**Đánh đổi.** Bản ghi có `reading` chứa hỗn hợp kana và chữ Latin có thể được phân
loại khác so với một trong hai quy tắc cũ. Không có bản ghi như vậy trong dữ liệu thật.

---

## ADR-008 — Làm bài kiểm tra và luyện SRS tách hẳn nhau

**Bối cảnh.** Có hai chế độ học: lật thẻ tự chấm, và tự trả lời được chấm tự động.

**Quyết định.** Chế độ tự trả lời gọi `card_mark_quiz` — chỉ ghi `last_wrong_at`, còn
lịch SRS thì **không đổi**. Chế độ lật thẻ gọi `srs_schedule`.

**Vì sao.** Làm sai một câu kiểm tra nhanh không có nghĩa người học đã quên thẻ đó.
Trộn hai tín hiệu sẽ khiến lịch ôn bị kéo lệch bởi những lần làm bài vội, và người
học sẽ phải ôn lại những thẻ họ thực ra vẫn nhớ.

**Đánh đổi.** Hai khái niệm "yếu" khác nhau (`last_rating`, `last_wrong_at`) và giao
diện phải hợp nhất chúng (`weak_reason`). Đây là chi phí thật nhưng nó phơi bày sự
thật: hai loại tín hiệu này khác nhau.

---

## ADR-009 — `$state.raw` là bắt buộc cho dữ liệu đi vào lưu trữ

**Bối cảnh.** Lỗi **đã gặp thật trong trình duyệt**:
`DataCloneError: [object Array] could not be cloned`.

**Nguyên nhân.** Svelte 5 bọc sâu mọi đối tượng gán vào `$state` thành `Proxy`.
IndexedDB truyền dữ liệu qua `structured clone`, và **Proxy không clone được**.

**Quyết định.** Mọi trạng thái đi xuống IndexedDB dùng `$state.raw`, không `$state`.

**Vì sao.** Triệu chứng của lỗi này đặc biệt dễ đánh lừa: giao dịch IndexedDB hỏng
nhưng giao diện **vẫn hiển thị đúng**, vì trạng thái trong bộ nhớ đã cập nhật trước
khi ghi. Người dùng thấy mọi thứ bình thường cho tới khi tải lại trang — và mất tiến
độ. Trong một ứng dụng học tập, đó là lỗi nghiêm trọng nhất có thể có.

**Đánh đổi.** Mất tính phản ứng sâu ở những chỗ đáng ra có thể dùng. Trong thực tế
không mất gì: thư viện thẻ được thay thế toàn bộ khi thay đổi, nên phản ứng nông là đủ.

**Hàng rào hiện có.** Ghi chú ở `src/storage/db.ts` kèm mô tả triệu chứng.

**Còn thiếu.** Chưa có **hàng rào kỹ thuật**. Một phiên sau có thể vô tình dùng `$state`
và lỗi sẽ quay lại. Đã ghi vào lộ trình: ép kiểu phẳng ở biên lưu trữ.

---

## ADR-010 — Chưa khôi phục máy cử chỉ của Dynamic Island

**Bối cảnh.** Mitsuha có cử chỉ vuốt trên thanh Dynamic Island (vuốt trái về trước,
vuốt lên về nhà).

**Quyết định.** Bản bootstrap chỉ dùng chạm để mở/đóng. Phần nhìn và vị trí giữ nguyên.

**Vì sao.** Đây là một cắt giảm **có ý thức** để giới hạn phạm vi phiên bootstrap, không
phải một quyết định thiết kế. Máy cử chỉ cần đo vận tốc, phân biệt với cuộn, và xử lý
giới hạn ở cạnh màn hình — một khối lượng công việc đáng kể và dễ làm hỏng các luồng
khác nếu làm vội.

**Đánh đổi.** Mất một phần trải nghiệm đã có ở Mitsuha. Người dùng phải rời khỏi vùng
học để điều hướng.

**Khi nào xem lại.** Sớm — đã nằm trong lộ trình ưu tiên 2.

---

## ADR-011 — Giữ Svelte 5, Vite, TypeScript, idb, vite-plugin-pwa

**Bối cảnh.** Đặc tả §5 yêu cầu tận dụng hệ sinh thái UI trưởng thành, nhưng §10 cho
phép thay thế dependency.

**Quyết định.** Giữ nguyên stack của Mitsuha.

**Vì sao.** Đặc tả §3 yêu cầu không viết lại chỉ vì có cơ hội. Stack này đã chứng minh
phù hợp với bài toán: Svelte biên dịch ra JS nhỏ (bundle chính 108 KB, gzip 37 KB),
Vite xử lý đúng `new URL(..., import.meta.url)` cho file `.wasm` (điểm mà nhiều bundler
khác làm hỏng), và `idb` chỉ là lớp mỏng trên IndexedDB thật — không che giấu giao dịch,
điều kiện tiên quyết cho tính nguyên tử ở ADR-005 và §7.3.

**Đánh đổi.** Gắn với hệ sinh thái Svelte. Đặc tả §5 yêu cầu thiết kế lớp tích hợp để
thay thế được thư viện UI mà không phải viết lại lõi Rust — điều này đã đạt được:
`src/ui/` không chạm WASM, mọi thứ đi qua `src/app/store.svelte.ts`.

**Khi nào xem lại.** Nếu một màn hình UI trở nên phức tạp tới mức Svelte gây khó khăn
rõ rệt. Không có dấu hiệu nào như vậy ở quy mô hiện tại.

---

## ADR-012 — Thẻ mồ côi chỉ báo về, không tự xoá

**Bối cảnh.** Khi nội dung cập nhật và một thẻ biến mất khỏi bộ, thư viện người học
vẫn còn thẻ đó.

**Quyết định.** `content_reconcile` trả về danh sách `orphaned`. Không có hàm nào
trong lõi xoá thẻ.

**Vì sao.** Đặc tả §7.4 cấm tự động xoá dữ liệu cá nhân. Và thẻ đó có thể đã được
người học ôn nhiều lần — có lịch SRS thật, có lịch sử. Xoá nó vì nhà phát hành nội
dung tổ chức lại bộ thẻ là mất dữ liệu người dùng vì lý do hành chính.

**Đánh đổi.** Thẻ mồ côi vẫn xuất hiện trong phiên học. Đây là hành vi **chưa hoàn
thiện**, đã ghi vào nợ kỹ thuật. Hướng giải quyết đúng là giao diện cho người dùng
chủ động ẩn hoặc xoá, không phải tự động xoá.

---

## ADR-013 — Tải lại sau cập nhật chỉ khi service worker MỚI đã điều khiển

**Bối cảnh.** Đặc tả §7.2A yêu cầu bảo đảm tài nguyên của cùng một phiên bản tương
thích với nhau: không để "giao diện mới chạy cùng lõi WASM cũ".

**Lỗi đã gặp thật trong trình duyệt.** `applyAppUpdate()` gửi `SKIP_WAITING` rồi gọi
`window.location.reload()` **ngay lập tức**. Ở thời điểm đó service worker **cũ** vẫn
đang điều khiển trang:

1. Service worker cũ phục vụ `index.html` **cũ** từ precache của nó.
2. HTML cũ trỏ tới `index-<hash cũ>.js`.
3. Bản dựng mới đã xoá file đó khỏi máy chủ, và service worker mới cũng đã dọn nó
   khỏi cache (cleanup) ⇒ yêu cầu thất bại.
4. **Ứng dụng trắng trang.** Phải tự tải lại lần nữa mới dùng được.

Triệu chứng khi chẩn đoán: `document.body` rỗng, không có lỗi trong mã ứng dụng, và
nhật ký mạng có một yêu cầu script cũ thất bại. Giao diện không hề báo lỗi vì lỗi
xảy ra trước khi ứng dụng chạy.

**Quyết định.** Sau `SKIP_WAITING`, **chờ** sự kiện `controllerchange` (có giới hạn
thời gian 3 giây) rồi mới tải lại.

**Vì sao.** `controllerchange` là thời điểm duy nhất bảo đảm HTML và mọi tài nguyên
được phục vụ bởi **cùng một** service worker, nghĩa là cùng một phiên bản bản dựng.
Tải lại sớm hơn vi phạm §7.2A theo cách tệ nhất: nó phá vỡ ứng dụng đang dùng, chứ
không chỉ gây bất tiện.

**Đánh đổi.** Người dùng có thể chờ thêm vài trăm mili giây. `vite-plugin-pwa` cũng
tự tải lại ở sự kiện `controlling`, nên có thể có hai lệnh tải lại trong cùng một
nhịp — vô hại (trình duyệt chỉ điều hướng một lần), nhưng cần biết để không chẩn đoán
nhầm khi đọc nhật ký mạng.

**Hàng rào.** `docs/verification.md` mô tả quy trình thao tác thật để kiểm chứng lại
mỗi khi chạm vào luồng này. **Chưa có test tự động** — xem nợ kỹ thuật trong README.

---

## ADR-014 — `/data/version.json` do plugin Vite sinh

**Bối cảnh.** `checkDeployedVersion()` cần biết nguồn công bố có bản mới hơn hay
không. Nhưng **không script nào sinh ra file đó** — một lỗi đã tồn tại tới khi kiểm
chứng thật trong trình duyệt.

**Vì sao cần cơ chế này.** Service worker chỉ phát hiện bản mới khi có tài nguyên
precache đổi. Một bản phát hành chỉ đổi phiên bản (ví dụ chỉ đổi dữ liệu tĩnh không
được precache) sẽ không kích hoạt được cơ chế đó.

**Cơ chế gây khó chẩn đoán.** Máy chủ tĩnh trả `index.html` với mã **200** cho đường
dẫn không tồn tại (SPA fallback). Vì vậy "thiếu file" trông y hệt "có file":
`response.ok` là `true`, rồi `response.json()` ném lỗi và bị nuốt ở `catch`, và giao
diện hiển thị "Không kiểm tra được (đang ngoại tuyến?)". Lỗi triển khai bị ngụy trang
thành tình trạng mạng.

**Quyết định.**

1. Một plugin nhỏ trong `vite.config.ts` ghi `<outDir>/data/version.json` khi build,
lấy đúng `pkg.version` — **cùng nguồn** với `__APP_VERSION__`, nên hai giá trị không
thể lệch nhau.
2. Bộ đọc kiểm tra `content-type` phải là JSON, nếu không thì trả `null`.
3. Bộ đọc tách sang `src/pwa/version.ts`: module này không import `virtual:pwa-register`
nên **kiểm thử được bằng Node** (`tests/pwa-version.test.ts`, 5 test hồi quy).

**Vì sao không precache file này.** Nếu precache, nó sẽ luôn là bản cũ và việc kiểm tra
mất hết ý nghĩa. `globPatterns` trong `vite.config.ts` cố ý **không** gồm `json`.

**Đánh đổi.** `npm run dev` không có file này (dev server phục vụ `public/`, không chạy
plugin). Bộ đọc trả `null` — đúng hành vi mong muốn ở môi trường phát triển. Muốn thử
đường đi này **phải** dùng `npm run preview` hoặc bản đã triển khai.

---

## ADR-015 — Lưu phiên học đang dở bằng ID thẻ, trong database người dùng

**Bối cảnh.** Cập nhật ứng dụng kết thúc bằng một lần **tải lại trang** (ADR-013).
Trước quyết định này, một buổi học đang dở bị xoá trắng khi trang tải lại: người học
phải tự nhớ mình đang ở bộ nào, thẻ nào, chế độ nào. Đây là hậu quả phụ của cơ chế
cập nhật, không phải một tính năng bị bỏ quên.

**Ba phương án đã cân nhắc.**

| Phương án | Vì sao loại |
|---|---|
| Không lưu gì, chấp nhận mất ngữ cảnh | Việc cập nhật ứng dụng **tự động** tải lại trang; người dùng không chọn thời điểm đó. Mất dữ liệu do thứ mình không kiểm soát được là không chấp nhận |
| Lưu cả bản sao nội dung thẻ | Bản lưu cũ đi sau mỗi lần cập nhật nội dung, và khi chấm điểm bản cũ sẽ ghi đè lên nội dung mới. Hai nguồn sự thật |
| Lưu `queue` chỉ gồm **id thẻ** | Bản lưu không bao giờ cũ; nội dung thẻ luôn là bản mới nhất. Đổi lại phải xử lý được thẻ đã biến mất |

**Quyết định.** Ba phần:

1. **Bản lưu nằm trong database người dùng** (`midori`, store `meta`), không phải
database nội dung. Pipeline cập nhật nội dung không mở được database người dùng, nên
về mặt **cấu trúc** nó không thể chạm tới bản lưu — giống lý do ở ADR-001 của README
mục 7.
2. **Đối chiếu id với thư viện hiện tại do lõi Rust làm** (`session::restore`): bỏ id
không còn tồn tại, bỏ id trùng lặp, và **tính lại `index`** trên chính hàng đợi đã lọc.
Đây là chỗ dễ sai nhất: nếu hai thẻ *trước* thẻ đang học bị bỏ, giữ nguyên `index` cũ
sẽ nhảy sang thẻ khác. Giữ quy tắc này trong Rust để nó chỉ tồn tại ở một nơi và có
test đơn vị (8 test, gồm cả trường hợp thẻ đang học bị bỏ ⇒ trỏ vào thẻ kế tiếp).
3. **Lấy lại thẻ theo id ở thời điểm GHI, không phải thời điểm bắt đầu phiên.** Mọi
thao tác ghi đi qua `store.liveCard(id)`. Nếu không, một phiên được khôi phục sau khi
cập nhật nội dung sẽ ghi bản thẻ cũ đè lên nội dung mới vừa đồng bộ.

**Hạn dùng 12 giờ.** Hàng đợi phản ánh trạng thái "tới hạn" tại thời điểm bắt đầu.
Khôi phục vô hạn thời gian biến nó thành danh sách thẻ chưa tới hạn; còn mốc quá
ngắn thì không bao được trường hợp gấp máy qua đêm. 12 giờ cũng chặn luôn mốc thời
gian ở tương lai (đồng hồ máy bị chỉnh lùi), vì bản lưu "từ tương lai" sẽ không bao
giờ hết hạn.

**Bản lưu là dữ liệu phụ.** `normalizeSession()` là hàm thuần, có 9 test JS: bản ghi
sai kiểu, thiếu trường, hàng đợi rỗng, quá cũ đều trở thành "không có phiên nào" —
không bao giờ ném lỗi và không bao giờ chặn khởi động (xem ADR-009).

**Hàng rào.** Test đơn vị Rust (8) + test JS cho hàm thuần (9) + thao tác thật trên
trình duyệt ở `docs/verification.md` (tải lại giữa phiên ở cả hai chế độ).

---

## ADR-016 — Hiện đại hoá giao diện bằng token và chuyển động, không thêm dependency

**Bối cảnh.** Giao diện cần được hiện đại hoá (chuyển động, phản hồi thị giác, hệ
thống thiết kế nhất quán) sau nhiều phiên tập trung vào nền tảng.

**Quyết định.**

1. **Token thiết kế tập trung ở `src/app.css`**: bảng màu, bo góc, đổ bóng, và **thang
chuyển động** (`--dur-*`, `--ease-*`). Component dùng token thay vì tự khai báo giá
trị, nên đổi một lần là đổi toàn bộ. Đây là vanilla CSS, không thêm framework CSS.
2. **Biểu tượng là SVG nội tuyến** (`src/ui/Icon.svelte`). Chọn cách này thay vì một bộ
icon dạng font hay package: vài chục path nhỏ gọn hơn nhiều lần một dependency, và
không gây một yêu cầu mạng nào khi ngoại tuyến.
3. **Chuyển cảnh dùng `svelte/transition` có sẵn.** Chuyển màn hình dùng `in:fly`
**không có `out:`** — màn hình cũ biến mất ngay, nên bố cục không bao giờ có hai
`.screen` cùng tồn tại trong một cột flex và đẩy nhau. `y` dương (trượt lên) đúng cho
mọi cặp màn hình, không phụ thuộc thứ tự tab.
4. **Lật thẻ là chuyển đổi 3D thật** (`rotateY` + `backface-visibility`). Hai mặt nằm
chồng trong một khung cao cố định; đây là điều kiện để phép biến đổi không làm nhảy bố
cục. Hệ quả đã biết: nội dung dài hơn khung sẽ cuộn bên trong mặt thẻ.
5. **Mặt thẻ bị che được đánh dấu `aria-hidden`.** `backface-visibility: hidden` chỉ
che về mặt **hình ảnh**; không có `aria-hidden`, trình đọc màn hình sẽ đọc luôn đáp án
trước khi người học trả lời.
6. **Tôn trọng `prefers-reduced-motion: reduce`** ở **cả ba** chỗ có chuyển động lặp:
viên gradient màn hình khởi động, khung xương màn Học, và các chuyển cảnh. Một khối
`@media` hình thức sẽ không đủ.

**Chi phí đã đo.** CSS 6,46 → 19,66 KB (gzip 1,98 → 4,82 KB); JS chính 108,43 →
123,46 KB (gzip 37,62 → 42,43 KB). Lớp giao diện tăng **+7,7 KB gzip** (cộng thêm
0,6 KB cho `session::restore` ở WASM ⇒ ~8,3 KB gzip cho cả phiên). Con số này gồm cả
vòng hiện đại hoá thứ hai (mở đúng bộ thẻ, số thẻ trước khi bắt đầu, chữ co giãn, bố
cục màn rộng); riêng vòng đó là **+1,04 KB gzip** so với bản dựng ngay trước nó. Không
thêm dependency nào. Đây là lý do chọn mức này thay vì một thư viện UI/component.

**Hàng rào.** `svelte-check` (0 lỗi) bắt lệch kiểu ở biên component; dung lượng được
đo lại bằng `npm run build` và ghi vào bảng bên dưới mỗi khi giao diện thay đổi.

---

## ADR-017 — Sau khi trình duyệt thu hồi Cache Storage: gỡ đăng ký, không đăng ký lại trong cùng lần tải

**Bối cảnh.** Trình duyệt được quyền xoá Cache Storage để lấy lại dung lượng nhưng
giữ đăng ký service worker. Khi đó precache trống, và không gì tự điền lại:
Workbox chỉ ghi cache ở sự kiện `install`; ở `fetch` nó lấy từ mạng và **không**
ghi lại; `registration.update()` bỏ qua `install` khi `sw.js` không đổi (so theo
byte). Kiểm chứng thật (verification.md mục 9): ứng dụng vẫn mở được khi có mạng
nhưng **tải lại khi ngoại tuyến ra trang lỗi mạng**, trong khi toàn bộ dữ liệu người
học vẫn còn nguyên — mất khả năng ngoại tuyến im lặng cho tới lần deploy sau.

**Quyết định.** Ở mỗi lần boot, trước khi `registerSW()` chạy, so precache với
điều kiện "còn `index.html`" (`precacheIsEvicted`, hàm thuần có test đơn vị):

1. Precache còn đủ → không đụng tới gì.
2. Precache trống/vắng mà có đăng ký → **gỡ đăng ký** và **bỏ qua đăng ký lại trong
   cùng lần tải**. Lần tải sau không còn đăng ký nào nên `registerSW()` tạo đăng ký
   mới, đăng ký mới **luôn** chạy `install`, và precache được điền lại từ mạng.

**Vì sao không đăng ký lại ngay.** `registration.unregister()` dọn registration ở
một task khác, còn `navigator.serviceWorker.register()` chạy ngay sau đó sẽ **bám
lại** vào registration đang dỡ (worker cũ vẫn đang điều khiển trang). Lúc đó `sw.js`
không đổi theo byte nên `install` không chạy: precache vẫn trống và registration vẫn
sống — vòng lặp hỏng vô hạn. Đây không phải suy đoán: nó tái hiện được đúng như trên
trong khi kiểm chứng. Đăng ký lại chỉ an toàn khi registration đã bị dọn hẳn, tức là
ở lần tải sau.

**Hệ quả đã biết.** Lần tải đầu tiên sau khi bị thu hồi chưa có precache (chỉ chạy
từ mạng); khả năng ngoại tuyến trở lại ở lần tải thứ hai. Lần tải đó không theo dõi
cập nhật ứng dụng (`registerSW` bị bỏ qua) — vô hại vì đăng ký đã bị gỡ. Không tự
tải lại trang, không vòng lặp: mọi lỗi chỉ lùi về hành vi cũ (mở được khi có mạng).

## ADR-018 — Cách ly bản ghi thẻ lỗi thay vì xóa âm thầm

**Bối cảnh.** `loadCards()` chuẩn hóa dữ liệu IndexedDB. Trước Phase 1, đường đi
`cardsNormalize()` → `rejected` → xóa khóa trong store `cards` có thể xóa không thể
phục hồi bản ghi gốc.

**Quyết định.** Schema người dùng v2 thêm store `recovery`. Một transaction duy nhất
ghi nguyên record/khóa/mã lỗi/lý do/thời điểm vào recovery rồi xóa record lỗi khỏi
cards. Nếu thao tác không thành công, abort transaction để bản gốc còn trong cards.
Giao diện cho tải export dữ liệu cứu hộ; không tự thử biến dữ liệu không hợp lệ
thành thẻ.

**Kiểm chứng.** `tests/storage-recovery.test.ts` dùng `fake-indexeddb` để kiểm tra
quarantine thành công và transaction abort được tiêm lỗi. Đây là giả lập IDB, không
thay cho xác minh browser/vendor thật.

## ADR-019 — Backup cá nhân tách biệt file bộ thẻ chia sẻ

**Bối cảnh.** File chia sẻ cố ý không chứa lịch SRS; người dùng cần một cách riêng để
di chuyển thư viện và trạng thái học trên thiết bị.

**Quyết định.** JSON `midori-personal-backup` v1 chứa cards, settings, content-sync
metadata và screen; `includeProgress` bật/tắt SRS và session. Restore xác thực toàn
bộ trước khi thay cards và metadata trong một transaction IndexedDB. Restore yêu cầu
xác nhận rõ ràng vì thay thế toàn bộ thư viện/cài đặt.

**Đánh đổi.** Backup là JSON không mã hóa, không chứa nội dung có thể tải lại hay
store recovery. Phiên session cũ hơn 12 giờ bị bỏ; SRS không bị bỏ theo phiên.
Sau khi giao dịch restore thành công, ứng dụng ép đồng bộ với nội dung đang hoạt động
(không chỉ so phiên bản), để metadata phiên bản trùng nhưng danh sách thẻ thiếu không
để thư viện rỗng. Kết quả restore được báo qua thông báo toàn cục để không mất khi
đổi sang màn hình được lưu trong backup.

## ADR-020 — Lập kế hoạch reconciliation trước khi commit

**Bối cảnh.** Đồng bộ nhiều bundle theo từng lần ghi có thể để thẻ đã cập nhật nhưng
metadata phiên bản/id cũ nếu giao dịch gặp quota hoặc lỗi IDB.

**Quyết định.** Lập kết quả reconciliation trong bộ nhớ cho toàn bộ bundle, sau đó
ghi các thẻ đổi cùng `contentVersion`/`contentCardIds` trong một transaction. Chỉ
cập nhật state in-memory sau commit. Lỗi được hiển thị cùng nút retry; nội dung đang
dùng và thẻ/tiến độ cũ được giữ.

**Kiểm chứng.** Test helper xác nhận commit chỉ gọi một lần, giữ SRS, lỗi commit
không đột biến mảng đầu vào và retry thành công. Transaction thật được kiểm tra qua
fake IndexedDB cho nhánh restore; quota thật trên browser chưa thử.

## ADR-021 — Toolchain và CI xác định

**Quyết định.** Ghim Node `22.23.1` tại `.node-version`, Rust `1.96.0` cùng target
WASM tại `rust-toolchain.toml`, và `wasm-pack 0.15.0` trong workflow CI. Từ checkout
sạch, CI chạy `npm ci`, `npm run generate`, `npm run check`, `npm run build`.

**Lý do.** `check` không tự generate theo định nghĩa hiện tại của package scripts;
CI cần sinh WASM/content trước test. `build` tự generate, nên bước build kiểm chứng
cũng độc lập.

**Giới hạn kiểm chứng.** Workflow được thêm tại Phase 1 nhưng chưa có run remote
trong phiên này; cấu hình không được mô tả là CI đã xanh cho tới khi GitHub chạy.

## ADR-022 — Kiểm định content ở bước build và báo cáo coverage từ metadata

**Bối cảnh.** Các bundle nguồn được chuẩn hóa bằng cách bỏ qua một số trường sai;
ID chỉ được kiểm tra trong từng gói; không có báo cáo cho thấy 50 bài Minna và bảy
nhóm Kanji thực sự có dữ liệu hay mapping. Nội dung chưa khai báo nguồn/giấy phép.

**Quyết định.** Dùng `scripts/content-validation.mjs` làm validator chung cho
builder và `npm run content:audit`. Kiểm tra tất cả bundle/ID/reference/readings và
quy tắc assignment trước khi builder ghi package hoặc seed. Báo cáo lấy targets 50
bài và 7 nhóm từ yêu cầu Phase 2, nhưng chỉ đếm `lesson` và `kanji-*` đang có; không
phỏng đoán tên/category hoặc nội dung bị thiếu. Nguồn/giấy phép không có metadata
được báo là chưa xác minh, không mặc định hợp lệ.

**Vì sao.** Sai dữ liệu phải dừng build thay vì bị lọc âm thầm; audit có thể chạy
trên checkout mà không sửa file. Kiểm tra ở bước phát hành giữ nguyên ranh giới
Rust/WASM và runtime integrity pipeline.

**Đánh đổi.** Validator từ chối kana/romaji có hình thức ngoài quy tắc hiện hỗ trợ;
biên tập viên phải rà soát và nới schema có chủ đích. Nó không xác nhận tính đúng
sư phạm, quyền tác giả, hay coverage giáo trình.

**Kiểm chứng.** `tests/build-content.test.ts` dùng fixtures cho duplicate IDs trong/
xuyên gói, source reference, readings, quiz/lesson/Kanji assignment, lỗi không tạo
manifest một phần và coverage summary. Số liệu nguồn hiện tại: 36 thẻ, 3 bundle;
24 vocabulary ở 6/50 bài, 6 patterns không gắn bài, 1/7 Kanji group. Xem
[`content-coverage.md`](content-coverage.md).

## ADR-023 — Ôn weak cards dùng cùng Rust filter và lưu focus phiên

**Bối cảnh.** Rust đã định nghĩa weak từ rating Again/Hard và dấu sai quiz, nhưng
Study chỉ bắt đầu với cards tới hạn và Home không có đường vào ôn weak.

**Quyết định.** Study cho chọn `due` hoặc `weak`; cả số đếm trước phiên và hàng đợi
đều gọi `cardsFilter` với cùng deck/lesson/focus. Chế độ flip vẫn dùng SM-2; chế độ
self-answer không đổi lịch. Session ghi `focus`; bản lưu cũ thiếu trường này mặc
định `due`. Home mở lựa chọn weak thay vì hiển thị số weak toàn thư viện như số
thẻ chắc chắn thuộc bộ mặc định.

**Giới hạn kiểm chứng.** Rust filter và session normalization có test. Chromium
production smoke đã xác nhận quiz sai → Home → mở đúng một weak card → reload khôi
phục queue/focus/mặt đã lật; IndexedDB xác nhận interval/repetitions/lapses không
đổi. Lesson intersection, empty state, keyboard/focus, mobile và các browser khác
chưa được kiểm chứng.

---

## ADR-024 — Liquid Glass dùng chung có fallback; tương tác Island rõ trạng thái

**Bối cảnh.** Nav đã có fallback cho browser không hỗ trợ `backdrop-filter` và
`prefers-reduced-transparency`; Island chưa có. Panel Island lặp lại quy tắc surface
glass riêng, tên trợ năng luôn là “Mở” kể cả khi panel đang mở, và chiều cao nút là
36px.

**Quyết định.** Giới hạn glass ở nav/Island; tái sử dụng `.surface-panel` cho panel
Island, thêm nền đặc khi thiếu backdrop blur hoặc khi người dùng yêu cầu giảm trong
suốt. Accessible name đổi theo trạng thái mở/đóng; mục tiêu chạm Island là 48 CSS
px. Không thêm thư viện giao diện hay motion.

**Giới hạn kiểm chứng.** Svelte check/build và Chromium viewport, bàn phím, trạng thái
reduced-motion/reduced-transparency cần ghi kết quả trong
`docs/verification.md`. Chưa có audit WCAG, thiết bị thật, browser vendor khác hoặc
screen-reader.

---

## ADR-025 — Không nuốt lỗi khi lưu màn hình gần nhất

**Bối cảnh.** `AppStore.go()` từng bắt lỗi ghi screen preference rồi bỏ qua. Đây
không làm mất cards/SRS/session, nhưng sau khi tải lại ứng dụng có thể trở về màn
hình cũ mà không giải thích.

**Quyết định.** Tiếp tục điều hướng trong phiên hiện tại, ghi cảnh báo có thể đóng
và log lỗi nếu lưu preference thất bại. Các lần ghi bất đồng bộ được đánh số để
kết quả cũ không ghi đè cảnh báo/kết quả mới.

**Vì sao.** Không chặn việc học vì một preference phụ trợ, nhưng cũng không tạo ấn
tượng rằng trạng thái điều hướng đã được lưu chắc chắn. Không thay đổi schema hay
luồng persistence của dữ liệu học.

**Kiểm chứng.** Test helper tiêm lỗi và xác nhận success/failure kèm cause; `npm run
check` sau chỉnh sửa đạt. Production Chromium smoke tiêm lỗi cho `meta/screen`, xác
nhận điều hướng vẫn hoàn tất, alert hiện và cause được log. Không mô phỏng quota thật.

---

## ADR-022 — Chấm câu trả lời theo năm kết luận thay vì đúng/sai

**Bối cảnh.** `check_answer` chỉ trả `bool`. Với người học Việt–Nhật, hai kết cục đó
sai ở cả hai phía: gõ thiếu dấu tiếng Việt bị coi là sai (trừng phạt tay gõ), còn "gõ
nhầm một ký tự" và "không biết gì" không phân biệt được (mất thông tin cho cả phản hồi
lẫn số liệu).

**Quyết định.** Thêm `verdict` (`empty | wrong | near | accepted | exact`) và `score`
(0 · 0.5 · 0.9 · 1.0) song song với `correct` cũ. `correct` được giữ nguyên nghĩa để mã
đã có không phải đổi.

Ba lựa chọn đáng ghi lại:

- **`near` không được tính là đúng.** Cho nửa điểm vào bộ lọc "Chưa thuộc" sẽ làm loãng
  chính tín hiệu học tập mà nó phục vụ.
- **Bỏ dấu chỉ áp cho hệ chữ Latin.** Chữ Nhật chỉ có một nhánh: khớp chính xác (cộng
  thêm nhánh "gần đúng" để nhận ra `こんにちわ` cho `こんにちは`).
- **Có cấu hình.** `AnswerConfig { accent_tolerant, allow_typos }`, mặc định bật cả hai,
  để quy tắc chấm là **đầu vào tường minh** chứ không phải hành vi ẩn.

**Hệ quả.** `last_wrong_at` giữ nguyên nghĩa; không có dữ liệu lịch sử nào bị diễn giải
lại, vì điểm chưa từng được lưu trước 1.0.3.

**Kiểm chứng.** Bộ dữ liệu 39 ca có nhãn ở `crates/midori-core/tests/answer-scoring.rs`
so trực tiếp thuật toán cũ với thuật toán mới trên hai chỉ số: recall 0,880 → **1,000**,
precision **1,000 → 1,000**, âm tính giả 3 → **0**. Cùng bộ đo đó chạy lại qua biên WASM
ở `tests/answer-scoring.test.ts`.

---

## ADR-023 — Độ thành thạo là một thước đo riêng, không phải điểm của lần làm bài

**Bối cảnh.** Yêu cầu rõ ràng: phân biệt kết quả của một lần làm bài với mức độ thành
thạo lâu dài, và không đánh đồng tốc độ trả lời với kiến thức.

**Quyết định.** `SrsState::mastery()` suy từ **chỉ lịch ôn** (công thức và tính chất ở
`data-model.md` §2), và `DeckStats` báo hai thước đo tách biệt: `mastery` (trung bình
dài hạn) và `accuracy` + `graded` (điểm lần làm bài gần nhất, kèm mẫu số).

Cố ý **không** dùng tốc độ trả lời: nó nhanh nhưng là tín hiệu về tay gõ và về thiết bị,
không phải về việc đã nhớ hay chưa. Việc đánh giá bằng số thay vì bằng cảm nhận nằm ở
bộ dữ liệu có nhãn (ADR-022) và ở các bất biến của `mastery` (đơn điệu theo `interval`,
không đổi khi có một lần trả lời) — cả hai đều có test.

**Hệ quả.** Màn Thống kê chi tiết nay hiển thị hai thanh riêng có nhãn riêng thay vì một
con số phần trăm duy nhất như trước (con số đó gọi là "% đã học" nhưng đọc như "% thành
thạo"). `graded = 0` hiển thị `—` chứ không phải `0%`.

---

## ADR-024 — Tách gói màn hình, nhưng màn hình ĐẦU TIÊN phải nạp xong trước `ready`

**Bối cảnh.** Mọi màn hình nằm trong cùng một gói JS, nên mở ứng dụng là tải cả màn
Thống kê, Trình biên tập thẻ và 7 nhóm Kanji trong khi chỉ xem Trang chủ.

**Quyết định.** Mỗi màn hình là một `import()` động (`src/ui/screens.ts`), có bộ nhớ đệm
cho phép lấy component **đồng bộ** ở lần dựng thứ hai trở đi. Ba lớp chống khung trắng:

1. `boot()` chờ gói của màn hình đang mở **trước khi** bật `ready` — khung hình đầu tiên
   đã đầy đủ, nên bố cục không bao giờ bị đo lúc màn hình chưa dựng.
2. Sau `ready`, các màn hình còn lại được nạp trước theo thứ tự ưu tiên.
3. Nếu vẫn chưa kịp, `ScreenHost` hiện khung xương thay vì khoảng trắng.

**Vì sao có thêm một cổng tiêm.** Lớp điều phối không được import component Svelte
(góc phần tư trách nhiệm vẫn giữ nguyên). `AppStore` khai báo `screenLoader` /
`screenPrefetcher`, và `main.ts` — điểm vào — cắm bản thật vào.

**Hệ quả đo được.** Gói JS chính 171,10 kB → **109,41 kB** (gzip 56,08 → **36,74 kB**);
CSS màn hình đầu tiên 32,94 kB → 15,03 kB + CSS riêng của màn hình. Bù lại, một lần mở
một màn hình mới tốn thêm một yêu cầu — vì vậy **toàn bộ** gói vẫn được service worker
precache, nên chế độ ngoại tuyến không đổi.

**Kiểm chứng.** `npm run audit:layout`: chỉ màn Thống kê đỏ, và đỏ vì thay đổi bố cục cố
ý của ADR-023 (`+72px`), không phải vì tách gói — mọi màn hình khác giữ nguyên 110 ảnh
chuẩn. Thêm test văn bản trong `tests/screen-reachability.test.ts` để một màn hình mới
quên bộ nạp sẽ đỏ ngay.

---

## ADR-025 — Giữ bảng tra `match` thay vì bảng dữ liệu cho việc bỏ dấu tiếng Việt

**Bối cảnh.** Bảng bỏ dấu có thể viết bằng `match c { … }` hoặc bằng mảng `(u32, char)`
tra tuyến tính. Trực giác đầu tiên là `match` trên ~140 mã điểm sẽ khiến LLVM dựng bảng
nhảy trải hết khoảng `U+00C0–U+1EF9`, nên bảng dữ liệu 152 mục được chọn trước.

**Quyết định.** Quay lại `match`. **Đo được:** WASM 254.905 B với bảng dữ liệu so với
253.993 B với `match` — LLVM dùng cây so sánh cho tập rời rạc, nên `match` nhỏ hơn 912 B
(~950 B tiết kiệm, khoảng 0,4% file WASM) và bỏ luôn 152 mục dữ liệu.

**Bài học được ghi lại.** "Trực giác về kích thước mã" không thay được phép đo; và một
phép đo rẻ (hai lần `npm run wasm`) đã đảo ngược quyết định. Bù lại, tính đầy đủ của
`match` không còn dựa vào mắt người: test phủ **mọi** nguyên âm với **mọi** dấu thanh.

---

## ADR-026 — "Danh mục học" chuyển về màn Học; phiên bốc ngẫu nhiên ba chủ đề

**Bối cảnh.** Trang chủ gánh hai vai cùng lúc: điểm vào việc học (thẻ tới hạn, bộ lọc
"Chưa thuộc") và nơi chọn bộ thẻ ("Danh mục học"). Yêu cầu là tối giản Trang chủ —
mọi lối vào việc học nằm một chỗ, ở màn Học. Đồng thời cần một lối học không phải chọn
bộ: bốc ngẫu nhiên từ cả ba chủ đề (Từ vựng + Mẫu câu + Kanji).

**Quyết định.**

1. Toàn bộ khối "Danh mục học" chuyển từ `Home.svelte` sang `Study.svelte`, chỉ hiện
   khi chưa bắt đầu phiên (`!started && !restoring`). Trang chủ còn lại hero thư viện,
   nút "Học N thẻ tới hạn", "Nội dung", "Bộ lọc Chưa thuộc".
2. Ba hàng chủ đề dùng chung `stats.byDeck` cho số thẻ/tới hạn: **Từ vựng** →
   `app.go('lessons')`, **Kanji** → `app.go('kanji')` (hai màn đã có), **Mẫu câu** →
   **đặt trạng thái tại chỗ** (`selectPatterns()`), KHÔNG `app.go('study', …)`: màn
   hình không đổi nên component không được dựng lại, yêu cầu mở bộ sẽ không có ai
   tiêu thụ. Cùng lúc xoá bộ lọc bài Minna — Mẫu câu không chia theo bài, giữ bộ lọc
   sẽ cho ra "0 thẻ" khó hiểu. Sau khi chọn, cuộn tới "Thiết lập phiên"
   (`scrollIntoView`, `behavior` tôn trọng `prefers-reduced-motion`).
3. **Học ngẫu nhiên.** Tập bốc = mọi thẻ có `deckId` thuộc danh mục
   (`isStudyCatalogDeck`: `vocabulary`, `patterns`, mọi deck chứa `kanji`), không phân
   biệt tới hạn. Số thẻ = `randomDrawSize = min(pool, dailyNewLimit)` — "số thẻ mới
   tối đa mỗi ngày" trong Cài đặt chính là "hôm nay bốc bao nhiêu thẻ". Trộn **một
   lần** bằng `sessionShuffle` (WASM) trên toàn bộ id rồi lấy N thẻ đầu: mọi tập con
   đều xác suất như nhau, chỉ một lần vượt biên. Phiên lưu `deckId: '*'`
   (`RANDOM_SESSION_DECK_ID`) + `focus: 'random'`; `normalizeSession` và
   `isValidSessionRecord` của backup chấp nhận giá trị này.
4. Vì hàng đợi trộn nhiều bộ nên **câu hỏi/đáp án và nhãn suy theo TỪNG thẻ**
   (`current.deckId`) — một phiên có thể lần lượt hỏi "Từ vựng · hỏi nghĩa",
   "Mẫu câu · hỏi nghĩa", "Kanji — Danh từ · hỏi chữ Nhật". Nút "Làm lại" và nút màn
   kết thúc ("Bốc phiên ngẫu nhiên mới") đều đi qua `start()`, nên nhánh
   `focus === 'random'` nằm trong `start()`, không nằm ở nút.
5. Nút ngẫu nhiên **vô hiệu kèm lý do** đúng nguyên nhân: danh mục rỗng, hay
   `dailyNewLimit < 1` (hai thông báo khác nhau, vì cách sửa khác nhau).

**Vì sao.** Điểm vào việc học nằm một chỗ làm Trang chủ ngắn hơn mà không mất lối vào
nào. Phiên ngẫu nhiên giữ nguyên mô hình "hàng đợi id + trạng thái khôi phục" của
ADR-015, nên tải lại giữa chừng vẫn tiếp tục đúng thẻ — không cần cơ chế lưu mới.

**Đánh đổi.** "Mẫu câu" dùng trạng thái cục bộ trong khi hai hàng còn lại đi qua
`requestedDeck` — hai cơ chế chọn bộ cùng tồn tại, cần biết để không "sửa" hàng Mẫu
câu thành `app.go`. Giới hạn "thẻ mới mỗi ngày" mang thêm nghĩa thứ hai (số thẻ bốc);
đây là chủ ý, nhưng là nghĩa **cộng thêm**, không thay thế nghĩa cũ.

**Kiểm chứng.** Test JS thuần cho `randomDrawSize`/`isStudyCatalogDeck` và vòng
lưu–khôi phục `focus: 'random'` (session + backup). Smoke trình duyệt trên bản dựng
production: bốc 20 thẻ ra **11 từ vựng + 4 mẫu câu + 5 kanji**, mỗi thẻ đúng nhãn chế
độ hỏi của bộ mình, tải lại giữa phiên khôi phục đúng `'*'`/`random`, "Làm lại" và
"Bốc phiên ngẫu nhiên mới" đều xáo tập mới. Chi tiết ở `docs/verification.md`.

---

## ADR-027 — Trình biên tập thẻ: tìm kiếm cục bộ, hai chế độ tách hẳn, danh sách → chi tiết

**Bối cảnh.** Trình biên tập cũ chọn thẻ bằng một `<select>` cuộn dài — 36 thẻ hôm nay,
hàng trăm tới hàng nghìn thẻ khi nội dung đầy đủ — và trộn việc tạo mới với việc sửa
trong cùng một biểu mẫu. Ngoài ra kiểm thử vòng này tìm ra một **lỗi thật**:
`store.saveCard` chỉ thay thế thẻ đã có trong `app.cards`, không thêm mới — thẻ vừa
tạo chỉ xuất hiện sau khi tải lại trang.

**Quyết định.**

1. **Hai chế độ tách hẳn.** Tab "Sửa thẻ đã có" (tìm kiếm + lọc bộ + danh sách kết quả
   → chi tiết) và tab "Tạo thẻ mới" (nháp riêng, giữ nguyên bộ sau khi tạo). Hai nháp
   `editDraft`/`createDraft` độc lập; `$effect` đồng bộ `editDraft` từ `selectedCard`
   nhưng **không** phụ thuộc `mode` — chuyển tab qua lại không nuốt chữ đang gõ.
2. **Tìm kiếm cục bộ.** `cardMatchesQuery` (JS thuần) là bản sao quy tắc `matches_query`
   của Rust, thay vì gọi `cardsFilter` mỗi phím gõ — nếu không, mỗi ký tự sẽ tuần tự
   hoá cả thư viện qua biên WASM. Kết quả xếp theo mặt trước (locale `vi`), cắt ở
   `RESULT_LIMIT = 200` kèm ghi chú "thu hẹp tìm kiếm" — không im lặng cắt bớt.
3. **Danh sách → chi tiết.** Mở editor không tự chọn thẻ nào; khi đang sửa, danh sách
   **ẩn hẳn** (không có vùng cuộn lồng trong màn) và có nút "Chọn thẻ khác" quay lại.
   Lý do trực tiếp: audit bố cục tại mọi khung nhìn tính nút không `elementFromPoint`
   tới được khi cuộn hết trang là lỗi — danh sách cuộn lồng làm 25 nút rơi vào trạng
   thái đó.
4. **Bài Minna bắt buộc 1–50 ở mọi bộ**, báo lỗi tại chỗ trước khi lưu. Không phải vì
   "bài học chỉ thuộc từ vựng": `backup.ts` từ chối `lesson` ngoài 1–50 khi khôi phục,
   nên cho nhập số ngoài khoảng sẽ tạo bản backup không khôi phục được.
5. **`saveCard` thành upsert**: chưa có id thì thêm vào `app.cards`, có rồi thì thay
   thế.

**Vì sao.** Tìm kiếm cục bộ giữ độ trễ mỗi phím gõ ở mức JS thường và không phụ thuộc
kích thước thư viện; master→detail là cách duy nhất giữ danh sách dài mà không tạo vùng
cuộn lồng. Upsert là sửa lỗi, không phải quyết định thiết kế — nhưng đáng ghi lại vì
triệu chứng ("thẻ mới không thấy cho tới khi tải lại") chỉ lộ ra khi smoke đúng thứ tự
tạo → tìm lại trong cùng phiên.

**Đánh đổi.** Quy tắc khớp tồn tại hai bản (Rust cho phiên học/filter, JS cho editor);
lệch nhau chỉ lộ ra qua test. Bù lại, `tests/card-search.test.ts` phản chiếu đúng bộ ca
của `search_matches_all_text_fields_and_tags` phía Rust, kèm ca riêng (dấu tiếng Việt,
romaji, tag).

**Kiểm chứng.** Smoke trình duyệt: tìm `cơm` → 1 kết quả, `gohan` (romaji) → đúng thẻ
đó; lọc "Kanji — Danh từ" → 6; sửa "Cơm" → lưu → IndexedDB đổi ngay; nhập bài 51 bị
chặn kèm "Bài Minna phải là số từ 1 đến 50."; tạo thẻ mới trong Mẫu câu → tìm thấy
**ngay** ở tab "Sửa thẻ đã có" không cần tải lại (upsert), tải lại vẫn còn; danh mục ở
màn Học đổi thành "Mẫu câu · 7 thẻ". Chi tiết ở `docs/verification.md`.

---

## ADR-028 — Thống kê chi tiết theo từng bài, phân cấp thẳng vào phiên học

**Bối cảnh.** Yêu cầu: thống kê phải cụ thể và chuẩn hơn, và từ màn Thống kê phải bấm
được vào từng bài học. Khảo sát tìm ra ba vấn đề thật: (1) hàng bài Minna đã gọi
`app.go('study', 'vocabulary', n)` nhưng 44/50 bài không có thẻ, nên phần lớn hàng dẫn
tới màn Học ở nút "Bộ này không còn thẻ tới hạn" — một ngõ cụt, và các hàng trông giống
hệt nhau vì không có tiến độ từng bài; (2) "yếu" chỉ có một con số, không tách được vì
sao yếu; (3) bộ do người học tự tạo vô hình vì giao diện lặp thuần theo
`content.bundles`. Số liệu cũng có thể cũ nếu người học thoát giữa phiên.

**Quyết định.** Mở rộng lõi theo hướng cộng thêm, không phá vỡ:

1. `DeckCount`/`DeckStats` thêm `weakRating`/`weakQuiz`, tách theo `srs_weak_reason`;
   thẻ yếu cả hai lý do xếp vào `weakRating`, nên `weakRating + weakQuiz == weak`.
2. `LessonInfo` mang đủ trường tiến độ như `DeckCount` (`new`, `learning`, `mature`,
   `weak`, `weakRating`, `weakQuiz`, `mastery`, `mastered`, `accuracy`, `graded`),
   giữ tên `count` thay vì đổi thành `total` để mã đã có không phải đổi.
   `lesson_summary` và `stats` dùng chung `Counters`, nên số theo bài không thể lệch
   khỏi toàn thư viện.
3. Giao diện KHÔNG tự đếm thẻ — mọi con số đọc từ `deckStats`/`lessonSummary`.
4. Màn Thống kê đi theo thứ bậc tổng quan → bộ thẻ → bài Minna: hàng có thẻ mở thẳng
   phiên học tương ứng, hàng không có thẻ bị vô hiệu kèm nhãn "Trống"/"Chưa có nội
   dung". Danh sách bài mặc định chỉ hiện bài có thẻ, kèm công tắc xem đủ 50.
5. Danh sách bộ là hợp của `content.bundles` và khoá `stats.byDeck` — bộ tự tạo hiện ra.
6. Mở màn gọi `refreshStats()` + `refreshLessons()` qua `$effect` để số liệu không cũ.

**Vì sao.** Từ chối đếm ở JS: quy tắc "thẻ thuộc nhóm nào" sống trong lõi (`srs.rs`),
đếm lại ở giao diện là tạo bản sao thứ hai của quy tắc đó — đúng loại lệch đã gặp
trước đây. Hàng bài trống bị vô hiệu thay vì bấm được là để màn Thống kê không dẫn
người học vào ngõ cụt; đây là bài học từ chính lần smoke của vòng này.

**Hệ quả.** Hợp đồng WASM cộng thêm trường (bản ghi cũ đọc được, không đổi schema lưu
trữ), kèm bất biến có test cho việc tách lý do yếu. Chuẩn bố cục màn `stats` được làm
mới — thay đổi cố ý. Gói `StatsDetail` lớn hơn: 6,60 kB → 11,16 kB JS, thêm 4,45 kB
CSS riêng vì màn viết lại nhiều khối hơn.

**Kiểm chứng.** `cargo test --workspace` **174 + 4**; `npm run test:js` **150/150**
(hợp đồng WASM có ca cho trường mới); `svelte-check` 0 lỗi/0 cảnh báo;
`npm run audit:layout` **0 vi phạm** sau khi làm mới chuẩn `stats` (lần chạy đầu 66 vi
phạm, tất cả ở `stats`). Smoke trên dev server: bấm "Bài 4" mở màn Học với "Lọc hiện
tại: Bài 4" và "Ôn thẻ tới hạn · 2 thẻ"; hàng trống vô hiệu; công tắc hiện đủ 50 bài;
quay lại về màn Thống kê. Chi tiết ở `docs/verification.md`.

---

## ADR-029 — Nâng cấp chuyển động: theo chiều điều hướng, viên nav trượt, số đếm, một chỗ quyết định reduced-motion

**Bối cảnh.** Yêu cầu: nâng cấp hoạt ảnh toàn diện. Khảo sát nguồn tìm ra bốn khoảng
trống thật: (1) chuyển màn luôn trượt cùng một hướng nên không phân biệt được "đi
tới" và "quay lại"; (2) tab điều hướng đổi trạng thái bằng hai lần bật/tắt (`::before`
ẩn/hiện), không đọc được như một chuyển động; (3) các màn không có nhịp vào, số liệu
thống kê nhảy khô, đổi thẻ không có tín hiệu; (4) câu hỏi reduced-motion bị trả lời
rải rác (chỉ màn Nhập/xuất tự hỏi `matchMedia`), và tuyên bố cũ trong design-system —
khối `@media` trong `app.css` phủ được transition của Svelte — **sai**: Svelte 5 chạy
transition bằng WAAPI, không chịu `animation-duration` của CSS.

**Quyết định.**

1. `src/ui/motion.ts` là chỗ DUY NHẤT trả lời "người dùng có yêu cầu giảm chuyển
   động không" và định tham số cho hiệu ứng JS: `reducedMotion`, `motionDuration`,
   `pageFly`, `noticeFly`, `staggerDelay` — dùng lại `prefersReducedMotion` của Svelte
   nên vẫn phản ứng khi cài đặt hệ điều hành đổi giữa chừng.
2. Store ghi `navDirection` cùng lượt cập nhật với `screen`; `pageFly` trượt lên khi
   đi tới, trượt xuống khi quay lại.
3. Viên nav trượt: MỘT `span.nav-pill` tuyệt đối (đứng trước các nút,
   `pointer-events: none`) thay cho `::before` của từng nút. Tọa độ đo từ nút thật
   bằng `getBoundingClientRect` (giá trị thập phân) trừ `clientLeft/clientTop`;
   `ResizeObserver` đo lại khi vùng đổi kích thước; chỉ `animate()` khi ĐỔI tab —
   không chạy ở lần đo đầu hay lần đo lại.
4. `AnimatedNumber` đếm lên khi giá trị đổi; lần dựng đầu hiện NGAY giá trị cuối —
   vòng đếm rAF không nhìn thấy được từ `settle()` của `audit:layout` và sẽ làm lệch
   ảnh chuẩn.
5. Màn Học: đổi thẻ có `stage-swap` (gỡ/gắn class qua `offsetWidth`, bỏ qua lần dựng
   đầu), nút chấm điểm so le 45ms, nội dung mặt đáp án hiện dần 140–320ms với
   `backwards`; danh sách ở Bài học và biên tập thẻ so le qua `staggerDelay`.
6. Reduced motion: khối chung trong `app.css` thêm `animation-delay: 0ms !important`
   (dàn so le dùng `backwards` — giữ độ trễ nghĩa là nội dung còn đứng ẩn hết dải so
   le); hiệu ứng JS trả `duration: 0` qua `motion.ts`; quy tắc cục bộ trùng ở Study
   được bỏ.

**Vì sao.** Không thêm dependency và không đổi bút tích thị giác: mọi thay đổi chỉ
chạm chuyển động, nên bộ chuẩn bố cục CŨ được giữ nguyên làm bằng chứng máy móc —
nếu thay đổi lấn sang màu/kích thước/cấu trúc hiển thị, `audit:layout` đỏ ngay. Viên
nav đặt bằng tọa độ đo từ nút thật thay vì phần trăm CSS thuần vì bốn tab chia 366px
ra số thập phân — đặt bằng phần trăm lệch dưới một pixel và chuẩn cũ sẽ đỏ. Độ trễ về
0 dưới reduced-motion vì "nội dung chờ rồi bật theo lớp" vẫn là chuyển động, chỉ đổi
hình thức — đúng thứ người dùng yêu cầu giảm.

**Hệ quả.** Chuẩn bố cục và 110 ảnh chụp không phải làm mới: 0 vi phạm ngay. Index JS
111,22 kB (gzip 37,64), index CSS 14,87 kB (gzip 4,01), precache 33 mục / 496,93 KiB.
Ràng buộc mới cho các vòng sau: KHÔNG thêm/bớt/đổi thứ tự con trực tiếp của
`main.screen` hay chèn class trước class đầu tiên — bộ kiểm bố cục đánh khoá theo chỉ
số + class đầu. `AnimatedNumber`/`staggerDelay` không chạy vòng đếm ở lần dựng đầu nên
ảnh chuẩn không bao giờ bắt được trạng thái trung gian.

**Kiểm chứng.** `svelte-check` 0 lỗi/0 cảnh báo; `npm run test:js` **150/150**;
`npx vite build` xanh; `npm run audit:layout` **0 vi phạm** so với chuẩn CŨ (220 phép
đo, 90 bước cử chỉ, 110 ảnh hình học, 110 ảnh màn hình, Chrome/155.0.8059.39). Kịch
bản CDP hai chiều (Chrome headless + `Emulation.setEmulatedMedia`): `reduce` 10/10 —
không hiệu ứng WAAPI nào được tạo, `stage-swap` không xuất hiện, độ trễ mặt đáp
án/nút chấm về 0, `AnimatedNumber` nhảy thẳng 36→32 không khung trung gian; đối chứng
không giảm 11/11 — `.page` 260ms, viên nav 300ms, dải mặt đáp án 140–320ms, số đếm có
khung trung gian 36→35→34→33→32. Chi tiết ở `docs/verification.md`.

---

## ADR-030 — Mỗi mục điều hướng sở hữu một vùng chức năng; mỗi chức năng chỉ có MỘT lối vào

**Bối cảnh.** Yêu cầu: mỗi vị trí chỉ làm một việc, và bốn mục Trang chủ · Học ·
Nhập/xuất · Cài đặt phải có chức năng riêng — mở mục khác không gặp lại chức năng
đó. Khảo sát lối vào tìm ra các chỗ trùng thật: bắt đầu phiên học có mặt ở Trang
chủ (hero + thẻ "Bộ lọc Chưa thuộc"), màn Học (ô "Bộ thẻ" + dãy "Bài Minna"), từng
hàng màn Bài học, từng nhóm Kanji VÀ từng hàng màn Thống kê — năm đường cho cùng
một việc; cảnh báo đồng bộ nội dung có nút "thử lại" ở cả Trang chủ lẫn Cài đặt;
`navigationSection` cũ xếp màn con nào cũng về Trang chủ nên mở Bài học hay Kanji
thì tab dưới vẫn sáng "Trang chủ".

**Quyết định.**

1. `SECTION_OF: Record<Screen, Section>` trong `src/app/screen.ts` thay hàm ánh xạ
   cũ: Thống kê → Trang chủ; Bài học, Kanji và bảy màn Kanji con → Học; Trình biên
   tập → Cài đặt. Ràng buộc kiểu `Record` buộc màn hình mới phải được xếp mục ngay
   khi thêm vào `SCREENS` — quên là lỗi biên dịch, không âm thầm rơi về Trang chủ.
2. `backFallback` trả về mục sở hữu màn con (trước đây luôn về Trang chủ); tab gốc
   vẫn về Trang chủ, riêng Trang chủ trả `null` để nền tảng xử lý.
3. Trang chủ thành bảng tình trạng thư viện thuần: ba số liệu, dòng tóm tắt, nút
   "Thống kê chi tiết" (bản mở rộng của chính nó) và cảnh báo bản ghi cứu hộ. Gỡ
   hero bắt đầu phiên học, thẻ "Bộ lọc Chưa thuộc", thẻ "Nội dung" và cảnh báo đồng
   bộ — không còn lối tắt sang chức năng của mục khác.
4. Màn Học là nơi duy nhất bắt đầu phiên. "Danh mục học" là nơi duy nhất đổi mục
   tiêu (Từ vựng → màn Bài học, Kanji → màn chọn nhóm, Mẫu câu chọn tại chỗ); hàng
   đang nhắm có nhãn "Đang chọn", và "Thiết lập phiên" chỉ còn cấu hình CÁCH học —
   ô "Bộ thẻ" và dãy "Bài Minna" bị gỡ vì chúng là lối vào thứ hai của cùng việc.
5. Màn Bài học thêm hàng đầu "Học toàn bộ từ vựng" (mục tiêu ngang hàng với từng
   bài), nên bỏ ô "Bộ thẻ" không làm mất lối vào cả bộ Từ vựng.
6. Màn Thống kê thành CHỈ ĐỌC: hàng là văn bản, hết nút/hover/chevron; đảo ngược
   riêng điểm 4 của ADR-028. Việc bắt đầu phiên học thuộc trọn về Học.
7. Cảnh báo đồng bộ nội dung và nút "thử lại" chỉ còn ở Cài đặt → "Cập nhật → Nội
   dung"; Trang chủ không còn đọc `contentSyncError`.

**Vì sao.** "Chức năng sống ở hai nơi" chính là vấn đề gốc người dùng gặp: cùng một
việc có nhiều đường vào, mỗi đường một hình dạng, nên không đường nào là "đúng".
Màn Thống kê là ví dụ rõ nhất: ADR-028 biến nó thành lối vào phiên học, và để tránh
ngõ cụt thì phải vô hiệu hoá hàng trống — nhưng cách đúng không phải là thêm trạng
thái vô hiệu cho một màn đọc số, mà là màn đọc số chỉ đọc số. Tương tự, việc đánh
dấu tab dưới không thể giao cho từng màn hình tự khai ("màn này sáng tab nào") — nó
là MỘT ánh xạ đặt cạnh định nghĩa `SCREENS`, có ràng buộc kiểu, nên không thể lệch.

**Hệ quả.** `SCREENS` không đổi nên bản lưu màn hình cũ đọc được; không đổi lõi
Rust, không đổi schema lưu trữ. Chuẩn bố cục hình học và 110 ảnh chụp được làm mới
cho các màn đổi bố cục có chủ ý (trang chủ, thiết lập phiên, bài học, thống kê,
kanji, editor — tab dưới của màn con nay nằm dưới Học/Cài đặt). Build: index JS
111,32 kB (37,66 kB gzip), index CSS 14,87 kB (4,03 kB gzip), precache 34 mục /
492,77 KiB; `Study` 19,62 kB (7,30 kB gzip), `StatsDetail` 10,68 kB (3,68 kB gzip),
`Lessons` 3,56 kB (1,73 kB gzip). Ràng buộc cho các vòng sau: màn hình mới phải
được xếp mục trong `SECTION_OF`, và chức năng mới phải chọn ĐÚNG một mục điều hướng
sở hữu nó.

**Kiểm chứng.** `svelte-check` 0 lỗi/0 cảnh báo; `npm run test:js` **151/151** (ca
ánh xạ mục được viết lại, ca Back tách đôi theo mục sở hữu); `cargo test --workspace`
**174 + 4** (không đụng mã Rust); `npm run build` xanh; `npm run audit:layout` **0
vi phạm** sau khi làm mới chuẩn hình học và 110 ảnh chụp (lần chạy làm mới đầu tiên
40 vi phạm pixel-drift, tất cả ở các màn đổi bố cục có chủ ý); smoke CDP **26/26**
phép kiểm trên bản dựng production (`vite preview`), console sạch. Chi tiết ở
`docs/verification.md`.

---

## ADR-031 — Thống kê chi tiết: hai mục theo chủ đề Kanji và Mẫu câu

**Bối cảnh.** Màn Thống kê chi tiết có ba mục — Tổng quan, Theo bộ thẻ, Bài Minna —
trong khi việc học có ba chủ đề ngang hàng ở "Danh mục học" (Từ vựng · Kanji · Mẫu
câu). "Bài Minna" là góc nhìn theo bài của Từ vựng, còn tiến độ Kanji theo từng nhóm
và tiến độ Mẫu câu chỉ thấy được qua con số gộp trong "Theo bộ thẻ". Yêu cầu: thêm
hai mục dưới "Bài Minna" là Kanji và Mẫu câu.

**Quyết định.**

1. Màn `stats` có thêm hai mục cuối, đúng thứ tự yêu cầu và đúng thứ tự chủ đề của
   "Danh mục học": **Kanji** — đủ bảy nhóm từ `KANJI_CATEGORIES` (danh mục CỐ ĐỊNH
   của giáo trình, như 50 bài), tag "{n}/7 nhóm có nội dung"; **Mẫu câu** — bộ
   `patterns` duy nhất, tag "{total} thẻ".
2. Ba danh sách (bộ thẻ, Kanji, Mẫu câu) dùng CHUNG một snippet hàng (`deckItem`):
   cùng khuôn "Theo bộ thẻ" (số thẻ · đã học, pill "% thành thạo"/"Trống", thanh cơ
   cấu, dòng chi tiết). Nhãn Kanji lấy từ danh mục (`Danh từ`…), không lấy tên bộ
   (`Kanji — Danh từ`), để hàng đọc ngay trong ngữ cảnh mục Kanji.
3. Vẫn là màn CHỈ ĐỌC như ADR-030: không nút, không hover, không chevron.
4. Không đổi lõi Rust, schema lưu trữ hay dependency — chỉ giao diện và lớp JS.

**Vì sao.** Thứ bậc màn Thống kê nay khớp thứ bậc việc học: tổng quan → bộ thẻ (kiểm
kê ĐẦY ĐỦ, kể cả bộ tự tạo và bộ chưa có thẻ) → ba góc nhìn chủ đề. Kanji hiện đủ
bảy hàng kể cả nhóm trống vì bỏ sót nhóm nào cũng khiến danh sách trông như lỗi —
nhưng hàng trống bị làm mờ để mắt bỏ qua, đúng cách màn Bài Minna xử lý. Con số
trùng với hàng tương ứng trong "Theo bộ thẻ" là chủ ý: cả hai đọc chung một
`deckStats`, nên "trùng" không phải hai nguồn đếm. Tách riêng "Theo bộ thẻ" thành
các chủ đề sẽ che mất bộ tự tạo hoặc bộ không thuộc chủ đề nào. Dùng chung một
snippet vì ba bản chép tay của cùng một khuôn hàng sẽ lệch nhau ở lần sửa đầu tiên
(thanh cơ cấu, nhãn "Trống", dòng chi tiết).

**Hệ quả.** `StatsDetail` 10,68 → **11,72 kB** (3,68 → 4,03 kB gzip); index JS
111,32 kB (37,66 kB gzip) không đổi; index CSS 14,87 kB (gzip 4,01); precache 34 mục
/ 492,77 → **493,79 KiB**; gói dùng chung `content-sections` 1,17 kB (0,53 kB gzip) mà
StatsDetail nay cũng đọc — ảnh hưởng không đáng kể vì mọi gói màn hình đều được nạp
trước sau khi ứng dụng sẵn sàng. Chuẩn hình học và ảnh chụp của riêng `stats` (10
trạng thái) được làm mới có chủ ý; các màn khác không đụng. Ràng buộc cho các vòng
sau: thêm/bớt/đổi thứ tự con trực tiếp của `main.screen` ở màn Thống kê là thay đổi
chuẩn bố cục `stats`.

**Kiểm chứng.** `svelte-check` 0 lỗi/0 cảnh báo; `npm run test:js` **151/151** (không
đụng logic đếm — vòng này chỉ ở component); `cargo test --workspace` **174 + 4**
(không đụng mã Rust); `npm run build` xanh; `npm run audit:layout` lần đầu (đo riêng
`stats`) **58 vi phạm, tất cả ở `stats`** và tất cả từ thay đổi cố ý (hai mục mới
cộng phụ đề dài thêm một dòng ở khổ hẹp), sau khi làm mới chuẩn + ảnh chụp cho riêng
`stats` thì **0 vi phạm** trên bộ đầy đủ (10 khung nhìn × 11 trạng thái × 2 vị trí =
220 phép đo, 90 bước cử chỉ, 110 ảnh hình học, 110 ảnh màn hình;
Chrome/155.0.8059.39). Xác nhận trên bản dựng production: năm mục đúng thứ tự, Kanji
7 hàng / tag "1/7 nhóm có nội dung", Mẫu câu 1 hàng / "6 thẻ", hàng nhóm trống hiện
"Trống" + "Nhóm chưa có thẻ nào" và bị làm mờ; console sạch. Chi tiết ở
`docs/verification.md`.

---

## ADR-032 — Hiệu ứng trượt cho thanh chọn loại cập nhật; "Theo bộ thẻ" về Trang chủ

**Bối cảnh.** Hai thay đổi độc lập gộp một vòng, đều chỉ ở giao diện và lớp JS.
(1) Thanh chọn "Ứng dụng / Nội dung" trong Cài đặt → Cập nhật đổi khối nội dung
tại chỗ, không có chuyển cảnh — trong khi thanh chọn tương đương ở màn Nhập/xuất
trượt theo chiều. (2) Sau ADR-030, Trang chủ cố ý chỉ còn bảng tình trạng nên
trống trải; "Theo bộ thẻ" — danh sách đầy đủ mọi bộ trong thư viện — là bản chi
tiết tự nhiên của dòng "N thẻ trong thư viện" và đứng ở Trang chủ hợp hơn là nằm
sâu trong Thống kê chi tiết.

**Quyết định.**

1. Khối nội dung của thẻ Cập nhật dựng lại theo `{#key updateScope}` và trượt vào
   bằng `fly` theo CHIỀU của mục vừa rời đi (±14px, 200ms qua `motionDuration`) —
   cùng khuôn thanh chọn chủ đề ở màn Nhập/xuất. Chỉ dùng `in:`, không dùng
   `out:`: khối cũ biến mất ngay nên hai khối không bao giờ cùng nằm trong luồng
   bố cục và trang không nhảy. Chiều trượt lấy từ vị trí trên thanh chọn
   (`SCOPE_ORDER`), không từ thứ tự bấm.
   **(Đã bị ADR-036 thay: thanh chọn này không còn — hai loại cập nhật là hai
   khối cạnh nhau.)** Kỹ thuật trượt theo chiều vẫn còn nguyên giá trị cho thanh
   chọn chủ đề ở màn Nhập/xuất và cho chuyển trang.
2. "Theo bộ thẻ" CHUYỂN (không nhân bản) từ Thống kê chi tiết ra Trang chủ: danh
   sách ĐẦY ĐỦ mọi bộ trong thư viện — kể cả bộ tự tạo, kể cả bộ chưa có thẻ —
   kèm thanh cơ cấu và pill "% thành thạo"; vẫn CHỈ ĐỌC. Màn Thống kê còn **Tổng
   quan → Bài Minna → Kanji → Mẫu câu**.
3. Ba bản chép tay của cùng khuôn hàng gộp thành một bộ dùng chung:
   `DeckRow.svelte` + `StructureBar.svelte` + `deck-rows.ts` — Trang chủ và hai
   mục chủ đề Kanji / Mẫu câu của Thống kê chi tiết cùng đọc.
4. Không đổi lõi Rust, schema lưu trữ hay dependency.

**Vì sao.** Hiệu ứng phải theo chiều thì chuyển mục mới đọc ra hướng, đúng ngữ
nghĩa như `pageFly` của chuyển trang và thanh chọn chủ đề; đổi tại chỗ khiến hai
mục như hai khối tĩnh không liên quan. `in:`-only là cách mọi chuyển cảnh trong
ứng dụng tránh hai khối cùng chiếm luồng bố cục gây nhảy trang, và
`motionDuration` là một chỗ quyết định thời lượng theo `prefers-reduced-motion`
(ADR-029). Về vị trí mục kiểm kê: ADR-030 gỡ lối tắt CHỨC NĂNG khỏi Trang chủ,
không gỡ thông tin — "Theo bộ thẻ" là phần mở rộng của chính bảng tình trạng,
trong khi Thống kê chi tiết vẫn giữ đủ ba góc nhìn chủ đề (Bài Minna, Kanji, Mẫu
câu). Chuyển chứ không nhân bản, và dùng chung một component hàng, vì hai bản sao
của cùng khuôn sẽ lệch nhau ở lần sửa đầu tiên (cùng lý do ADR-031).

**Hệ quả.** `StatsDetail` 11,72 → **8,60 kB** (4,03 → 3,22 kB gzip) vì mục "Theo
bộ thẻ" và khuôn hàng của nó dời sang gói dùng chung `DeckRow` 4,89 kB (2,22 kB
gzip, kèm CSS riêng 1,43 kB); `Home` **2,88 kB** (1,45 kB gzip); `Settings`
**11,54 kB** (4,22 kB gzip); index JS 111,32 → 111,36 kB (37,66 → 37,68 kB gzip);
precache 34 mục / 493,79 → **35 mục / 495,29 KiB**. Chuẩn hình học và ảnh chụp
của riêng `home` + `stats` (20 trạng thái) được làm mới có chủ ý; `settings` so
riêng **0 vi phạm** nên không đụng chuẩn — hiệu ứng chuyển mục là chuyển động lúc
chạy, không đổi bố cục lúc nghỉ. Ràng buộc cho các vòng sau: thêm/bớt/đổi thứ tự
con trực tiếp của `main.screen` ở màn Thống kê hoặc Trang chủ là thay đổi chuẩn
bố cục `stats`/`home` tương ứng.

**Kiểm chứng.** `svelte-check` 0 lỗi/0 cảnh báo; `npm run test:js` **151/151**
(không đụng logic — vòng này chỉ ở component và tách snippet); `cargo test
--workspace` **174 + 4** (không đụng mã Rust); `npm run build` xanh;
`npm run audit:layout` **0 vi phạm** — đo riêng `settings` trước (20 phép đo, 10
trạng thái hình học, 10 ảnh) rồi làm mới chuẩn + ảnh cho `home` + `stats` (20
trạng thái), sau đó chạy đầy đủ: 220 phép đo bố cục, 90 bước cử chỉ, 110 ảnh
hình học, 110 ảnh màn hình, `baseline: compared`, `shotsBaseline: compared`,
Chrome/155.0.8059.39. Xác nhận trên bản dựng production: app→content trượt vào từ
`+14px` / content→app từ `−14px`, mỗi chiều 200ms; `prefers-reduced-motion:
reduce` → 0 animation; Trang chủ có 3 hàng bộ thẻ (Từ vựng / Mẫu câu / Kanji —
Danh từ) kèm thanh cơ cấu + pill, Thống kê chi tiết còn đúng bốn mục và không
còn "Theo bộ thẻ"; console sạch. Chi tiết ở `docs/verification.md`.

---

## ADR-033 — Học theo bốn tầng: danh mục → Collection theo phạm vi → phiên; phạm vi chọn là trạng thái bền vững

**Bối cảnh.** Sau ADR-030, màn Học gánh ba việc trên cùng một màn: duyệt danh mục,
đổi mục tiêu (bài Minna / nhóm Kanji / bộ), và thiết lập phiên. "Đang chọn nội dung"
và "đang cấu hình phiên" trộn vào nhau; bấm một bài có thể bắt đầu phiên ngay hoặc
chỉ đổi lựa chọn, người học không biết trước. Yêu cầu: tách bốn tầng — Học (danh
mục) → danh sách (50 bài / bảy nhóm) → Collection biết CHÍNH XÁC phạm vi của nó →
phiên học dùng ĐÚNG tập thẻ đã chọn; mở Collection phải KHÁC với bắt đầu phiên.

**Quyết định.**

1. Đồ thị màn hình: `home`; `study` (chỉ danh mục ba chủ đề); `lessons` (50 bài);
   `kanji` (bảy nhóm); Mẫu câu (một bộ duy nhất) đi thẳng vào Collection;
   `collection` (tầng 3); `session` (tầng 4); `stats`, `editor`, `transfer`,
   `settings`. Bảy màn `kanji-*` bị gỡ — bảy nhóm dùng chung màn Collection;
   `normalizeScreen` ánh xạ tên màn cũ về `kanji` nên bản lưu cũ không mở ra màn
   hình trắng. `SECTION_OF` giữ nguyên bốn mục; `collection` và `session` thuộc Học.
2. Phạm vi Collection là trạng thái ĐIỀU HƯỚNG bền vững: `CollectionScope =
   {kind:'all'} | {kind:'deck',deckId} | {kind:'lesson',deckId,lesson}` (module lá
   `src/app/collection.ts`, có chuẩn hoá thuần cho dữ liệu từ đĩa). `app.collectionScope`
   được lưu xuống IndexedDB (`meta`) và khôi phục lúc boot — Back từ phiên học hay
   tải lại trang vẫn đứng đúng phạm vi. Cửa vào DUY NHẤT: `app.goCollection(scope,
   {focus?, mode?})` — đặt phạm vi, ghi nhớ cấu hình gần nhất, rồi `go('collection')`.
3. Mở Collection không tự chạy phiên. Phiên chỉ chạy khi bấm Bắt đầu:
   `app.startSession(request)` đặt yêu cầu MỘT LẦN rồi `go('session')`; tầng Session
   tiêu thụ bằng `takeRequestedSession()` — không để giá trị cũ ám sang lần mở sau.
4. Một nguồn dựng bộ lọc: `sessionFilter(request, dailyNewLimit)` trong
   `src/app/session-plan.ts`. Collection xem trước ("Sẽ học") và con số trên nút Bắt
   đầu đi qua ĐÚNG hàm này + `cardsFilter` của lõi, nên nút không thể ghi "12 thẻ"
   rồi phiên chạy 9 thẻ. Phạm vi `all` cố ý không truyền `deckIds` (toàn thư viện,
   kể cả bộ tự tạo); `newLimit` chỉ áp cho `focus: 'due'`; `random` chỉ có nghĩa ở
   phạm vi `all` và bốc từ danh mục ba chủ đề (`catalogCards`).
5. Quy tắc khôi phục đổi: phiên dở chỉ được NHẬN khi khớp cấu hình vừa yêu cầu
   (phạm vi / chế độ / focus — với phạm vi `all`, `deckId` lưu là hằng số
   `MULTI_DECK_SESSION_ID` `'*'`); khác thì dứt khoát bỏ phiên cũ, báo rõ cho người
   học, và dựng hàng đợi mới. Trước đây mọi cấu hình đều nhận phiên cũ nếu còn hạn.
6. Backup cá nhân mang `collectionScope` như trường TÙY CHỌN: có tiến độ thì ghi,
   bản cũ thiếu trường đọc được (rơi về mặc định), bản không có tiến độ thì không
   ghi. Không đổi lõi Rust, không đổi schema IndexedDB (khoá mới trong store `meta`
   là trường cộng thêm, không phải version mới).

**Vì sao.** Ba tầng cũ dồn vào một màn nên không có chỗ nào trả lời "tôi đang chọn
gì" tách khỏi "tôi sắp học gì". Phạm vi là trạng thái ĐIỀU HƯỚNG chứ không phải cấu
hình phiên: nó phải sống sót qua mỗi lần dựng lại component (Back từ phiên, tải lại
trang), nếu không tiêu đề/thống kê/bộ lọc lệch khỏi thứ vừa chọn — đúng lớp lỗi
"màn hình nói Bài 15 nhưng hàng đợi là Bài 3" mà yêu cầu nêu tên. Bốn dạng màn hình
riêng cho 50 bài + 7 nhóm là 57 màn hình chép tay, mỗi lần sửa lệch một bản; một
component + ba dạng phạm vi thì không có gì để lệch. Yêu cầu một lần
(`takeRequestedSession`) vì `requestedDeckId` cũ từng để lại giá trị cũ ám vào lần
mở sau — bài học đã trả giá một lần, không lặp lại.

**Hệ quả.** `src/app/collection.ts`, `session-plan.ts` tách thành module lá dùng
chung cho store, storage, UI; bảy màn `kanji-*` biến mất khỏi `SCREENS` và
PREFETCH. Gói màn hình mới: `Session` 14,43 kB, `Collection` 12,84 kB (mỗi màn vẫn
một gói riêng, offline không đổi vì tất cả được precache). Chuẩn bố cục và ảnh chụp
làm mới toàn bộ theo bộ trạng thái mới — 15 trạng thái thay 11 (thêm bốn Collection,
hai phiên học, hai Trang chủ; bỏ bốn trạng thái Học cũ và `kanji-category`); script
audit nay DỌN mục cũ khi chạy đầy đủ (không lọc khung nhìn/trạng thái) thay vì chỉ
gộp, vì mục của màn hình đã gỡ không có lần chạy nào chạm tới nữa. Ràng buộc cho
các vòng sau: màn `collection` chỉ đọc `app.collectionScope`, không nhận phạm vi
qua prop/URL; phiên chỉ vào hàng đợi qua `sessionFilter` (+ `sessionShuffle` cho
random).

**Kiểm chứng.** `svelte-check` 0 lỗi/0 cảnh báo; `npm run test:js` **153/153**
(ca `normalizeScreen` cho tên màn cũ, ca `backFallback` của hai màn mới, ca backup
mang `collectionScope`); `cargo test --workspace` **174 + 4** (không đụng mã Rust);
`npm run build` xanh; `npm run audit:layout` **0 vi phạm** sau khi làm mới toàn bộ
chuẩn bố cục + 150 ảnh chụp theo bộ trạng thái mới (10 khung nhìn × 15 trạng thái ×
2 vị trí = 300 phép đo, 90 bước cử chỉ, `baseline: compared`, `shotsBaseline:
compared`). Chi tiết ở `docs/verification.md`.

---

## ADR-034 — Trang chủ ưu tiên hành động: một trạng thái một hành động; "Bộ khác" bấm mở Collection

**Bối cảnh.** Trang chủ sau ADR-030/032 là bảng tình trạng: ba số liệu, dòng tóm
tắt, "Theo bộ thẻ" chỉ đọc. Yêu cầu vòng này: Trang chủ trả lời "học gì tiếp theo"
TRƯỚC khi hiện số liệu; thứ tự ưu tiên rõ ràng (phiên dở → tới hạn → thẻ mới →
chưa thuộc → đã xong); không số liệu trùng lặp; chỉ số liệu THẬT; hoạt động cả khi
thư viện trống, khi ít bộ, lẫn khi hàng nghìn thẻ. "Theo bộ thẻ" cũ chỉ liệt kê
được, không mở được gì — trong khi bộ tự tạo không có lối vào nào khác.

**Quyết định.**

1. Hero là MỘT trạng thái chọn theo đúng thứ tự: (a) phiên đang dở — hàng đợi thật
   từ `app.openSession`, nút "Tiếp tục phiên học"; (b) thư viện trống — hướng dẫn
   Nhập dữ liệu / Cài đặt; (c) `due − new > 0` — "Ôn thẻ tới hạn" (thẻ mới nằm
   trong `due` của lõi nên phải trừ, nếu không cùng thẻ bị đếm hai lần); (d)
   `new > 0` — "Học thẻ mới"; (e) `weak > 0` — "Củng cố thẻ chưa thuộc"; (f) đã ôn
   hết — "Học ngẫu nhiên" khi còn bốc được, không thì "Chọn nội dung để học". Mỗi
   trạng thái ĐÚNG một nút chính, cộng tối đa một đường phụ về màn Học.
2. Ba chủ đề dùng CHUNG `StudyCategories.svelte` với màn Học — cùng con số, cùng
   cách tính phần trăm đã học, một nguồn `deckStats`. Trang chủ không có bản sao.
   `showAll` (màn Học) thêm hàng "Tất cả nội dung".
3. Thẻ Thư viện giữ đúng chức năng cũ (số gộp, thanh thành thạo trung bình, nút
   Thống kê chi tiết, nút Tất cả nội dung, cảnh báo bản ghi cứu hộ + nút cứu hộ) —
   nhưng đứng SAU danh mục vì là thông tin tham khảo, không phải việc cần làm.
4. "Bộ khác": bộ KHÔNG thuộc ba chủ đề (tự tạo/nhập), hàng bấm mở thẳng Collection
   của bộ (`goCollection`). Đây là thay đổi có chủ ý so với quy tắc "hàng bộ thẻ
   chỉ đọc" của ADR-032: hàng chỉ đọc trước đây để tránh lối vào THỨ HAI của việc
   BẮT ĐẦU phiên; "mở Collection" là chức năng khác (xem/cấu hình, có bước Bắt đầu
   riêng), nên vẫn đúng tinh thần ADR-030 — bắt đầu phiên vẫn chỉ có một đường.
   Bộ thuộc ba chủ đề không lặp ở đây: chúng sống ở "Danh mục học".
5. Không tiến độ giả: % chỉ hiện khi suy được từ dữ liệu thật (`mastery`, đếm
   chưa học/đang học/nhớ lâu); không thanh tiến độ cho thứ chưa đo được; thư viện
   lớn vẫn gọn vì danh sách là theo BỘ, không theo thẻ.

**Vì sao.** Người mở app cần biết PHẢI LÀM GÌ, không cần đọc bảng số. Thứ tự trên
là thứ tự mất mát thông tin: bỏ dở phiên đang có là mất nhiều nhất, rồi đến thẻ đã
đến hạn (ôn là điều kiện giữ trí nhớ), rồi thẻ mới, rồi củng cố. Cùng thứ tự này
được dùng lại ở trạng thái rỗng từng tầng (Collection không có thẻ → nói VÌ SAO và
gợi ý bước tiếp), nên không có màn nào là ngõ cụt. "Bộ khác" tách khỏi danh mục vì
bộ tự tạo không thuộc giáo trình — trộn chúng vào hàng chủ đề sẽ bịa ra một cấu
trúc không tồn tại.

**Hệ quả.** `Home.svelte` **9,32 kB** (một gói màn hình riêng); hàng bộ dùng chung
`DeckRow` (biến thể `onOpen` → nút có chevron, hover, `:active` nhún) nên bản chỉ
đọc ở Thống kê không đổi. Bộ dữ liệu mẫu không có: mọi nhánh hero đều kiểm chứng
được bằng thư viện hiện tại (36 thẻ seed — nhánh tới hạn/thẻ mới; xoá hết dữ liệu —
nhánh trống; chấm một phiên xong — nhánh đã ôn hết). Ràng buộc cho các vòng sau:
mọi khối mới của Trang chủ nằm SAU hero và là con trực tiếp của `main.screen` (thêm
khối là thay đổi chuẩn bố cục `home`); nhánh hero mới phải giữ đúng một hành động
chính; thêm bộ vào danh mục học phải cập nhật `content-sections.ts` chứ không thêm
hàng tay ở Home.

**Kiểm chứng.** `svelte-check` 0 lỗi/0 cảnh báo; `npm run test:js` **153/153**
(ca `hasDirectEntry` cho `goCollection`/`startSession` — Trang chủ và màn Học
không tự gọi `cardsFilter` để "đếm trước" theo cách riêng); `cargo test
--workspace` **174 + 4**; `npm run build` xanh; `npm run audit:layout`
**0 vi phạm** sau khi làm mới chuẩn hai trạng thái Trang chủ lẫn toàn bộ 150 ảnh
chụp (300 phép đo bố cục, 90 bước cử chỉ, `baseline: compared`, `shotsBaseline:
compared`). Chi tiết ở `docs/verification.md`.

---

## ADR-035 — Màn Nhập/xuất chia theo TÁC VỤ, một bộ chọn phạm vi, và kiểm tra trước khi ghi

**Bối cảnh.** Màn Nhập/xuất gộp bốn khối vào một cột: chọn phạm vi, nhập thẻ, xuất
thẻ, backup. Trên điện thoại trang cao 1.372px (390×844) và 1.494px (320×568): muốn
nhập một file, người dùng phải cuộn qua biểu mẫu xuất và hai nút backup — ba việc
không bao giờ làm cùng lúc. Khung kéo thả cao 141px chiếm chỗ dù trên điện thoại thao
tác thật là CHỌN FILE; dòng hướng dẫn `front,back,furigana,romaji,lesson` luôn hiện;
và không có bước nào nói trước "file này sẽ thêm bao nhiêu thẻ, bỏ qua bao nhiêu" —
người dùng chỉ biết sau khi đã ghi. Backup cũng nằm chung nhịp với xuất thẻ, dù hai
việc khác hẳn nhau về hệ quả (file bộ thẻ không mang tiến độ; backup thay cả thư viện).

**Quyết định.**

1. Ba TÁC VỤ — Nhập · Xuất · Sao lưu — trên một thanh chọn ở đầu màn; mỗi lúc chỉ một
   tác vụ hiện. Đây là bậc chọn VIỆC, đứng trên bậc chọn PHẠM VI.
2. MỘT bộ chọn phạm vi (`TransferScope.svelte`) dùng cho cả Nhập lẫn Xuất; trạng thái
   phạm vi sống ở màn hình cha nên đổi tác vụ không làm mất lựa chọn. Cử chỉ vuốt ngang
   thuộc về bộ chọn đó ở cả hai tác vụ.
3. Đổi tác vụ KHÔNG xoá file đang chờ kiểm tra; thẻ Nhập mang dấu chấm và
   `aria-label` khi còn file. Đổi PHẠM VI thì file được kiểm tra LẠI bằng chính nội dung
   đã đọc — vì con số "sẽ thêm bao nhiêu thẻ" phụ thuộc phạm vi, và một con số cũ cạnh
   phạm vi mới là thông tin sai. Mọi lần kiểm tra mang một token; kết quả về muộn bị bỏ.
4. Nhập có bước KIỂM TRA trước khi ghi: đọc file → lập kế hoạch nhập → hiện số thẻ sẽ
   thêm, số thẻ trùng, số bản ghi hỏng, phạm vi đích, xem trước 5 thẻ → người dùng xác
   nhận → mới ghi. Đường đọc và đường ghi dùng CHUNG một hàm lập kế hoạch
   (`#planImportBatches`), nên hai con số không thể lệch.
5. Số bản ghi bị bỏ qua do LÕI đếm (`ImportResult.skipped` trong `import.rs`) thay vì
   JavaScript đoán lại luật đọc của từng định dạng. Đây là thay đổi hợp đồng DUY NHẤT,
   và nó cộng thêm (không đổi nghĩa trường cũ).
6. Sao lưu tách hẳn: thẻ Xuất nói rõ file không kèm lịch ôn tập; thẻ Sao lưu nói rõ file
   chứa gì và tác động của công tắc tiến độ. Khôi phục KIỂM TRA file trước (hợp lệ, số
   thẻ, có tiến độ, ngày tạo, phiên hết hạn, số thẻ không đọc được) rồi mới hỏi xác nhận
   bằng bảng cảnh báo trong ứng dụng — thay `window.confirm` cũ — kèm nút tải bản sao lưu
   hiện tại trước.
7. Trên điện thoại, vùng chọn file là MỘT hàng thấp; từ 720px mới nới thành vùng kéo
   thả. Sau khi chọn file, khung tải file trống được THAY bằng trạng thái của file.
   Hướng dẫn định dạng gập sau một dòng `Định dạng file và quy tắc trùng`.
8. Từ 1000px, thân tác vụ thành hai cột (phạm vi | hành động) — cùng component, cùng
   thứ tự thao tác, chỉ khác cách bày.

**Vì sao.** Nguyên nhân của màn hình dài không phải kích thước từng nút mà là việc ba
việc khác nhau cùng tồn tại trên một cột. Chọn việc trước rồi mới chọn phạm vi khiến
mỗi lúc chỉ có một biểu mẫu — đó là thay đổi kiến trúc thông tin, không phải CSS. Bước
kiểm tra đứng trước bước ghi vì thao tác nhập có hệ quả lâu dài: biết trước "1 thẻ sẽ
thêm, 2 bản ghi thiếu mặt thẻ" rẻ hơn nhiều so với nhập xong rồi dọn. Việc đếm bản ghi
hỏng đặt ở Rust vì chỉ nơi đó biết luật header/ô trống của CSV — viết lại bằng
JavaScript là tạo nguồn sự thật thứ hai cho cùng một luật.

**Hệ quả.**

- Hợp đồng WASM thêm một trường (`skipped`); `docs/contract.md` đã cập nhật. WASM
  +0,09 kB (252,68 → 252,77 kB; gzip 102,35 → 102,41 kB).
- Phát hiện và sửa một lỗi CÓ SẴN ở cổng kiểm tra backup: `furigana`/`romaji` bị đòi
  khác rỗng trong khi lõi khai báo `#[serde(default)]`, nên một thẻ không có cách đọc
  (kể cả thẻ Mẫu câu của nội dung phát hành) làm cả file backup bị từ chối — người dùng
  không khôi phục được bản sao lưu của chính mình. Cổng kiểm tra cấu trúc nay khớp
  schema thẻ; kiểu sai vẫn bị từ chối.
- Màn Nhập/xuất dùng thêm một file component (`TransferScope.svelte`) và một module
  luật (`src/app/transfer.ts`), nhưng gói `Transfer` vẫn tách riêng theo ADR-024: chỉ
  người mở màn này tải nó.
- `scripts/layout-baseline.json` và 10 ảnh chụp của trạng thái `transfer` đã được làm
  mới có chủ ý; 14 màn hình khác khớp chuẩn cũ từng pixel.

## ADR-036 — Màn Cài đặt: phân cấp theo MỤC ĐÍCH, hàng cài đặt thay cho chuỗi thẻ

**Bối cảnh.** Màn Cài đặt gồm năm khu vực nhưng cả năm đều là `.card` có viền, tiêu
đề và badge giống hệt nhau, nên trọng lượng thị giác của "số thẻ mới mỗi ngày" bằng
"phiên bản lõi Rust". Ba thiết lập thay đổi hằng ngày nằm rải trong một biểu mẫu; hai
loại cập nhật chung một thẻ với thanh chọn (ADR-032) nên chỉ thấy được một loại tại
một thời điểm; và thao tác không thể hoàn tác nằm cùng hàng với những nút bấm hằng
ngày. Đo được: 1.388px ở 320×568, 1.329px ở 390×844.

**Quyết định.**

1. Năm nhóm theo việc người dùng muốn làm — **Học tập · Công cụ · Cập nhật · Thông
tin ứng dụng · Quản lý dữ liệu** — tiêu đề nhóm nhỏ, không badge. Mỗi nhóm một kiểu
bề mặt theo tần suất dùng: hàng phân cách trong một bề mặt phẳng cho thiết lập
thường, hàng điều hướng cho Công cụ, hai khối cho Cập nhật, mục gập cho Thông tin,
bề mặt `--danger-soft` cho Quản lý dữ liệu.
2. `.card` chỉ còn ở nhóm Cập nhật và Công cụ; bỏ hẳn cách bọc mỗi chức năng một thẻ.
3. Giao diện là thanh chọn ba lựa chọn hiện cùng lúc (`aria-pressed`, trạng thái đọc
được bằng bề mặt + viền + độ đậm) thay cho `<select>`.
4. Số thẻ mới được KẸP tại giao diện theo `MAX_DAILY_NEW_LIMIT` của tầng lưu trữ:
không phải số → từ chối và trả ô về giá trị đang dùng (`aria-invalid`); ngoài khoảng →
kẹp lại và nói rõ. Trần không được chép lại thành con số trong markup.
5. Hai loại cập nhật là HAI KHỐI, không phải hai tab: mỗi loại có phiên bản, trạng
thái và hành động riêng; nút "Cập nhật và tải lại" chỉ tồn tại khi thật sự có bản chờ
kích hoạt. Tuỳ chọn ít dùng nằm sau dòng "Tuỳ chọn khác".
6. Thông tin ứng dụng gập lại (`<details>`), phiên bản ứng dụng vẫn hiện trên dòng
tiêu đề, giá trị đọc từ nguồn thật.
7. Vùng mở rộng chứa NÚT dùng `{#if}` + `aria-expanded`, KHÔNG dùng `<details>`.
8. Xoá dữ liệu: xác nhận tại chỗ ghi rõ số thẻ, mô tả đúng phạm vi, báo cáo kết quả
thật. `AppStore.eraseLibrary` **xoá cả phiên học đang dở**.
9. `AppStore.updateSettings` ghi TUẦN TỰ (hàng đợi), nên điều khiển không cần bị khoá
trong lúc chờ.

**Vì sao.** Bốn vấn đề gốc: (a) mọi khu vực cùng trọng lượng thị giác → phân cấp
bằng bề mặt + cỡ tiêu đề thay vì bằng màu; (b) hai loại cập nhật bị ép vào một thẻ →
chúng độc lập về nghiệp vụ (bản dựng cần tải lại trang, nội dung thì không) nên phải
đứng riêng và đọc được cùng lúc; (c) thao tác phá huỷ không có chỗ riêng → bước xác
nhận tại chỗ; (d) giá trị nhập có thể đi thẳng vào logic lập lịch → kẹp ở giao diện
với cùng trần mà `normalizeSettings` dùng. Điểm 7 không phải sở thích: nút trong
`display: none` vẫn bị `audit:layout` báo "có mặt nhưng không chạm tới được" — và
phép kiểm đó đúng, nên nội dung gập không được phép nằm trong DOM. Điểm 8 cũng là sửa
lỗi chứ không phải mở rộng phạm vi: phiên dở là tiến độ học, nên giữ nó lại sau khi
"xoá sạch tiến độ" tạo ra trạng thái dở dang (Trang chủ mời tiếp tục một phiên trỏ
vào thẻ vừa bị xoá). Điểm 9: `saveSettings` là đọc–gộp–ghi, nên hai lần gọi chồng
nhau làm mất một thay đổi; khoá điều khiển là cách chữa tốn kém hơn — nó nuốt phím
người dùng vừa bấm.

**Hệ quả.** Chiều cao (10 khung nhìn, `audit:layout`): 1024×768 và 1440×900
**1232 → 1201**; 768×1024 **1252 → 1218**; 844×390 nằm ngang **1253 → 1219**; 390×844
**1329 → 1365** (+36); 320×568 **1388 → 1495** (+107 — năm tiêu đề nhóm mới và phần
giải thích cho từng thiết lập). `Settings` **11,54 → 19,14 kB** (4,22 → 5,74 kB gzip)
+ CSS riêng 8,00 kB (1,73 kB gzip, trước đây nằm trong gói chung); index JS 114,59 →
**114,71 kB** (38,67 → 38,71 kB gzip); precache 42 mục / **560,47 KiB**. Chuẩn hình học
và 10 ảnh chụp của trạng thái `settings` được làm mới có chủ ý; 14 màn hình khác khớp
chuẩn cũ. Landmark `.update-picker` trong `scripts/audit-layout.mjs` được thay bằng
`.segmented` (đúng khối chọn của thiết kế mới). Ràng buộc cho vòng sau: đổi số lượng
hay thứ tự nhóm trên màn Cài đặt là thay đổi chuẩn bố cục `settings`.

**Kiểm chứng.** `svelte-check` **0 lỗi/0 cảnh báo**; `cargo test --workspace`
**176 + 4**; `node --test tests/*.test.ts` **171/171**; `npm run build` xanh;
`npm run audit:layout` **0 vi phạm** trên 150 trạng thái (300 phép đo, 90 bước cử chỉ,
150 ảnh hình học, 150 ảnh màn hình); `LAYOUT_SCREENS=settings npm run audit:multi-env`
**XANH ở cả hai môi trường renderer** (nhiễu nội môi trường 0/255 trên 20 lần chụp lại
mỗi môi trường). Trên bản dựng production: ba thay đổi liên tiếp (giao diện → số thẻ →
công tắc) đều được lưu; `999` → 500 kèm dòng "Đã giới hạn…", `-5` → 0, ô trống → từ
chối và trả về giá trị cũ; hai nút kiểm tra báo "đang chạy bản mới nhất" khi có mạng
và "không kiểm tra được" khi tắt máy chủ; xoá thư viện hỏi xác nhận khi IndexedDB còn
36 thẻ, "Huỷ" giữ nguyên 36 thẻ, xác nhận → thẻ 0, `meta.session` bị xoá,
`meta.settings` còn nguyên, tải lại thì nội dung đi kèm trở lại ở trạng thái chưa học;
màn Cài đặt dựng đủ nhóm khi ngoại tuyến (service worker). Chi tiết ở
[`verification.md`](verification.md).

---

## Bảng tổng hợp số đo

Các phép đo bỏ NFKC là lịch sử theo ADR-003. Kích thước hiện tại bên dưới lấy từ
production build cuối Phase 4 ngày 2026-10-13 (`npm run build`, sau `generate`);
dòng nào có ghi chú 1.0.3 thì lấy từ bản dựng 1.0.3 ngày 2026-10-16.
Startup/core benchmark, so sánh pre/post và giới hạn phép đo nằm tại
[`release-readiness.md`](release-readiness.md).

| Chỉ số | Giá trị | Ghi chú |
|---|---|---|
| WASM nếu dùng NFKC | 344,9 KiB | đo lại 2026-10-12 |
| Chi phí NFKC | +119,8 KiB (+53%) | gần như không đổi so với lần đo đầu |
| WASM 1.0.2 (đo lại) | 232,60 kB | gzip 95,33 kB; `npm run build` trước đợt 1.0.3 |
| WASM 1.0.3 | 253,99 kB | gzip 102,70 kB. Tăng 21,4 kB thô / 7,4 kB gzip cho chấm điểm theo mức + mô hình thành thạo + xem trước khoảng ôn; đổi bảng tra lấy `match` theo ADR-025 giảm được 0,9 kB; đo lại sau ADR-028 (2026-10-16): 252,68 kB (102,35 kB gzip); sau ADR-035 (2026-10-17): 252,77 kB (102,41 kB gzip) — trường `skipped` của `deck_parse` |
| `wasm-opt` tiết kiệm được | ~6% | đổi lấy build không tái lập được |
| JS chính 1.0.2 (đo lại) | 171,10 kB | gzip 56,08 kB |
| JS chính 1.0.3 | 113,29 kB | gzip 38,31 kB — nhỏ hơn 61,7 kB thô / 19,3 kB gzip so với 1.0.2 nhờ tách gói màn hình (ADR-024); đo lại sau ADR-026/027 (2026-10-16): 109,55 kB (36,70 kB gzip); sau ADR-028 (2026-10-16): 109,60 kB (36,77 kB gzip); sau ADR-029 (2026-10-16): 111,22 kB (37,64 kB gzip); sau ADR-030 (2026-10-16): 111,32 kB (37,66 kB gzip); sau ADR-032 (2026-10-16): 111,36 kB (37,68 kB gzip); sau ADR-033/034 (2026-10-16): 113,29 kB (38,31 kB gzip); sau ADR-035 (2026-10-17): 114,59 kB (38,67 kB gzip); sau ADR-036 (2026-10-17): 114,71 kB (38,71 kB gzip) — màn Nhập/xuất ba tác vụ nằm trong gói riêng `Transfer` 30,42 kB (10,49 kB gzip) + 7,38 kB CSS; màn Cài đặt tái thiết kế nằm trong gói riêng `Settings` **19,14 kB (5,74 kB gzip)** + CSS 8,00 kB (1,73 kB gzip) |
| CSS màn hình đầu tiên 1.0.3 | 14,87 kB | gzip 4,01 kB, cộng CSS riêng của màn hình; 1.0.2 là 32,94 kB cho mọi màn hình; sau ADR-029 (2026-10-16): 14,87 kB (4,01 kB gzip); sau ADR-030 (2026-10-16): 14,87 kB (4,03 kB gzip); sau ADR-033/034 (2026-10-16): 14,87 kB (4,01 kB gzip) |
| Nạp trước toàn bộ (precache) | 42 mục | 522,61 KiB; đo lại 2026-10-16 sau ADR-026/027; 1.0.2 là 9 mục / 447,46 KiB; sau ADR-028: 493,56 KiB; sau ADR-029: 33 mục / 496,93 KiB; sau ADR-030 (2026-10-16): 34 mục / 492,77 KiB; sau ADR-031 (2026-10-16): 34 mục / 493,79 KiB; sau ADR-032 (2026-10-16): 35 mục / 495,29 KiB; sau ADR-033/034 (2026-10-16): 42 mục / 522,61 KiB; sau ADR-035 (2026-10-17): 42 mục / 546,01 KiB; sau ADR-036 (2026-10-17): 42 mục / **560,47 KiB** |
| HTML | 0,96 kB | gzip 0,54 kB |
| Workbox window | 5,75 kB | gzip 2,36 kB |
| Tổng tài nguyên tải lần đầu liệt kê | 428,03 kB | gzip 156,29 kB |
| Precache của service worker | 9 mục | 432,51 KiB; **không** có `/data/content/**` |
| Hạt giống nội dung trong bundle | 5,4 KB | 36 thẻ, 3 gói |
| Nội dung xuất bản tải từ mạng | 7,3 KB | cùng 3 gói, bản dễ đọc |
| Test Rust | 176 | `cargo test --workspace`; 1.0.2 là 131; ADR-028 thêm ca tách lý do yếu (`weakRating`/`weakQuiz`, ưu tiên `rating`) và tiến độ bài khớp toàn thư viện; ADR-035 (2026-10-17): +3 ca đếm bản ghi bỏ qua (174 → 176) |
| Test JS/TS | 171 | `node --test tests/*.test.ts`; vòng ADR-026/027 thêm 15 ca (128 → 143): `card-search`, `random-study`, ca khôi phục `focus: 'random'` ở session/backup; ADR-028: 150 (hợp đồng WASM có ca cho `weakRating`/`weakQuiz` và tiến độ từng bài); ADR-030: 151 (ca ánh xạ mục điều hướng viết lại theo `SECTION_OF`, ca Back tách đôi theo mục sở hữu); ADR-033/034 (2026-10-16): 153 (+2: ca backup mang `collectionScope`, ca `normalizeScreen` ánh xạ tên màn hình cũ); ADR-035 (2026-10-17): **171** (+18: `tests/transfer.test.ts` 15 ca trên WASM thật, 1 ca hợp đồng cho `skipped`, 2 ca backup cho thẻ không có furigana/romaji); 1.0.2 là 116 |
| Chấm điểm: recall / precision | 1,000 / 1,000 | 39 ca có nhãn; thuật toán cũ 0,880 / 1,000 |
| `srs_preview` so với 4 lần gọi | 0,01 ms / 0,04 ms | median, 15 mẫu; 1 so với 4 lần vượt biên WASM |
