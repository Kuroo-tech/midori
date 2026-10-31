# Báo cáo độ phủ nội dung

Phạm vi mục tiêu được xác định cho giai đoạn này:

- Từ vựng Minna no Nihongo: các bài 1–50.
- Mẫu câu Minna no Nihongo: các bài 1–50.
- Kanji: bảy nhóm; tên và nội dung từng nhóm phải lấy từ taxonomy/tài liệu có
  nguồn, không tự đặt.

Đây là mục tiêu kiểm kê, không phải tuyên bố rằng Midori có quyền phân phối hoặc đã
đối chiếu đầy đủ toàn bộ giáo trình.

## Ảnh chụp nguồn hiện tại

Được tính từ `content/content.json` và các bundle được tham chiếu, bằng
`npm run content:audit`:

- Nội dung phiên bản `2026.10.29.1`: **0 thẻ mặc định, 3 collection rỗng**.
- Từ vựng: **0 thẻ**; các bài 1–50 được giữ làm cấu trúc để người dùng tự thêm.
- Mẫu câu: **0 thẻ**; đủ 50 bài vẫn tồn tại làm collection rỗng để người dùng tự thêm.
- Kanji: **1/7 collection theo `deckId`**, `kanji-noun` rỗng. Sáu tên nhóm còn lại
  chưa được khai báo; không suy đoán tên.
- Nguồn tham chiếu và giấy phép không có trong metadata của các gói. Quyền phân phối
  do đó **chưa được xác minh**.

Đếm bài nghĩa là có ít nhất một card mang `lesson` tương ứng, không phải độ phủ của
từng mục từ trong sách. Tổng card cũng không đo tính chính xác ngôn ngữ, đầy đủ của
bài, hay chất lượng sư phạm.

## Tình trạng kiểm định

`npm run generate` chạy cùng validator dùng bởi `npm run content:audit` trước khi
ghi các gói sinh ra. Validator hiện kiểm tra:

- `schemaVersion`, bundle/deck/source tham chiếu, quiz hợp lệ và đường dẫn bundle
  nằm trong `content/`;
- `id`, `front`, `back`, các trường tùy chọn đúng kiểu và ID duy nhất trên toàn bộ
  bundle;
- `furigana` chỉ chứa kana/dấu phân cách tiếng Nhật; `romaji` chỉ chứa chữ Latin,
  số và dấu phân cách;
- `lesson` là số nguyên 1–50; vocabulary phải có bài; Kanji dùng quiz `reading`,
  cần furigana và không được gắn số bài Minna;
- quiz/lesson/deckId nhất quán cho các bundle `vocabulary`, `patterns`, `kanji-*`.

Mỗi thẻ Từ vựng và Mẫu câu do người dùng thêm phải có `lesson` từ 1 đến 50;
collection rỗng không yêu cầu bản ghi nào. Các ký tự kana half-width, ruby markup
hoặc lối ghi furigana phức tạp chưa được hỗ trợ sẽ bị từ chối để người biên tập rà
soát, không bị sửa âm thầm.

## Tái tạo báo cáo

```bash
npm run content:audit
```

Báo cáo được ghi ra stdout và không thay đổi bundle, seed hoặc file nội dung. Test
fixture của validator/builder chạy qua `node --test tests/build-content.test.ts`.
Chi tiết về nguồn và kiểm duyệt nằm trong [content-governance.md](content-governance.md).
