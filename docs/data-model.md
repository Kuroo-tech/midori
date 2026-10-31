# Mô hình dữ liệu

## 1. Thẻ — `Card`

```rust
pub struct Card {
    pub id: String,           // UUID hoặc id do nhà phát hành nội dung đặt
    pub deck_id: String,      // "vocabulary" | "kanji-g1" … mặc định "vocabulary"
    pub front: String,        // nghĩa tiếng Việt
    pub back: String,         // chữ Nhật (kanji/kana)
    pub furigana: String,     // cách đọc bằng kana
    pub romaji: String,       // cách đọc bằng romaji
    pub tags: Vec<String>,
    pub lesson: Option<u32>,  // 1..=50, chỉ dùng cho bộ Từ vựng (Minna)
    pub created_at: i64,      // ms từ epoch
    pub srs: SrsState,
}
```

JSON dùng `camelCase` (`deckId`, `createdAt`), khớp với TypeScript ở `src/core/types.ts`.

### `Card` và `CardDraft`

| | `Card` | `CardDraft` |
|---|---|---|
| Có `id`? | Có, bắt buộc | Không (tuỳ chọn cho nội dung xuất bản) |
| Có `srs`? | Có | Không |
| Có `createdAt`? | Có | Không |
| Dùng cho | Bản ghi đã lưu | Nhập/xuất file, nội dung xuất bản |

Việc tách hai kiểu là để **trạng thái học không thể lọt vào file nhập/xuất**. Nếu
dùng chung một kiểu, một file người dùng chia sẻ sẽ mang theo `srs` của người gửi —
và người nhận sẽ thừa hưởng lịch ôn của người khác.

### Khoá so trùng

Trong cùng một bộ, hai thẻ trùng nhau khi **`front` + `back`** trùng, sau khi đã
chuẩn hoá (gộp khoảng trắng, cắt hai đầu, hạ chữ thường cho romaji). Thẻ có `id`
khớp cũng bị coi là trùng.

Thẻ người dùng tự tạo không cần `id`; lớp nền tảng sinh UUID khi tạo.

## 2. `SrsState` và thuật toán SM-2

```rust
pub struct SrsState {
    pub ease: f64,               // bắt đầu 2.5, tối thiểu 1.3
    pub interval: u32,           // ngày
    pub repetitions: u32,
    pub lapses: u32,
    pub due: i64,                // ms từ epoch
    pub last_rating: Option<Rating>,   // "again" | "hard" | "good" | "easy"
    pub last_wrong_at: Option<i64>,    // dấu làm sai ở chế độ tự trả lời
    pub last_score: Option<f64>,       // điểm lần làm bài gần nhất, 0..1 (trường MỚI ở 1.0.3)
}
```

`last_score` vắng mặt là chuyện bình thường: thẻ chưa từng làm bài, hoặc bản ghi
được ghi bởi phiên bản trước 1.0.3. **Vắng mặt khác hẳn `0.0`** — đó là lý do
`DeckStats` có thêm `graded` (số thẻ đã từng làm bài) bên cạnh `accuracy`: không có
mẫu thì `accuracy` bằng 0 nhưng không được đọc thành "kém".

### Luật chấm điểm (`srs.rs::schedule`)

Chất lượng quy đổi: `again=1`, `hard=3`, `good=4`, `easy=5`.

```
nếu q < 3:                        # Again, Hard
    repetitions = 0
    lapses += 1
    interval = 0
ngược lại:                        # Good, Easy
    repetitions += 1
    interval = 1        nếu repetitions == 1
               6        nếu repetitions == 2
               round(interval_cũ × ease_cũ)   nếu lớn hơn

ease = max(1.3, ease + 0.1 − (5−q) × (0.08 + (5−q) × 0.02))
ease = round(ease × 100) / 100          # làm tròn 2 chữ số
due  = now + interval × 86400000
```

**Thứ tự cập nhật `ease` rất quan trọng và dễ làm sai.** Công thức `interval` khi
`repetitions >= 3` dùng **`ease` cũ**, không phải `ease` vừa tính lại. Đúng theo SM-2
gốc. Đảo thứ tự hai bước này sẽ khiến lịch ôn dài hơn thực tế — sai âm thầm, không có
triệu chứng rõ ràng. Có test riêng cho điều này.

