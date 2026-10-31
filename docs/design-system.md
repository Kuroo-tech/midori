# Hệ thống thiết kế và quy ước tương tác

## Nguyên tắc

- **Material làm nền tảng:** bố cục một cột dễ đọc, thứ bậc tiêu đề rõ, bề mặt
  phân tầng bằng màu/viền, điều khiển có phản hồi và focus bàn phím nhìn thấy được.
- **Liquid Glass có chọn lọc:** chỉ dùng cho điều hướng dưới. Thẻ nội dung, biểu mẫu
  và nút hành động giữ nền đặc, độ tương phản ổn định.
- Không thêm framework UI/CSS hoặc thư viện chuyển động khi CSS và Svelte hiện tại
  đáp ứng được nhu cầu.
- **Một chức năng, một chỗ:** mỗi mục điều hướng dưới sở hữu một vùng chức năng
  riêng, và màn con thuộc trọn về mục đã mở nó (`SECTION_OF` trong `src/app/screen.ts`).
  Không có lối tắt chéo mục: muốn học thì vào Học, muốn đồng bộ nội dung thì vào
  Cài đặt, muốn chuyển dữ liệu thì vào Nhập/xuất — mỗi việc chỉ có MỘT đường.

## Tokens và bề mặt dùng chung

`src/app.css` là nguồn token dùng chung:

| Vai trò | Token / quy ước |
|---|---|
| Nền và phân tầng | `--bg`, `--surface`, `--surface-2`, `--surface-3`, `--surface-container*` |
| Nội dung và trạng thái | `--text`, `--muted`, `--accent*`, `--danger*`, `--ok`, `--warn*` |
| Chữ nhấn trên surface sáng | `--accent-strong` — dùng thay `--accent` cho chữ nhỏ; `--accent` chỉ đạt ~3,2:1 trên `--surface-2`, còn token này đạt ≥ 4,5:1 ở cả hai theme |
| Hình khối | `--radius-*`, `--nav-height` |
| Nổi | `--shadow-*` |
| Chuyển động | `--dur-*`, `--ease-*` |

Theme sáng/tối thay token qua `:root[data-theme]`; component không tự định nghĩa
bảng màu riêng. Lớp `.card`, `.btn`, `.field`, `.notice`, `.nav` dùng chung cấu
trúc và trạng thái cơ bản. `.surface-panel` là bề mặt kính dùng lại cho panel nổi,
có nền đặc khi không hỗ trợ `backdrop-filter` hoặc người dùng yêu cầu giảm độ trong
suốt.

## Điều hướng và phản hồi

- Điều hướng chính là `nav` có nhãn; tab hiện hành dùng `aria-current="page"`.
- Trạng thái tương tác dùng nhãn và hình dạng, không chỉ dựa vào màu.
- Mọi phần tử tương tác phải có tên truy cập được và focus-visible rõ.
- Trang chủ ưu tiên HÀNH ĐỘNG: hero chọn đúng một trong sáu trạng thái theo thứ tự
  phiên đang dở → thư viện trống → thẻ tới hạn → thẻ mới → thẻ chưa thuộc → đã ôn
  hết, mỗi trạng thái một nút chính. Ba chủ đề và thẻ Thư viện đứng sau; "Bộ khác"
  (bộ tự tạo/nhập) bấm mở Collection — mở Collection không phải bắt đầu phiên.
- Học theo bốn tầng: màn **Học** là danh mục (ba chủ đề, dùng chung
  `StudyCategories` với Trang chủ), tầng hai là danh sách (50 bài Minna cho Từ vựng
  và Mẫu câu, bảy nhóm Kanji), tầng ba là **Collection** — màn biết chính xác phạm
  vi của mình — và tầng bốn là phiên học. Phạm vi chọn là trạng thái bền vững
  (`app.collectionScope`, lưu trong IndexedDB); mở Collection không tự chạy phiên,
  và mọi đường bắt đầu phiên đều đi qua nút Bắt đầu của nó. Con số trên nút Bắt đầu
  và danh sách "Sẽ học" đi qua đúng bộ lọc `sessionFilter` mà phiên dùng — không
  thể lệch hàng đợi.
- Màn phiên học đặt tiến độ và nút “Thẻ tiếp theo” ở đầu nội dung, phía trên
  flashcard.
