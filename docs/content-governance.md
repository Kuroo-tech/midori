# Quản trị nguồn và kiểm duyệt nội dung

## Trạng thái đã xác minh

Các collection mặc định trong `content/` đang rỗng và không khai báo nguồn tham
chiếu, ấn bản, giấy phép hoặc người kiểm duyệt. Không thể xác minh quyền phân phối
hay mức độ đối chiếu giáo trình từ mã nguồn hiện có. Người dùng tự quản lý dữ liệu
họ thêm; không được diễn đạt các collection như đã bao phủ giáo trình hoặc taxonomy
Kanji hoàn chỉnh.

Không bổ sung nội dung giáo trình mới cho tới khi nguồn và quyền sử dụng được xác
nhận. Không sao chép nội dung có bản quyền từ sách/thư viện bên ngoài; chỉ dùng nội
dung được tạo độc lập có kiểm duyệt hoặc nguồn có giấy phép cho phép đúng mục đích
phân phối của Midori.

## Điều kiện trước khi thêm hoặc sửa bundle

Với mỗi bundle, ghi vào `content/content.json`:

- nguồn cụ thể và phiên bản/ấn bản;
- URL hoặc thông tin xuất bản đủ để người khác truy nguyên;
- giấy phép và phạm vi quyền phân phối (hoặc ghi rõ do nhóm tự biên soạn);
- ghi chú về attribution/điều kiện sử dụng nếu giấy phép yêu cầu.

Không đưa thông tin giả định vào metadata để làm build xanh. Nếu quyền chưa rõ, dừng
phát hành bundle đó và yêu cầu chủ sở hữu sản phẩm/pháp lý xác nhận.

## Quy trình biên tập

1. Xác nhận nguồn, giấy phép, phạm vi và attribution trước khi nhập dữ liệu.
2. Gán `id` ổn định, bundle, quiz và bài/danh mục dựa trên nguồn đã duyệt. Không đổi
   ID của thẻ đang tồn tại để tránh tách tiến độ học.
3. Chạy `npm run content:audit`, `npm run check` và `npm run build`; validator chặn
   lỗi schema trước khi sinh bất kỳ bundle nào.
4. Người biên tập kiểm tra chéo nghĩa tiếng Việt, chữ Nhật, furigana, romaji, bài và
   nhóm Kanji; automated validation không thay thế phán đoán sư phạm/ngôn ngữ.
5. Một reviewer khác xác nhận thay đổi và quyền phân phối. Ghi rõ người/nguồn/phạm vi
   trong metadata hoặc quy trình phát hành của dự án.
6. Cập nhật `docs/content-coverage.md` từ kết quả báo cáo và nêu chính xác phần còn
   thiếu; không gọi một lesson/category “hoàn thành” chỉ vì có một thẻ.

## Quyết định taxonomy còn thiếu

Mục tiêu yêu cầu bảy nhóm Kanji nhưng repository hiện chỉ có `kanji-noun`, và không
có danh sách tên/định nghĩa bảy nhóm. Không suy luận sáu tên còn lại từ cấu trúc
hiện tại. Trước khi thiết kế bộ lọc nhóm Kanji hoàn chỉnh, cần chủ sở hữu sản phẩm
chọn một taxonomy có nguồn và quy tắc phân loại; tới lúc đó coverage chỉ đếm nhóm
theo `kanji-*` deckId và báo phần thiếu.

Collection Mẫu câu mặc định rỗng; ứng dụng vẫn giữ sẵn cấu trúc các bài 1–50.
Validator yêu cầu mỗi thẻ Mẫu câu được thêm vào phải khai báo `lesson` chính xác;
UI không được suy ra bài từ thứ tự file hoặc tên thẻ.