`ease` bị làm tròn 2 chữ số ở mỗi lần chấm. Không làm tròn thì sai số tích luỹ khiến
lịch ôn lệch dần theo thời gian.

### Phân loại thẻ

| Trạng thái | Điều kiện |
|---|---|
| Mới | `repetitions == 0 && lapses == 0` |
| Đang học | không mới và `interval < 21` |
| Chín | `interval >= 21` ngày |
| Đến hạn | `due <= now` |

### Độ thành thạo — `mastery()`

`mastery` là một con số 0–1 suy **chỉ từ lịch ôn**, dùng để trả lời câu hỏi khác hẳn
câu hỏi mà điểm làm bài trả lời: *thẻ này đã nhớ được lâu dài chưa?*

```
nền tảng = interval / (interval + 21)      # 0 ngày ⇒ 0, 21 ngày ⇒ 0.5
phạt     = 1 − 0.5 × lapses / (lapses + 3)
mastery  = nền tảng × phạt                 # làm tròn 4 chữ số
```

Ba tính chất được chọn có chủ ý:

1. **Đơn điệu theo `interval`** — ôn được khoảng càng dài thì càng chắc. Có test.
2. **Không dùng hàm siêu việt** — không `exp`/`ln`, nên kết quả không phụ thuộc thư
   viện toán của nền tảng và luôn xác định.
3. **Một lần làm bài không đổi được nó** — `with_attempt` không đụng `interval`,
   `lapses`, `due`; một lần trả lời đúng nhanh không chứng minh đã nhớ dài hạn, còn
   một lần gõ nhầm không xoá được khoảng ôn đã tích luỹ. Điều này được kiểm bằng
   test (`mastery_ignores_a_single_quiz_attempt`).

Ngưỡng "đã thành thạo" là `mastery >= 0.5` (`is_mastered`).

### "Chưa thuộc" — `weak_reason`

Lý do được suy ra từ **dữ liệu học tập thật**, không phải phỏng đoán:

| Giá trị | Điều kiện |
|---|---|
| `rating` | `last_rating` là `again` hoặc `hard` |
| `quiz` | `last_wrong_at` có giá trị |
| `null` | Thẻ không yếu |

Thứ tự kiểm tra có ý nghĩa: `rating` được xét trước `quiz`. Thẻ vừa bị chấm `again`
và cũng từng làm sai bài kiểm tra thì lý do hiển thị là `rating`.

### Vì sao `last_wrong_at` không bị `schedule` xoá

`schedule()` sao chép nguyên `last_wrong_at` từ trạng thái cũ sang trạng thái mới.
Nếu bị xoá, thẻ sẽ "tự khỏi" sau lần chấm điểm đầu tiên và dấu làm sai trở nên vô
nghĩa.

## 3. Chế độ hỏi — `Quiz`

Mỗi bộ thẻ khai báo một chế độ, quyết định mặt nào là câu hỏi:

| `Quiz` | Câu hỏi (prompt) | Đáp án hợp lệ |
|---|---|---|
| `meaning` | `front` (nghĩa tiếng Việt) | `back`, `furigana`, `romaji` |
| `reading` | `back` (chữ Nhật) | `front` (nghĩa tiếng Việt) |

### Đáp án hợp lệ

Một thẻ có thể khai nhiều cách viết, phân tách bằng `/` hoặc `|`:

```
back: "学生/がくせい"
```

→ hai đáp án hợp lệ, cùng loại `kanji`.

`answers_for` sinh danh sách theo thứ tự: phần chính (`kanji`), rồi `furigana`, rồi
`romaji`.

### So khớp — năm kết luận, bốn mức điểm

Chuẩn hoá trước khi so: quy full-width về ASCII → gộp khoảng trắng → cắt hai đầu.

Thuật toán xét theo thứ tự và **dừng ở nhánh đầu tiên khớp** (kết quả vì thế là xác
định: cùng đầu vào + cùng cấu hình ⇒ cùng kết luận):

