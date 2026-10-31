# Kiến trúc

## 1. Sơ đồ lớp

```
┌─────────────────────────────────────────────────────────────────────┐
│ src/ui/*.svelte  — component Svelte                                 │
│ DOM, sự kiện, chuyển cảnh, trạng thái hiển thị                       │
│ KHÔNG gọi WASM. KHÔNG mở IndexedDB.                                 │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ props + hàm từ store
┌───────────────────────────▼─────────────────────────────────────────┐
│ src/app/store.svelte.ts — lớp điều phối ứng dụng                    │
│ Giữ trạng thái dùng chung, gọi lõi, gọi lưu trữ, gọi pipeline        │
│ Nơi DUY NHẤT mà logic ứng dụng được phép phối hợp nhiều lớp          │
└──────┬──────────────────────────────────────────────┬───────────────┘
       │                                              │
┌──────▼──────────────────────┐        ┌──────────────▼───────────────┐
│ src/core — mặt tiền WASM    │        │ src/storage — dữ liệu        │
│ Bóc phong bì, ném CoreError │        │ người dùng                   │
│ Nơi DUY NHẤT import         │        │ IndexedDB "midori"           │
│ src/generated/              │        │ (thẻ, meta, recovery)        │
└──────┬──────────────────────┘        └──────────────────────────────┘
       │
┌──────▼──────────────────────┐        ┌──────────────────────────────┐
│ midori-wasm (Rust, mỏng)    │        │ src/content — nội dung       │
│ #[wasm_bindgen] chuyển tiếp │        │ xuất bản                     │
│ Không chứa logic            │        │ IndexedDB "midori-content"   │
└──────┬──────────────────────┘        │ + pipeline cập nhật          │
       │                               └──────────────────────────────┘
┌──────▼──────────────────────┐        ┌──────────────────────────────┐
│ midori-core (Rust thuần)    │        │ src/pwa — service worker,    │
│ srs card content import     │        │ cập nhật ứng dụng            │
│ export quiz stats session   │        │ src/platform — uuid, sha256, │
│ text json error             │        │ đọc file, tải file           │
│ KHÔNG biết nền tảng         │        └──────────────────────────────┘
└─────────────────────────────┘
```

## 2. Ranh giới và lý do

Ranh giới ở đây không phải để kiến trúc trông đẹp. Mỗi ranh giới tồn tại vì một
vấn đề cụ thể đã gặp hoặc một yêu cầu cụ thể của đặc tả.

### `midori-core` không biết nền tảng

Lõi không import `web_sys`, không `js_sys`, không biết DOM, không biết IndexedDB,
không biết mạng. Nó là tập hợp **hàm thuần**: nhận dữ liệu, trả dữ liệu.

Vì sao: `cargo test` chạy được toàn bộ 131 test nghiệp vụ trong vài giây, không cần
trình duyệt, không cần WASM. Khi một quy tắc SRS sai, ta biết ngay và biết chính xác
nó sai ở đâu. Nếu lõi phụ thuộc nền tảng, mọi test sẽ phải chạy qua WASM và trình
duyệt — chậm hơn hàng chục lần và khó gỡ lỗi hơn nhiều.

Hệ quả cần nhớ: **sinh id và lấy thời gian là việc của JS.** `crypto.randomUUID()`
và `Date.now()` ở JS rồi truyền vào Rust qua tham số. Đây là lý do nhiều hàm có
tham số `now`.

### `midori-wasm` chỉ chuyển tiếp

Mỗi hàm ở đây thân hình chỉ có một dòng: gọi hàm tương ứng trong `api.rs`. Không
có `if`, không có chuyển đổi dữ liệu.

Vì sao: nếu logic lọt vào đây, nó sẽ **không được test bởi `cargo test`** và trở
thành mã không ai kiểm chứng. Giữ lớp này mỏng đến mức không có gì để sai.

### `src/core` là nơi duy nhất chạm WASM

Không module nào khác được `import` trực tiếp từ `src/generated/`. Mọi thứ đi qua
`src/core/index.ts`.

Vì sao: khi hợp đồng đổi, chỉ một thư mục phải sửa. Và vì `src/generated/` là sản
phẩm sinh tự động — phụ thuộc rải rác vào nó sẽ khiến việc tái sinh trở nên đáng sợ.

