# Hợp đồng Rust ↔ JavaScript

Tài liệu này định nghĩa **giao diện duy nhất** giữa lõi nghiệp vụ Rust và lớp ứng
dụng JavaScript. Mọi thay đổi ở đây là thay đổi phá vỡ tương thích và phải cập nhật
`tests/wasm-contract.test.ts`.

## 1. Hình dạng phong bì

Mọi hàm vượt biên WASM nhận và trả về **một chuỗi JSON**. Không có ngoại lệ, kể cả
hàm chỉ trả về một boolean.

```jsonc
// Thành công
{ "ok": true, "data": <giá trị> }

// Thất bại
{ "ok": false, "error": { "code": "…", "message": "…", "detail": "…" } }
```

| Trường | Kiểu | Vai trò |
|---|---|---|
| `ok` | boolean | Phân biệt nhánh, không cần thử `data` rồi đoán |
| `data` | bất kỳ | Chỉ có khi `ok === true` |
| `error.code` | string | **Ổn định** — JS dùng để rẽ nhánh logic. Không đổi tuỳ ý |
| `error.message` | string | Tiếng Việt, hiển thị được cho người dùng |
| `error.detail` | string? | Ngữ cảnh kỹ thuật, chỉ để gỡ lỗi |

### Vì sao dùng chuỗi JSON chứ không dùng `serde-wasm-bindgen`

1. **Kiểm thử được ở native.** Hợp đồng giống nhau ở cả `cargo test` và trong
   trình duyệt — không có nhánh mã nào chỉ chạy được trên WASM.
2. **Một quy tắc lỗi duy nhất.** JS chỉ cần một hàm bóc phong bì
   (`src/core/envelope.ts`), không cần xử lý `Result`/`JsValue`/`panic` riêng lẻ.
3. **Không thêm dependency.** `serde_json` đã cần cho việc đọc file; dùng luôn cho
   biên giới.

Đánh đổi đã chấp nhận: tốn một lần `JSON.parse` mỗi lần gọi. Với các hàm trả về tập
dữ liệu lớn (thư viện thẻ, thống kê), chi phí này nhỏ hơn nhiều so với nhiều lần
gọi xuyên biên.

### Quy tắc gọi

- **Gọi theo lô, không gọi từng phần tử.** `cardsNormalize` nhận một mảng, không
  phải `cardNormalize` gọi trong vòng lặp. Đó là lý do cả hai hàm cùng tồn tại.
- **WASM tải một lần, dùng nhiều lần.** `loadCore()` khởi tạo một lần rồi trả về
  đối tượng để tái sử dụng. Nạp lại là lỗi lập trình.
- **Mọi hàm là `async` ở lớp JS**, kể cả hàm đồng bộ trong Rust. Chúng có thể phải
  chờ lần nạp WASM đầu tiên.

## 2. Danh sách hàm (29)

Trích từ `src/generated/midori-wasm/midori_wasm.d.ts` — đây là danh sách mà
`tests/wasm-contract.test.ts` đối chiếu tự động.

### SRS — `srs.rs`

| Hàm | Vào | Ra | Ghi chú |
|---|---|---|---|
| `srs_new` | `now` | `SrsState` | Thẻ mới: `ease 2.5`, `interval 0`, `due = now` |
| `srs_schedule` | `srs`, `rating`, `now` | `SrsState` | Chấm điểm, trả lịch mới. Hàm **thuần** — không sửa tham số |
| `srs_is_due` | `srs`, `now` | `bool` | `due <= now` |
| `srs_is_new` | `srs` | `bool` | Chưa từng học |
| `srs_is_mature` | `srs` | `bool` | `interval >= 21` ngày |
| `srs_weak_reason` | `srs` | `"rating" \| "quiz" \| null` | Vì sao thẻ nằm trong "Chưa thuộc" |
| `srs_mastery` | `srs` | `number` | Độ thành thạo dài hạn 0–1, suy từ lịch ôn. Xem `docs/data-model.md` |
| `srs_is_mastered` | `srs` | `bool` | `mastery >= 0.5` |
| `srs_preview` | `srs`, `now` | `{ again, hard, good, easy }` | Khoảng ôn của cả bốn mức trong MỘT lần vượt biên. Thay cho bốn lần gọi `srs_schedule` ở màn Học |

### Thẻ — `card.rs`