| # | Điều kiện | Kết luận | Điểm | Tính là đúng? |
|---|---|---|---|---|
| 1 | Bỏ trống (sau chuẩn hoá) | `empty` | 0.0 | Không |
| 2 | Khớp đáp án khai báo (romaji không phân biệt hoa/thường) | `exact` | 1.0 | Có |
| 3 | Hệ chữ Latin, chỉ khác **hoa/thường** | `exact` | 1.0 | Có |
| 4 | Hệ chữ Latin, chỉ khác **dấu** (và `accent_tolerant`) | `accepted` | 0.9 | Có |
| 5 | Sai chính tả trong ngưỡng (và `allow_typos`) | `near` | 0.5 | **Không** |
| 6 | Còn lại | `wrong` | 0.0 | Không |

**Vì sao dấu tiếng Việt được chấp nhận, khác với quy tắc cũ.** Bản đầu tiên coi
"học" và "hoc" là hai câu trả lời khác nhau. Nhưng người Việt gõ thiếu dấu là chuyện
thường ngày trên bàn phím điện thoại, nên quy tắc đó trừng phạt tay gõ chứ không
phải kiến thức: đo trên bộ dữ liệu có nhãn (39 ca, `crates/midori-core/tests/answer-scoring.rs`)
thuật toán cũ báo sai 3 ca mà một người chấm công bằng sẽ chấp nhận, còn thuật toán
mới báo sai 0 ca, với **precision không đổi** (không ca nào bị chấp nhận oan).

Kết luận `accepted` vẫn **thấp hơn** `exact`, nên "gõ thiếu dấu" không bị trộn lẫn với
"đúng hoàn toàn" trong số liệu tổng hợp — đó là việc của `score`.

**Vì sao `near` KHÔNG được tính là đúng.** Mục đích của chế độ làm bài là kiểm tra khả
năng nhớ lại. Cho nửa điểm vào tín hiệu "chưa thuộc" sẽ làm loãng đúng cái bộ lọc mà
nó phục vụ. Nó vẫn được nhận ra và nói rõ cho người học (`gần đúng — xem chính tả`),
nhưng không xoá dấu sai.

**Ngưỡng sai chính tả** phụ thuộc độ dài (khoảng cách Levenshtein trên chuỗi đã bỏ
dấu): `0` ký tự cho chuỗi ≤ 3, `1` cho ≤ 7, `2` cho dài hơn. Ở từ 3 ký tự, lệch một
ký tự thường là từ KHÁC (`ba` / `bo`), không phải gõ nhầm.

**Cấu hình.** `AnswerConfig { accent_tolerant, allow_typos }`, mặc định **bật cả
hai**. Cấu hình là một phần đầu vào của thuật toán, không phải biến ẩn; gọi
`quiz_score` với cấu hình tắt cả hai chính là hành vi của bản trước 1.0.3.

**Tương thích dữ liệu lịch sử.** Điểm số không được lưu ở bất kỳ đâu trước 1.0.3, nên
không có điểm cũ nào bị diễn giải lại theo thuật toán mới. `last_wrong_at` giữ nguyên
ý nghĩa và cách ghi; trường mới `last_score` chỉ được thêm vào, và bản ghi cũ đọc ra
vẫn vắng nó (xem mục 2 và `docs/verification.md`).

Câu trả lời sai trả về `reference` — danh sách đáp án tham khảo để giao diện hiển thị.

## 4. Làm bài kiểm tra tách khỏi luyện SRS

Hai chế độ học chia sẻ cùng dữ liệu thẻ nhưng **không** chia sẻ tác động lên lịch:

| | Chế độ lật thẻ | Chế độ tự trả lời |
|---|---|---|
| Gọi | `srs_schedule` | `card_mark_quiz` |
| Đổi `srs`? | Có — dời lịch | **Không** |
| Đổi `last_wrong_at`? | Không | Có, khi trả lời sai |
| Ảnh hưởng bộ lọc "Chưa thuộc"? | Qua `rating` | Qua `quiz` |