- **Nhập/xuất chia theo BA TÁC VỤ** — Nhập, Xuất, Sao lưu — trên một thanh chọn ở
  đầu màn; mỗi lúc chỉ một tác vụ hiện ra. Ba tác vụ dùng CHUNG một bộ chọn phạm vi
  (`TransferScope.svelte`): một bài hoặc toàn bộ từ vựng, một mục Kanji hoặc gói JSON
  nhiều mục. Bộ chọn đó là component DUY NHẤT cho cả nhập lẫn xuất, nên "Bài 12" có
  đúng một nghĩa. Nhập theo lô chỉ ghi sau khi mọi nhóm đã hợp lệ, và luồng là
  chọn phạm vi → chọn file → kiểm tra (chưa ghi) → xem trước → xác nhận → kết quả thật.
- Đổi tác vụ KHÔNG xoá phạm vi hay file đang chờ kiểm tra: thẻ Nhập hiện một dấu
  chấm khi còn file chờ, và đổi phạm vi thì file được KIỂM TRA LẠI thay vì bị bỏ —
  con số "sẽ thêm bao nhiêu thẻ" không bao giờ đứng cạnh một phạm vi nó không thuộc về.
- Bố cục hiện tại: nội dung tối đa 640px trên điện thoại, 780px từ 720px và 940px
  từ 1000px; Collection chia hai cột từ 900px; Home có bố cục riêng ở breakpoint
  của màn đó.

## Motion

- Chuyển động chỉ phản hồi thay đổi trạng thái: chuyển trang, lật thẻ,
  phản hồi thao tác.
- Dùng transform/opacity cho chuyển cảnh; tránh animation nền liên tục ngoài trạng
  thái chờ và skeleton.
- Chuyển trang theo CHIỀU điều hướng — đi tới trượt lên, quay lại trượt xuống
  (`pageFly` đọc `navDirection` từ store). Tab đang mở của thanh điều hướng được
  đánh dấu bằng MỘT viên trượt sang tab vừa chọn, không bật/tắt tại chỗ.
- Thanh chọn chủ đề ở Nhập/xuất dựng lại khối nội dung theo `{#key}` và trượt vào
  theo CHIỀU của mục vừa rời đi (±14px, 200ms qua `motionDuration`); chỉ dùng
  `in:` nên hai khối không cùng nằm trong luồng bố cục và trang không nhảy. Thanh
  chọn TÁC VỤ đứng trên thanh chọn CHỦ ĐỀ: chọn việc trước, chọn phạm vi sau, và
  cử chỉ vuốt ngang thuộc về thanh chọn chủ đề ở cả hai tác vụ. Cài đặt KHÔNG có
  thanh chọn: hai loại cập nhật là hai khối cạnh nhau (xem "Màn Cài đặt"), vì
  chúng độc lập và ít khi phải chuyển qua lại.
- Vùng mở rộng dùng `{#if}` + `aria-expanded`, không dùng `<details>` cho phần
  chứa NÚT: nút nằm trong khối `display: none` vẫn bị coi là "có mặt nhưng không
  chạm tới được", và `audit:layout` báo đúng như vậy. Chỉ dựng khi người dùng mở.
- Danh sách vào so le có trần (`staggerDelay` → `--rise-delay`). Số liệu thống kê
  đếm lên khi giá trị ĐỔI (`AnimatedNumber`), nhưng lần dựng đầu hiện ngay giá trị
  cuối — vòng đếm rAF sẽ lọt qua `settle()` của `audit:layout`.
- Khung xương chờ (`ScreenHost`, màn Học) tắt hẳn `shimmer` khi người dùng yêu cầu
  giảm chuyển động, không chỉ rút ngắn thời lượng.
- Hiệu ứng chạy bằng JS (transition của Svelte, `Tween`) không nằm dưới `@media`
  của CSS: mọi chỗ hỏi trạng thái giảm chuyển động qua `src/ui/motion.ts`, dùng lại
  một đối tượng `prefersReducedMotion` của Svelte.
- `prefers-reduced-motion: reduce` đưa token thời lượng về 1ms, ĐỘ TRỄ về 0 và giới
  hạn animation một lần. Độ trễ phải về 0 vì dàn so le dùng `backwards`: giữ độ trễ
  là nội dung còn đứng ẩn hết dải so le. Khối CSS này chỉ phủ hiệu ứng CSS; hiệu
  ứng JS tự trả `duration: 0` qua `motion.ts` (Svelte bỏ hẳn transition khi
  `duration` lẫn `delay` đều 0) — cần kiểm tra trong browser khi thêm loại chuyển
  cảnh mới, cách chạy ghi ở `docs/verification.md`.
- Không có thao tác thiết yếu chỉ dùng cử chỉ; nút và điều khiển native là đường
  thay thế bằng bàn phím/chạm.

