# Ngoại tuyến và cập nhật

Đặc tả §7 tách **cập nhật ứng dụng** và **cập nhật dữ liệu ngoại tuyến** thành hai
việc độc lập. Tài liệu này mô tả cách Midori thực hiện điều đó.

## 1. Vì sao phải tách

Nếu gộp hai loại cập nhật, ba vấn đề xuất hiện:

1. **Kẹt phiên bản.** Precache nội dung trong service worker nghĩa là bản nội dung
   mới không bao giờ hiển thị cho tới khi service worker cập nhật — và service worker
   chỉ cập nhật khi ứng dụng cập nhật. Nội dung bị gắn chặt vào nhịp phát hành mã.
2. **Tải thừa.** Sửa một thẻ trong bộ 500 thẻ sẽ buộc mọi người dùng tải lại cả bộ.
3. **Rủi ro mất dữ liệu.** Một cơ chế "cập nhật" mơ hồ rất dễ tiến hoá thành "xoá
   rồi tải lại" — và đặc tả §7.4 cấm điều đó với dữ liệu người học.

Midori giải quyết bằng ba quyết định cấu trúc:

- **Không precache nội dung.** Cấu hình `vite-plugin-pwa` có `globIgnores` loại trừ
  `/data/content/**`. Chỉ tài nguyên chạy ứng dụng được precache.
- **Nội dung có phiên bản và manifest riêng**, do `scripts/build-content.mjs` sinh.
- **Hai IndexedDB tách biệt**, nên pipeline nội dung không có đường chạm tới thư
  viện người học.

## 2. Cập nhật ứng dụng

Bao gồm: HTML, JavaScript, WASM, CSS, giao diện, service worker.

Cơ chế: `vite-plugin-pwa` sinh service worker Workbox, precache các tài nguyên có
hash trong tên file. `src/pwa/updates.ts` theo dõi và báo cho người dùng khi có bản
mới; việc tải lại chỉ xảy ra khi người dùng đồng ý.

Chế độ là `registerType: 'prompt'`. Bản mới được **cài** ngay (nó nằm ở trạng thái
`waiting`) nhưng **không** tự chiếm quyền — nhờ vậy một tab đang học không bị lấy mất
WASM giữa chừng.

### Vấn đề "giao diện mới + lõi WASM cũ"

Đặc tả §7.2 nêu rõ rủi ro: giao diện mới chạy cùng lõi WASM cũ. Midori chống bằng
ba lớp:

1. **Precache theo tập hợp.** Workbox precache cả `index.html`, JS và `.wasm` trong
   cùng một lần sinh. Tài nguyên có hash trong tên, nên chúng không thể lẫn phiên
   bản: `index-a1b2.js` luôn trỏ tới `midori_wasm_bg-c3d4.wasm`.
2. **Chỉ tải lại khi service worker MỚI đã điều khiển.** Sau `SKIP_WAITING`, ứng dụng
   chờ sự kiện `controllerchange` rồi mới `location.reload()`. Đây là lớp **quan
   trọng nhất**, và là lớp từng bị thiếu: tải lại ngay sau khi gửi thông điệp sẽ để
   service worker cũ phục vụ `index.html` cũ trỏ tới file JS đã bị bản dựng mới xoá
   ⇒ **trắng trang**. Chi tiết ở [decisions.md](decisions.md) ADR-013.
3. **Nội dung cập nhật tách rời khỏi bản dựng.** Một mình việc cập nhật ứng dụng
   không bao giờ ghi đè hay tải lại nội dung đang dùng.
4. **Ngữ cảnh học sống sót qua lần tải lại đó.** Ba lớp trên bảo vệ *mã*, không bảo
   vệ *ngữ cảnh*: một lần tải lại xảy ra khi người dùng đang học dở mà không có bản
   lưu phiên thì buổi học vẫn coi như mất, chỉ khác là mất theo cách "sạch". Vì vậy
   phiên đang dở được ghi xuống database người dùng và khôi phục khi màn hình Học
   dựng xong — xem [decisions.md](decisions.md) ADR-015. Đây là chỗ duy nhất trong
   luồng cập nhật chạm tới trạng thái học, và nó chỉ **đọc lại** thư viện hiện tại,
   không ghi gì thêm vào đó.

### Kiểm tra phiên bản công bố

Ngoài service worker, ứng dụng còn đọc `/data/version.json` (do plugin trong
`vite.config.ts` sinh khi build, **không** precache) để bắt trường hợp bản phát hành
chỉ đổi phiên bản mà không đổi tài nguyên precache. Bộ đọc nằm ở `src/pwa/version.ts`
để kiểm thử được bằng Node; nó kiểm tra `content-type` phải là JSON, vì máy chủ tĩnh
trả `index.html` với mã 200 cho đường dẫn không tồn tại. Chi tiết ở ADR-014.