Lý do tách: làm sai một câu kiểm tra nhanh không có nghĩa là người học đã quên thẻ
đó. Trộn hai tín hiệu này sẽ khiến lịch ôn bị kéo lệch bởi những lần làm bài vội.

`card_mark_quiz` nhận cả mảng thẻ và trả về cả mảng — một lần vượt biên cho toàn bộ
phiên, không phải mỗi câu một lần.

## 5. Schema lưu trữ

### Database `midori` — dữ liệu người dùng (`src/storage/db.ts`)

Phiên bản `2`. Chỉ dữ liệu **thuộc về người học** nằm ở đây.

| Store | Khoá | Kiểu giá trị | Index |
|---|---|---|---|
| `cards` | `id` (keyPath) | `Card` | `by-deck` trên `deckId` |
| `meta` | string | bất kỳ | — |
| `recovery` | auto-increment | `RecoveryRecord` (khóa gốc, bản ghi thô, mã/lý do, thời điểm) | — |

Khoá meta (`META_KEYS`):

| Khoá | Nội dung |
|---|---|
| `settings` | Cài đặt giao diện và phiên học |
| `deckNames` | Tên hiển thị của các bộ thẻ |
| `contentCardIds` | Id thẻ thuộc phiên bản nội dung đang dùng |
| `contentVersion` | Phiên bản nội dung đã đồng bộ vào thư viện |
| `session` | Phiên học đang dở |
| `screen` | Màn hình đang mở |

Session có `focus: "due" | "weak"` để khôi phục lựa chọn luồng học cùng hàng đợi;
record cũ không có trường này được đọc như `"due"`.

`contentCardIds` và `contentVersion` là phần **sổ sách** để `content_reconcile` biết
thẻ nào do nội dung quản lý, thẻ nào do người dùng tạo. Không có chúng thì lần cập
nhật sau sẽ không phân biệt được hai loại và sẽ ghi đè thẻ người dùng tự làm.

Khi `cardsNormalize` từ chối bản ghi, `loadCards` chuyển bản ghi nguyên trạng cùng
khóa IndexedDB, mã lỗi và lý do sang `recovery`, rồi xóa khóa trong **cùng giao
dịch readwrite**. Nếu ghi hồ sơ phục hồi lỗi, giao dịch bị hủy và bản ghi tại `cards`
được giữ lại. Màn hình chính hiển thị số hồ sơ và cho tải JSON `midori-recovery-records`
để lưu/điều tra; đây là xuất dữ liệu cứu hộ, không phải tự động nhập lại một bản ghi
hỏng vào thư viện.

### Nguồn nội dung xuất bản

`scripts/content-validation.mjs` kiểm tra nguồn `content/` trước khi builder sinh
bundle hoặc seed. ID phải duy nhất trên mọi bundle; source path phải nằm dưới
`content/`; `furigana`/`romaji`, tags, `lesson`, quiz và cách gán `deckId` phải phù
hợp schema. Vocabulary yêu cầu `lesson` 1–50; mẫu câu được phép chưa gắn bài để
coverage audit nêu rõ phần còn thiếu (bộ phát hành hiện tại đã gắn đủ 50 bài); bundle
`kanji-*` dùng quiz `reading`, cần furigana và không nhận số bài Minna. Metadata
category chi tiết chưa có trong schema nên không thể xác thực tên bảy nhóm.

Validator chạy trước bước ghi output và dùng cùng logic với `npm run content:audit`.
Các quy tắc này chặn lỗi hình dạng/định tuyến, không xác minh ngữ nghĩa Nhật–Việt,
độ đầy đủ giáo trình hoặc giấy phép. Những điểm đó cần quy trình biên tập riêng.

### Backup cá nhân — JSON có phiên bản