## Thông báo theo mức kết luận

Thông báo chấm bài ở chế độ tự trả lời dùng ba sắc thái, mỗi sắc thái ứng với một
nhóm kết luận của lõi (`docs/data-model.md` §3) — người học phân biệt được bằng mắt
trước khi đọc chữ:

| Kết luận | Lớp | Biểu tượng | Nhãn |
|---|---|---|---|
| `exact` | `.notice-ok` | `check` | Đúng |
| `accepted` | `.notice-ok` | `sparkle` | Đúng — thiếu dấu |
| `near` | `.notice-warn` | `alert` | Gần đúng — xem chính tả |
| `wrong` | `.notice-danger` | `close` | Chưa đúng |
| `empty` | `.notice-danger` | `close` | Chưa trả lời |

`near` cố ý **không** dùng màu lỗi: nó là "đúng một phần", và tô đỏ nó sẽ dạy sai.
Thông báo mang `role="status"` để trình đọc màn hình đọc kết quả ngay khi có.

## Màn Cài đặt: phân cấp theo mục đích

Cài đặt không phải một biểu mẫu dài cũng không phải một chồng thẻ ngang cấp. Năm
nhóm theo đúng việc người dùng muốn làm, mỗi nhóm một kiểu bề mặt phù hợp với tần
suất dùng:

1. **Học tập** — ba thiết lập thay đổi thường xuyên, cùng một bề mặt phẳng, các
   hàng phân cách bằng `1px` viền. Giao diện là thanh chọn ba lựa chọn hiện cùng
   lúc (`aria-pressed`, trạng thái đọc được bằng bề mặt + viền + độ đậm, không chỉ
   bằng màu); số thẻ mới là ô số có kẹp giá trị; trộn thứ tự là công tắc dùng lại
   lớp `.switch` của `app.css`.
2. **Công cụ** — một hàng điều hướng có biểu tượng, chữ và chevron; không bọc một
   nút đơn lẻ trong cả một thẻ.
3. **Cập nhật** — HAI khối, không phải hai tab: *Ứng dụng* (cần tải lại trang) và
   *Nội dung học* (không cần). Mỗi khối có phiên bản, trạng thái và hành động riêng;
   nút cập nhật của khối Ứng dụng chỉ xuất hiện khi thật sự có bản chờ kích hoạt.
   Tuỳ chọn ít dùng (quay lại bản trước, cài lại nội dung đi kèm) nằm sau một dòng
   mở rộng.
4. **Thông tin ứng dụng** — mục gập; phiên bản ứng dụng vẫn đọc được ngay trên
   dòng tiêu đề để phục vụ báo lỗi. Giá trị đọc từ nguồn thật (`APP_VERSION`,
   `app.coreVersion`, `app.content.contentVersion`, `app.cards`), không ghi cứng.
5. **Quản lý dữ liệu** — thao tác không hoàn tác được, tách hẳn xuống cuối, bề mặt
   mang sắc `--danger-soft`, xác nhận tại chỗ (không `window.confirm`) và mô tả
   đúng phạm vi: dữ liệu nào bị xoá, dữ liệu nào được giữ.

Hai quy tắc kèm theo:

- **Không có trạng thái giả.** "Đang chạy phiên bản X" là phiên bản đang chạy, và
  "đã là bản mới nhất" chỉ hiện sau một lần kiểm tra thật (kể cả khi kết quả là
  không kiểm tra được vì ngoại tuyến).
- **Cài đặt ghi tuần tự.** `AppStore.updateSettings` xếp hàng các lần ghi vì
  `saveSettings` là đọc–gộp–ghi; nhờ vậy điều khiển không cần bị khoá trong lúc
  chờ — khoá lại sẽ nuốt phím người dùng vừa bấm và làm mất thay đổi.

## Hai thước đo trên màn Thống kê

Hai thanh riêng, nhãn riêng, không bao giờ gộp:

- **Thành thạo** — trung bình `mastery` kèm số thẻ đạt ngưỡng trên tổng, thêm một
  từ mô tả (`chưa bắt đầu` · `đang lên` · `chắc` · `vững`) để con số không phải tự
  giải thích.
- **Làm bài** — `accuracy` của lần làm bài gần nhất kèm số thẻ đã làm bài. Chưa từng
  làm bài thì hiện `—` kèm "chưa làm bài lần nào", **không** hiện `0%`: không có dữ
  liệu khác hẳn "kém".

Phần trăm luôn đi cùng mẫu số thật (`mastered/total`, `graded`) — một con số phần
trăm không mẫu số là tuyên bố dễ đọc sai.