### Hai IndexedDB tách biệt

Nội dung xuất bản (`midori-content`) và dữ liệu người học (`midori`) là hai database
khác nhau, do hai module khác nhau quản lý, **không import lẫn nhau**.

Vì sao: đặc tả §7.4 yêu cầu không bao giờ ghi đè dữ liệu cá nhân vì cập nhật nội
dung. Cách bảo đảm chắc chắn nhất không phải là cẩn thận khi viết mã, mà là làm cho
việc ghi nhầm **không thể xảy ra về mặt cấu trúc**. `src/content/pipeline.ts` không
import `src/storage/cards.ts`, nên nó không có cách nào chạm tới thư viện người học.

Cầu nối duy nhất là `content_reconcile` — một hàm Rust thuần, có hợp đồng rõ ràng,
được test riêng. `src/content/reconciliation.ts` lập kế hoạch qua tất cả bundle,
sau đó `src/storage/cards.ts` ghi thẻ đổi và metadata phiên bản/id trong cùng một
transaction. State trong app chỉ cập nhật sau khi transaction hoàn tất.

Dữ liệu thẻ lỗi đi theo luồng riêng: `cardsNormalize` trả danh sách bị từ chối,
`loadCards` ghi nguyên bản ghi và khóa vào store `recovery`, rồi xóa khỏi `cards`
trong cùng một transaction. Giao diện chỉ xuất file cứu hộ, không tự diễn giải lại
dữ liệu không hợp lệ.

### `src/app/store.svelte.ts` là nơi phối hợp

Đây là lớp duy nhất biết về cả ba: lõi, lưu trữ, pipeline. Mọi luồng nghiệp vụ
("chấm điểm thẻ này rồi lưu lại rồi cập nhật thống kê") sống ở đây.

Backup cá nhân được xác thực ở `src/storage/backup.ts`; chỉ khi toàn bộ file hợp lệ
mới gọi helper thay thư viện. File backup cá nhân (có thể mang SRS/session) tách biệt
với file bộ thẻ chia sẻ, vốn không mang tiến độ.

Việc lưu screen cuối cùng là một tùy chọn phục hồi điều hướng, không phải dữ liệu
học. Lỗi ghi không được nuốt: store ghi log và hiển thị cảnh báo có thể đóng, còn
điều hướng hiện tại vẫn tiếp tục. Một bộ đếm thứ tự ngăn kết quả ghi bất đồng bộ cũ
ghi đè trạng thái lỗi/kết quả mới hơn. Cards, SRS và session có luồng lưu riêng.

Vì sao: nếu để `ui/` tự phối hợp, mỗi màn hình sẽ có một bản logic riêng và chúng sẽ
lệch nhau. Nếu để `core/` phối hợp, nó phải biết lưu trữ — phá vỡ ranh giới quan
trọng nhất.

## 3. Luồng dữ liệu

### Chấm điểm một thẻ (chế độ lật thẻ)

```
Study.svelte
  │ người học bấm "Tốt"
  ▼
store.gradeCurrent('good')
  │
  ├─► core.srsSchedule(srs, 'good', now)      ← một lần vượt biên WASM
  │     └─ Rust: áp luật SM-2, trả SrsState mới
  │
  ├─► storage.putCard({ ...card, srs: mới })  ← dữ liệu PHẢI phẳng
  │     └─ IndexedDB "midori"
  │
  └─► nạp lại thống kê, chuyển sang thẻ kế tiếp
        └─ core.deckStats(cards, now)          ← một lần vượt biên cho cả thư viện
```

Điểm đáng chú ý: **hai lần gọi WASM cho cả vòng chấm điểm**, không phải một lần mỗi
thẻ. Thống kê tính lại từ toàn bộ thư viện trong một lần gọi, thay vì cập nhật gia
tăng — đơn giản hơn và không thể lệch.

### Cập nhật nội dung