File cá nhân dùng `format: "midori-personal-backup"` và `version: 1`, tách khỏi định
dạng bộ thẻ chia sẻ (`deckExport`). Backup chứa thẻ, cài đặt, mốc đồng bộ nội dung và
màn hình; lựa chọn **có tiến độ** thêm `srs` cho từng thẻ và phiên học đang dở. Chọn
**không có tiến độ** loại bỏ cả `srs` lẫn phiên học và đặt màn hình restore về Home,
tránh mở thẳng Study mà không có phiên. Restore kiểm tra định dạng,
phiên bản, các trường thẻ, id trùng, SRS, cài đặt, metadata và phiên học trước khi
gọi `replaceUserLibrary`.

`replaceUserLibrary` thay `cards` và các meta liên quan trong một giao dịch giữa hai
object store. Lỗi đồng bộ ở bất kỳ request nào hủy giao dịch, giữ thư viện cũ. Phiên
học được lưu theo id; khi boot, luồng khôi phục hiện có đối chiếu lại với thư viện.
Phiên trên 12 giờ bị bỏ, nhưng SRS của thẻ vẫn được giữ. File không chứa hồ sơ
`recovery` hoặc nội dung đã cache; người dùng cần xuất riêng dữ liệu cứu hộ và nội
dung có thể tải/cài lại.

Sau transaction restore, app ép reconciliation với bundle nội dung đang hoạt động,
kể cả khi version giống nhau; đây là transaction thứ hai. Nếu nó lỗi, backup vừa
restore vẫn nguyên vẹn và app báo lỗi đồng bộ cùng đường retry — không tuyên bố
rollback backup đã xảy ra.

Đây là JSON rõ (không mã hóa, không có mật khẩu): người dùng cần lưu file ở nơi an
toàn vì nó có thể chứa dữ liệu học cá nhân.

### Database `midori-content` — nội dung xuất bản (`src/content/store.ts`)

Phiên bản `1`. Một store duy nhất `slots`, khoá là tên ngăn:

| Ngăn | Vai trò |
|---|---|
| `active` | Nội dung đang dùng để học |
| `staging` | Đã tải và xác minh, chưa kích hoạt |
| `previous` | Bản `active` trước lần kích hoạt gần nhất — để phục hồi |

`promote()` chạy trong **một giao dịch IndexedDB**: `staging → active`,
`active cũ → previous`, xoá `staging`. Giao dịch IndexedDB là nguyên tử, nên không
tồn tại trạng thái nội dung cũ đã mất mà nội dung mới chưa sẵn sàng.

## 6. Di trú bản ghi

Di trú **không** nằm ở lớp lưu trữ. Mọi bản ghi đọc lên đều đi qua
`card_normalize` / `cards_normalize`, và hàm này chịu được dữ liệu cũ hoặc thiếu
trường:

| Dữ liệu vào | Kết quả |
|---|---|
| `reading` (trường cũ của Mitsuha) | Tách thành `furigana` / `romaji` dựa trên hệ chữ |
| Thiếu `deckId` | `"vocabulary"` |
| Thiếu `tags` | `[]` |
| Thiếu `srs` | Trạng thái thẻ mới |
| Trường lạ | Bỏ qua |
| `lesson` ngoài 1..=50 | `None` |

Nhờ vậy **không cần script di trú**: đọc lên là tự đúng. Đánh đổi: chuẩn hoá chạy lại
mỗi lần nạp (một lần cho cả thư viện, theo lô), thay vì một lần ghi.

Nâng `midori` từ v1 lên v2 chỉ tạo store `recovery`; không xóa hoặc viết lại dữ liệu
v1 trong bước upgrade. Việc chuẩn hóa/quarantine chạy sau khi ứng dụng đọc thư viện.

Quy tắc đọc `reading` cũ: nếu giá trị là **kana thuần** → `furigana`, ngược lại →
`romaji`. Mitsuha có hai quy tắc khác nhau ở hai đường đọc dữ liệu; Midori hợp nhất
thành một. Với dữ liệu thật của cả hai dự án, kết quả không đổi.

### Khi nào phải tăng phiên bản schema

Tăng `USER_DB_VERSION` hoặc `CONTENT_DB_VERSION` chỉ khi **thêm store hoặc index**.
Thay đổi hình dạng bản ghi thì để `card_normalize` lo — nhờ đó người dùng không phải
chịu một bước di trú có thể thất bại giữa đường.