Tên gọi là một phần của thiết kế ở đây — trước 1.0.3 ô thứ tư ghi "Đã chín" trong khi
điều kiện là `interval >= 21` ngày, một khái niệm SM-2 mà người học không có lý do gì
phải biết.

## Thống kê chi tiết (chỉ đọc)

Màn Thống kê đi theo đúng thứ bậc của việc học — **tổng quan → bài Minna → Kanji →
Mẫu câu** — nhưng là màn CHỈ ĐỌC: mọi hàng là văn bản, không còn là nút mở phiên
học. Việc bắt đầu phiên học thuộc trọn về đường Học → Collection; trước đây mỗi
hàng ở đây là một lối vào phiên học thứ hai, khiến cùng một chức năng sống ở hai
nơi. Danh sách đầy đủ mọi bộ trong thư viện cũng nằm ở Trang chủ ("Danh mục học"
cho ba chủ đề + "Bộ khác" cho bộ tự tạo) — đó là bản chi tiết của dòng "N thẻ
trong thư viện", không phải chức năng của màn này; ở đây chỉ còn tổng quan và ba
góc nhìn chủ đề.

- Hai mục cuối là góc nhìn theo CHỦ ĐỀ, song song với "Danh mục học" ở màn Học:
  **Kanji** hiện đủ bảy nhóm (kể cả nhóm chưa có nội dung), **Mẫu câu** gộp thành
  một hàng theo bộ. Con số trùng với hàng tương ứng ở Trang chủ là chủ ý — cả hai
  đọc chung một `deckStats` và cùng dùng component hàng `DeckRow`, không phải hai
  nguồn đếm.
- Hàng của bộ/bài chưa có thẻ chỉ hiện nhãn "Trống" / "Chưa có nội dung" và bị làm
  mờ. Trước đây chúng vẫn bấm được, dẫn tới màn Học ở trạng thái "không có thẻ tới
  hạn" — một ngõ cụt, không phải điều hướng.
- Danh sách bài mặc định chỉ hiện bài có thẻ (40+ bài trống không phải thông tin),
  kèm công tắc để xem đủ 50.
- Tổng quan có bốn ô đếm được, và ba nhóm chưa học / đang học / nhớ lâu cộng ĐÚNG
  bằng tổng số thẻ; thanh cơ cấu chia theo trọng số nên dữ liệu hỏng không làm tràn
  khung.

## Flashcard

- Mặt trước hỏi; nút lật chỉ hiện đáp án, không ghi rating.
- Rating chỉ xuất hiện sau khi đáp án được lật; chỉ thao tác rating trong chế độ
  flip cập nhật SM-2.
- Chế độ tự trả lời báo theo năm kết luận ở trên và không thay lịch SRS.
- Mặt khuất được `aria-hidden`; nội dung dài cuộn trong vùng mặt thẻ. Khung tối thiểu
  ổn định tránh dịch chuyển bố cục, nhưng cần kiểm tra ở zoom cao và với nội dung dài.

## Mức kiểm chứng và giới hạn

Không tuyên bố WCAG compliance. `docs/verification.md` ghi các phép kiểm tra thực
hiện và còn thiếu. Hiện có Chromium smoke cho học/khôi phục phiên, kiểm chứng runtime
hai chiều cho reduced motion (kịch bản CDP trên bản dựng), nền tảng CSS cho contrast
preference, safe-area, theme và responsive breakpoints, cùng Lighthouse và axe-core
trên bản dựng production (xem `docs/verification.md`). Chưa có audit screen-reader,
thiết bị thật, Safari/Firefox, zoom 200%, hoặc toàn bộ breakpoint ngoài bộ 10 khung
nhìn của `audit:layout`. Các điều kiện này phải được xác minh riêng, không suy ra từ
việc token hay media query tồn tại.

Phase 3 milestone đã smoke production Chromium trên Study ở 390×844, 768×1024 và
1280×800: không tràn ngang; ở phiên bản đó Island đo được 48px và Enter/Space mở,
đóng được. Đây là kết quả lịch sử trước Phase 6, không mô tả giao diện hiện tại.
Vòng 1.0.4 đã smoke lại bản dựng production trên 16 màn hình × 10 khung nhìn bằng
`npm run audit:layout` (0 vi phạm), chạy Lighthouse accessibility 1.0 trên Trang chủ
và axe-core sạch trên 16 trạng thái. Các phép đo này không thay thế kiểm tra trên
thiết bị thật, trình đọc màn hình hay zoom văn bản.