### Cập nhật ứng dụng chạm tới mạng ở đâu

Ứng dụng **có** một yêu cầu mạng lúc khởi động: `/data/version.json`. Đó là chủ ý —
kiểm tra này phải đọc bản công bố thật, không thể đọc từ cache. Khi ngoại tuyến, yêu
cầu thất bại và bị bỏ qua (trả `null`), **không** ảnh hưởng gì tới việc khởi động.
Mọi tài nguyên để chạy ứng dụng vẫn đến từ precache.

## 3. Cập nhật nội dung

Bao gồm: các bộ thẻ mà người dùng cần để học ngoại tuyến.

### Nguồn sự thật

`content/` — không phải `public/data/content/`. Thư mục sau là **sản phẩm sinh ra**,
không sửa tay.

```
content/
├── content.json          ← phiên bản nội dung + danh sách gói
└── bundles/
    ├── vocabulary.json   ← collection mặc định rỗng; người dùng tự thêm thẻ
    ├── kanji.json
    └── …
```

`npm run content` biên dịch thành:

```
public/data/content/
├── manifest.json         ← schemaVersion, contentVersion, bundles[] kèm sha256
└── bundles/*.json
```

Đồng thời sinh `src/generated/content-seed.json` — cấu trúc collection rỗng được
đóng vào bundle để lần chạy đầu tiên hoạt động ngoại tuyến mà không tự thêm dữ liệu
mẫu vào thư viện người dùng.

### Trường `id` là bất biến

`id` của thẻ trong `content/` là **danh tính nội dung**. Đổi `id` của một thẻ đang
tồn tại đồng nghĩa với xoá thẻ cũ và tạo thẻ mới — và làm mất tiến độ học của người
dùng thẻ đó.

`scripts/build-content.mjs` kiểm tra id trùng trong lúc build, nhưng nó **không thể**
phát hiện việc bạn đổi `id` thành một giá trị mới. Đó là trách nhiệm của người sửa
nội dung.

### Quy trình cập nhật (đặc tả §7.3)

`src/content/pipeline.ts` thực hiện đúng trình tự:

| Bước | Việc làm | Nếu thất bại |
|---|---|---|
| 1 | Tải `manifest.json`, so `schemaVersion` | `schema-unsupported` — dừng |
| 2 | So `sha256` từng gói với gói đang có | Chỉ tải gói **đã đổi** |
| 3 | Tải gói mới vào bộ nhớ | `network` — dừng |
| 4 | Xác minh `bytes` và `sha256` | `integrity` — dừng |
| 5 | Phân tích thành thẻ (`deck_parse`) | `bundle-invalid` — dừng |
| 6 | Ghi vào ngăn `staging` | `storage` — dừng |
| 7 | **Dừng lại:** người dùng xem trước `N` thẻ cập nhật, `M` thẻ mới, `K` thẻ bị bỏ (kèm danh sách từng thẻ) | "Bỏ qua" → `clearStaging`, dừng |
| 8 | `promote()` — một giao dịch nguyên tử | `storage` — dừng |
| 9 | `content_reconcile` vào thư viện | `sync-failed` — kích hoạt vẫn giữ |
| 10 | Ghi `contentCardIds` + `contentVersion` vào `meta` | `sync-failed` — có thể thử lại |

Điểm quan trọng: **từ bước 1 đến bước 7 chưa đụng tới nội dung đang dùng.**
Bước 7 là chỗ duy nhất người dùng quyết định, và `promote()` ở bước 8 mới là điểm
chuyển. Trước đó thất bại ở bất kỳ đâu — hoặc người dùng bấm "Bỏ qua" — người học
vẫn tiếp tục với bản cũ, không mất gì.

Vì vậy pipeline tách làm hai hàm: `stageContentUpdate()` dừng ở bước 6 và trả về
`staged`; `promote()` (qua `ContentService.activateStaged`) chạy bước 8. Con số xem
trước ở bước 7 do chính `content_reconcile` tính trên bản đã đệm (`previewReconciliation`),
nên nó **đúng bằng** thay đổi sẽ xảy ra — không phải một phép đếm song song dễ lệch.
`runContentUpdate()` vẫn tồn tại như một lời gọi gộp (đệm rồi kích hoạt ngay) cho
kiểm thử và cho nơi không cần bước xem trước.

### Kết quả trả về

`StageOutcome` — một hợp nhất bốn trạng thái của bước tải + đệm, để giao diện
không phải đoán:

| `status` | Nghĩa | Nội dung đang dùng |
|---|---|---|
| `up-to-date` | Đang là bản mới nhất | Không đổi |
| `staged` | Đã tải và đệm, chờ người dùng kích hoạt | **Nguyên vẹn** |
| `offline` | Không có mạng | **Nguyên vẹn** |
| `failed` | Thất bại, có `reason` | **Nguyên vẹn** |

Lớp ứng dụng còn hai kết cục riêng cho bước kích hoạt (`ContentActivationResult`):
`activated` (kèm số thẻ cập nhật/mới/bị bỏ đã ghi) và `sync-failed` (nội dung mới đã
dùng nhưng thư viện chưa đồng bộ được — thử lại được, không mất dữ liệu).

Trường `reused` chứng minh đặc tả §7.2 được tôn trọng: gói không đổi thì không tải
lại. `tests/content-pipeline.test.ts` có test khẳng định điều này.

## 4. Bảo toàn dữ liệu người học (§7.4)

Ba lớp bảo vệ, độc lập nhau:

### Lớp 1 — Cấu trúc

Hai IndexedDB khác nhau, hai module khác nhau, không import lẫn nhau. Xem
[architecture.md](architecture.md).

### Lớp 2 — Hợp đồng `content_reconcile`

| Tình huống | Hành vi |
|---|---|
| Thẻ nội dung đã có, nội dung đổi | Cập nhật `front`, `back`, `reading`, `deckId`. **Giữ nguyên** `id`, `createdAt`, `srs` |
| Thẻ nội dung mới | Tạo thẻ chưa học |
| Thẻ biến mất khỏi nội dung | **Không xoá** — chỉ trả về trong `orphaned` |
| Thẻ người dùng tự tạo | Không bao giờ xuất hiện trong cả ba danh sách |

Không có hàm nào trong lõi xoá thẻ. Việc xoá chỉ xảy ra khi người dùng yêu cầu.

### Lớp 3 — Sổ sách trong `meta`

`contentCardIds` ghi lại thẻ nào do nội dung quản lý. Không có nó, lần cập nhật sau
sẽ không phân biệt được thẻ nội dung với thẻ người dùng tự tạo — và sẽ ghi đè thẻ
người dùng tự làm.

## 5. Giới hạn nền tảng (§7.5)

Đặc tả yêu cầu không giả định trình duyệt luôn hợp tác. Các tình huống và cách xử lý:

| Tình huống | Xử lý |
|---|---|
| Người dùng đóng ứng dụng giữa lúc tải | `staging` có dữ liệu dở. Lần sau `readStaging` trả về bản dở; `clearStaging` dọn trước khi tải lại |
| Trình duyệt thu hồi cache | Service worker cài lại từ mạng ở lần mở sau. Lần mở đó **cần mạng** — không có cách nào khác nếu cả ứng dụng lẫn nội dung đều mất |
| Thiết bị hết dung lượng | Bước 6 (ghi `staging`) ném lỗi → `storage`. Nội dung đang dùng nguyên vẹn |
| Phiên bản mới không tương thích | `schemaVersion` kiểm ở bước 1 → `schema-unsupported`. Không tải gì cả |
| Mất mạng giữa lúc cập nhật | `network` hoặc `integrity`. Nội dung đang dùng nguyên vẹn |
| Nội dung đang dùng hỏng | `rollback()` khôi phục ngăn `previous` |

### Điều chưa được giải quyết

- **Không có phục hồi khi cả cache và IndexedDB đều mất.** Khi đó ứng dụng phải tải
  lại từ mạng. Không có cách nào tránh khỏi trong giới hạn của nền tảng web.
- **Không có cách chạy nền.** Không thể tải nội dung cập nhật khi ứng dụng đã đóng.
  Việc kiểm tra cập nhật chỉ xảy ra khi người dùng mở ứng dụng.
- **Ngăn `previous` chỉ giữ một bản.** Nếu bản mới kích hoạt rồi cũng hỏng, không có
  bản thứ hai để lùi tiếp.
- **Không thể tự sửa ứng dụng đã hỏng.** Nếu một bản dựng lỗi đã chiếm quyền, người
  dùng phải tự tải lại (hoặc xoá dữ liệu trang) để thoát ra. Thiết kế hiện tại thu hẹp
  xác suất này xuống rất thấp, nhưng không loại bỏ được.

## 6. Cách kiểm chứng lại

Quy trình thao tác thật — gồm cả bước dừng máy chủ để kiểm tra ngoại tuyến — nằm ở
[verification.md](verification.md). Đây là hàng rào duy nhất hiện có cho hành vi
service worker, vì chế độ dev tắt service worker và test tự động không có trình duyệt.