```
Cài đặt → "Kiểm tra cập nhật nội dung"
  │
  ▼
src/content/pipeline.ts · stageContentUpdate
  ├─► tải /data/content/manifest.json
  ├─► so schemaVersion với SUPPORTED_SCHEMA_VERSION
  ├─► so sha256 từng gói với gói đang có   ← chỉ tải gói đã đổi (§7.2)
  ├─► tải gói mới → xác minh sha256 + byte
  ├─► core.deckParse(gói)                   ← xác thực cấu trúc thẻ
  └─► store.writeStaging(nội dung mới)      ← ngăn "staging", chưa dùng
        │
        ▼
      xem trước: "N thẻ cập nhật, M thẻ mới, K thẻ bị bỏ"
        │            (tính bằng chính core.contentReconcile trên bản đệm)
        │  [Kích hoạt]
        ▼
      store.promote()                       ← MỘT giao dịch nguyên tử:
        │                                       staging → active
        │                                       active cũ → previous
        │                                       xoá staging
        ▼
      core.contentReconcile(library, nội dung mới)
        ├─► áp kế hoạch vào thư viện người học
        │     · updated: chỉ 4 trường nội dung, SRS giữ nguyên
        │     · added:   thẻ mới, trạng thái chưa học
        │     · orphaned: chỉ báo về, KHÔNG xoá
        └─► ghi meta.contentSync.version + contentCardIds
```

Nếu bất kỳ bước nào thất bại trước `promote()` — hoặc người dùng bấm "Bỏ qua" ở
bước xem trước — nội dung đang dùng **không bị đụng tới**. Đó là toàn bộ mục đích
của ngăn `staging`.

## 4. Vòng đời khởi động

```
1. main.ts mount App.svelte
2. store.init()
     ├─ loadCore()                     ← tải và khởi tạo WASM (một lần)
     ├─ contentStore.readActive()
     │    ├─ có    → dùng luôn            (khởi động ngoại tuyến, nhanh)
     │    └─ không → cài seed từ bundle   (khởi động LẦN ĐẦU ngoại tuyến)
     ├─ storage.listCards() → core.cardsNormalize()   ← di trú bản ghi cũ
     └─ nếu đang online: kiểm tra cập nhật (không chặn giao diện)
3. Hiển thị Trang chủ
```

Nhánh "cài seed từ bundle" là điều làm cho lần chạy đầu tiên ngoại tuyến hoạt động:
cấu trúc nội dung (danh mục, 50 bài, tên gói) nằm trong bundle ứng dụng, không phải
tải từ mạng. Seed phát hành **không chứa thẻ nào**; thư viện chỉ có dữ liệu khi
người dùng nhập hoặc tự tạo.

## 5. Quy tắc phụ thuộc

```
ui  ──────────────► app
app ──────────────► core, storage, content, platform, pwa
content ──────────► core, platform
storage ──────────► core (chỉ KIỂU dữ liệu)
core ─────────────► generated (chỉ ở wasm.ts)
platform ─────────► (không phụ thuộc nội bộ)
pwa ──────────────► (không phụ thuộc nội bộ)
```

Luật không được vi phạm:

- `ui/` không import `core/`, `storage/`, `content/`.
- `storage/` và `content/` không import lẫn nhau.
- Chỉ `core/wasm.ts` được import `src/generated/`.
- Không có phụ thuộc vòng.

Nếu cần một luồng vượt qua các luật này, chỗ đúng là `app/store.svelte.ts`.

## 6. Kiểm định nội dung khi build

`scripts/content-validation.mjs` là ranh giới kiểm định nguồn ở Node, dùng chung bởi
`scripts/build-content.mjs` và `scripts/audit-content.mjs`. Nó xác thực toàn bộ
manifest và bundle trước khi builder ghi manifest/package/seed; lỗi ở bundle sau
không để lại output sinh dở của lần chạy đó. `npm run content:audit` chỉ đọc nguồn,
tính số liệu theo trường metadata có thật và ghi báo cáo ra stdout.

Validator không nằm trong lõi Rust/WASM vì đây là kiểm tra chất lượng nguồn ở bước
phát hành, không phải thao tác nghiệp vụ của người học. Runtime vẫn kiểm tra hash,
schema và kích hoạt content theo pipeline hiện có; builder validation không thay
thế các bảo đảm runtime đó. Độ phủ/giấy phép được mô tả trong
[`content-coverage.md`](content-coverage.md) và
[`content-governance.md`](content-governance.md).