| Hàm | Vào | Ra | Ghi chú |
|---|---|---|---|
| `card_normalize` | `raw`, `now` | `Card` | Bản ghi cũ / thiếu trường → `Card` hợp lệ |
| `cards_normalize` | `raw[]`, `now` | `Card[]` | Bản theo lô. Dùng cái này khi nạp thư viện |
| `card_make` | `draft`, `now` | `Card` | Tạo thẻ từ bản nháp, chưa có id |
| `cards_make` | `draft[]`, `now` | `Card[]` | Bản theo lô |
| `card_apply_draft` | `card`, `draft` | `Card` | Sửa nội dung, **giữ nguyên** id và SRS |
| `card_mark_quiz` | `card`, `correct`, `now` | `Card` | Ghi dấu làm bài, **không** đổi lịch SRS |
| `card_mark_attempt` | `card`, `correct`, `score`, `now` | `Card` | Như trên, kèm ĐIỂM của lần trả lời. Điểm bị kẹp về [0,1] |

### Nhập / xuất — `import.rs`, `export.rs`

| Hàm | Vào | Ra | Ghi chú |
|---|---|---|---|
| `deck_parse` | `text`, `format` | `{ name, cards: CardDraft[], skipped }` | `format`: `json` \| `csv` \| `tsv`. `skipped` = số BẢN GHI có trong file nhưng không đọc thành thẻ được (thiếu mặt thẻ/mặt nghĩa) — màn Nhập/xuất dùng nó để nói trước khi ghi |
| `deck_plan_import` | `existing[]`, `incoming[]` | `ImportPlan` | Chia thành `added` / `skipped` (trùng) |
| `deck_export` | `cards[]`, `format` | `string` | Nội dung file xuất, sẵn sàng tải về |

### Thống kê / truy vấn — `stats.rs`

| Hàm | Vào | Ra |
|---|---|---|
| `deck_stats` | `cards[]`, `now`, `quiz` | `DeckStats` — tổng thể + `byDeck` |
| `cards_filter` | `cards[]`, `filter`, `now` | `Card[]` |
| `lesson_summary` | `cards[]`, `now` | `LessonInfo[]` — đúng 50 phần tử, bài 1–50 |

`DeckStats` lẫn mỗi mục của `byDeck` (`DeckCount`) dùng cùng một nghĩa trường:

| Trường | Nghĩa |
|---|---|
| `total` | Tổng số thẻ |
| `new` | Chưa từng học (`repetitions == 0 && lapses == 0`) |
| `learning` | Đang học — đã học nhưng chưa nhớ lâu |
| `mature` | Nhớ lâu — `interval >= 21` ngày |
| `due` | `due <= now` |
| `weak` | Chưa thuộc, theo `srs_weak_reason` |
| `weakRating` | Trong `weak`: lần tự chấm gần nhất là Again/Hard |
| `weakQuiz` | Trong `weak`: làm sai ở chế độ Làm bài (không có dấu tự chấm yếu) |
| `mastery` | Trung bình `srs_mastery`, 0–1, làm tròn 4 chữ số |
| `mastered` | Số thẻ `mastery >= 0.5` |
| `accuracy` | Trung bình điểm lần làm bài gần nhất, chỉ trên các thẻ đã làm bài |
| `graded` | Số thẻ đã từng làm bài — mẫu số của `accuracy`. `0` = chưa có dữ liệu |

Riêng `DeckStats` còn có `quizzable` (số thẻ hỏi được ở chế độ `quiz` truyền vào —
phụ thuộc chế độ hỏi chứ không thuộc trạng thái ôn của thẻ) và `byDeck` (khoá là
`deckId`, sắp theo tên ổn định).

`LessonInfo` có `n`, `label`, `count`, `due`, `new`, `learning`, `mature`, `weak`,
`weakRating`, `weakQuiz`, `mastery`, `mastered`, `accuracy`, `graded` — cùng nghĩa
như trên, riêng `count` là tên cũ của `total`, giữ để tương thích. Bài chưa có thẻ
vẫn xuất hiện với mọi trường bằng 0.

Hai bất biến đáng nhớ:

- `weakRating + weakQuiz == weak` (thẻ yếu cả hai lý do xếp vào `weakRating`).
- `deck_stats` và `lesson_summary` dùng chung một bộ đếm trong lõi, nên con số theo
  bài không thể lệch khỏi con số toàn thư viện; lớp giao diện không được tự đếm.

### Phiên học — `session.rs`

| Hàm | Vào | Ra | Ghi chú |
|---|---|---|---|
| `session_shuffle` | `ids[]`, `seed` | `string[]` | Trộn **xác định** theo seed — cùng seed cho cùng thứ tự |
| `quiz_prompt` | `card`, `quiz` | `string` | Câu hỏi của thẻ (mặt tiếng Việt hoặc mặt chữ Nhật, tuỳ `quiz`) |
| `quiz_check` | `input`, `card`, `quiz` | `AnswerCheck` | `{ correct, matched?, reference, score, verdict }` với cấu hình mặc định |
| `quiz_score` | `input`, `card`, `quiz`, `config` | `AnswerCheck` | Như trên, nhận cấu hình (`accentTolerant`, `allowTypos`). Cùng vào + cùng cấu hình ⇒ cùng kết quả |

### Đồng bộ nội dung — `content.rs`

| Hàm | Vào | Ra | Ghi chú |
|---|---|---|---|
| `content_reconcile` | `library[]`, `content[]`, `previous_ids[]`, `deck_id`, `now` | `ReconcileResult` | `{ updated, fresh, orphaned, unchanged }` |

`content_reconcile` chạm vào dữ liệu người học, nên nó có hợp đồng chặt nhất:

- `updated` chỉ đổi **nội dung hiển thị** (`front`, `back`, `furigana`, `romaji`,
  `tags`, `lesson`, `deckId`). `srs`, `id`, `createdAt` giữ nguyên tuyệt đối.
- `orphaned` là **thông tin**, không phải mệnh lệnh xoá. Không có hàm nào trong lõi
  xoá thẻ do nội dung biến mất.
- Thẻ người dùng tự tạo không bao giờ xuất hiện trong cả ba danh sách.

## 3. Lỗi

Mã lỗi ổn định, định nghĩa ở `crates/midori-core/src/error.rs`:

| Mã | Nghĩa | JS nên làm gì |
|---|---|---|
| `invalid_json` | Chuỗi vào không phải JSON hợp lệ | Lỗi lập trình — hiển thị `detail` khi gỡ lỗi |
| `invalid_argument` | Tham số sai (ví dụ `rating` lạ, `ids` rỗng) | Lỗi lập trình — `detail` ghi rõ tham số nào |
| `invalid_record` | Bản ghi thiếu trường bắt buộc (id, mặt thẻ…) | Hiển thị `message`; với thư viện thì cách ly bản ghi |
| `unsupported_format` | Đuôi file không phải `.json`/`.csv`/`.tsv` | Hiển thị `message` cho người dùng |
| `empty_input` | File/chuỗi rỗng, không có gì để xử lý | Hiển thị `message` cho người dùng |
| `no_valid_records` | Đã đọc được file nhưng không có bản ghi hợp lệ nào | Hiển thị `message`; giữ nguyên thư viện |

Quy tắc: **JS rẽ nhánh theo `code`, hiển thị `message`.** Không so khớp chuỗi
`message` để suy ra loại lỗi — `message` có thể đổi bất cứ lúc nào.

## 4. Kiểm chứng hợp đồng

`tests/wasm-contract.test.ts` (40 test) chạy mô-đun WASM **thật** trong Node, không
phải bản mô phỏng. Nó bắt những lỗi mà `cargo test` không thể thấy:

- Hàm bị đổi tên khi sinh WASM (`#[wasm_bindgen]` sai tên).
- Tên trường JSON lệch giữa `serde` và TypeScript.
- Phong bì sai hình dạng ở một hàm cụ thể.
- Hàm có trong `.d.ts` nhưng không có ở runtime, hoặc ngược lại.

**Một test tự đối chiếu danh sách hàm trong `.d.ts` sinh ra với hàm thật có ở
runtime.** Nhờ đó, quên thêm hàm mới vào lớp JS sẽ bị phát hiện.

### Khi thêm một hàm mới

1. Viết hàm trong `midori-core` kèm test đơn vị Rust.
2. Thêm hàm vào `crates/midori-core/src/api.rs` (hợp đồng chuỗi JSON).
3. Thêm `#[wasm_bindgen]` tương ứng trong `crates/midori-wasm/src/lib.rs`.
4. Thêm hàm có kiểu vào `src/core/index.ts`.
5. Thêm test vào `tests/wasm-contract.test.ts`.
6. Thêm kiểu vào `src/core/types.ts` nếu có kiểu mới.
7. Chạy `npm run check`.

Bỏ qua bước 2 hoặc 5 là nguyên nhân phổ biến nhất của lỗi "chạy trên máy tôi thì
được". Quy trình này tồn tại chính vì lý do đó.
