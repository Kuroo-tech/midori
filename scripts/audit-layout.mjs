#!/usr/bin/env node
/**
 * Kiểm thử bố cục theo kích cỡ màn hình — chạy lại được.
 *
 * Đây là bộ đo từng tồn tại dưới dạng thao tác tay một lần (README, mục
 * "Kiểm thử theo kích cỡ màn hình"). Nó đo **mọi tổ hợp** giữa các khung nhìn đại
 * diện và các trạng thái màn hình, ở cả đầu trang và đáy trang, và bắt đúng những
 * lỗi mà đọc CSS không thấy.
 *
 * # Vì sao dùng CDP chứ không thêm dependency
 *
 * Node 22 có sẵn `WebSocket`, còn Chrome có sẵn giao thức DevTools. Ghép hai thứ đó
 * là đủ để điều khiển một trình duyệt thật mà không kéo thêm Playwright/Puppeteer
 * vào `package.json` — dự án vẫn chỉ có ba dependency chạy thật.
 *
 * # Vì sao dựng trạng thái qua IndexedDB, không qua cú nhấp
 *
 * Mười một trạng thái màn hình phần lớn là màn con (Kanji, Bài học, Thống kê,
 * Editor) hoặc trạng thái giữa phiên học. Dựng chúng bằng cách nhấp vào từng nút
 * khiến script phụ thuộc vào câu chữ trên giao diện; mỗi lần đổi nhãn là test đỏ
 * dù bố cục không hề hỏng. Thay vào đó script ghi thẳng `meta.screen` (và
 * `meta.session` cho phiên đang dở) — đúng hai khoá mà ứng dụng đọc lúc khởi động
 * (`src/storage/session.ts`) — rồi tải lại trang. Cách này bám vào schema lưu trữ
 * đã có kiểm thử, không bám vào DOM.
 *
 * Ngoài các phép đo bố cục, script còn **mô phỏng cử chỉ vuốt ngang ở màn
 * Nhập/xuất** và kiểm hai thứ có thể sai một cách im lặng: mục nào được chọn sau
 * mỗi lần vuốt, và khối nội dung trượt vào theo chiều nào. Phép kiểm chạy trên
 * `TouchEvent` tổng hợp nên nó xác nhận LOGIC của trình xử lý, không xác nhận việc
 * trình duyệt giao sự kiện chạm thật (việc đó cần thiết bị thật).
 *
 * # Vì sao có thêm ảnh chụp hình học
 *
 * Các phép kiểm ở trên đều trả lời "có/không": không tràn, không cắt, không bị che.
 * Chúng không thấy một khối cao thêm 20px hay lệch sang trái 30px mà vẫn "không vi
 * phạm gì" — đúng loại thay đổi mà một lần sửa bố cục vô ý tạo ra. Vì vậy mỗi
 * trạng thái còn được chụp lại **hình học** của bộ xương bố cục (`main.screen`, các
 * khối con trực tiếp, thanh điều hướng, vài khối đặc trưng như `.stage`/`.ratings`)
 * và so với `scripts/layout-baseline.json` đã commit, lệch quá
 * `LAYOUT_BASELINE_TOLERANCE` (mặc định 6px) là vi phạm.
 *
 * Ảnh chụp ghi toạ độ/kích thước chứ KHÔNG ghi chữ: chữ đổi nội dung là chuyện bình
 * thường. Nó gắn với một môi trường render, nên CI cài đúng bộ chữ — xem
 * `Pin the fonts used by the layout baseline` trong `.github/workflows/ci.yml`.
 *
 * # Vì sao có thêm ảnh chụp màn hình từng pixel
 *
 * Hình học ghi toạ độ khối, nên một nút đổi từ xanh lá sang xanh dương vẫn "không
 * lệch một pixel nào" — đúng thứ hình học không thấy. Vì vậy ở **cả 10 khung nhìn**
 * (đúng phạm vi của ảnh hình học; thu hẹp bằng `LAYOUT_SHOT_VIEWPORTS`) mỗi trạng thái
 * còn được chụp lại màn hình và so với `scripts/layout-shots/`, chia làm hai vùng:
 * - **ngoài vùng chữ**: so từng pixel, lệch quá `LAYOUT_SHOT_TOLERANCE` (mặc định
 *   20/255 trên một kênh) là pixel lệch, và số pixel lệch vượt `LAYOUT_SHOT_MAX_PIXELS`
 *   (mặc định 0.1% diện tích ảnh) là vi phạm;
 * - **trong vùng chữ** (hộp từng nút văn bản, lấy từ DOM đang hiển thị, nới
 *   `LAYOUT_SHOT_TEXT_HALO`): so theo khối `LAYOUT_SHOT_TEXT_BLOCK`×cùng cỡ bằng ba
 *   thước đo — trung bình khối, màu mực, và độ lệch sắc của mực — xem khối hằng số
 *   `SHOTS_TEXT_*` ở đầu tệp để biết ngưỡng và lý do của từng con số.
 * Khi vượt ngưỡng, ảnh so sánh ghi ra `layout-shot-diffs/` (gitignored; CI tải lên làm
 * artifact khi job đỏ): magenta = pixel ngoài vùng chữ, xanh dương = khối chữ.
 *
 * Ảnh chụp lặp lại được ĐÚNG từng byte nhờ hai thứ được GHIM trong script:
 * - màu giao diện: ứng dụng chọn sáng/tối bằng `matchMedia`, nên nếu máy đo đang ở
 *   chế độ tối thì ảnh là bản tối trong khi chuẩn là bản sáng — CI đỏ vì môi trường;
 * - trạng thái chuyển động: chờ hết hiệu ứng (rất quan trọng — `midori-rise` có
 *   `backwards` nên khối đang chờ chạy thì đứng ở vị trí BẮT ĐẦU, và `in:fly`/
 *   `transition: width` làm chữ và khối lệch nửa pixel trong lúc chạy), còn hiệu ứng
 *   lặp vô hạn (spinner, shimmer) thì đóng băng ở mốc 0 thay vì chụp tuỳ hứng.
 *
 * Đã đo với hai ghim đó: hai lần chạy liên tiếp cho 22 ảnh GIỐNG HỆT từng pixel và
 * chuẩn hình học GIỐNG HỆT từng byte. Không có chúng thì trước đó mỗi lần chạy lệch
 * hàng nghìn pixel trên vài chục trạng thái và vài chục trạng thái lệch 7–8px hình
 * học — tức là CI sẽ đỏ oan.
 *
 * # Cách dùng
 *
 *   npm run audit:layout
 *   LAYOUT_BASE_URL=http://127.0.0.1:5173 npm run audit:layout   # dev server
 *   LAYOUT_VERBOSE=1 npm run audit:layout                        # in mọi phép đo
 *   LAYOUT_VIEWPORTS=390x844,844x390 LAYOUT_SCREENS=study-active,study-revealed npm run audit:layout
 *   LAYOUT_UPDATE_BASELINE=1 npm run audit:layout               # làm mới chuẩn hình học
 *   LAYOUT_UPDATE_SHOTS=1 npm run audit:layout                  # làm mới ảnh chụp (mặc định cả 10 khung nhìn)
 *   LAYOUT_SHOT_VIEWPORTS=390x844 npm run audit:layout          # chỉ so một khung nhìn cho nhanh
 *   LAYOUT_SHOT_TOLERANCE=8 npm run audit:layout                # nới ngưỡng kênh ngoài vùng chữ
 *   LAYOUT_SHOT_TEXT_BUDGET=0.1 npm run audit:layout            # siết tỉ lệ vùng chữ được phép lệch
 *   LAYOUT_SHOT_TEXT_TOLERANCE=8 npm run audit:layout           # nới ngưỡng kênh trong vùng chữ
 *   LAYOUT_SHOT_TEXT_INK_CHROMA=40 npm run audit:layout         # hạ ngưỡng lệch SẮC màu mực
 *   LAYOUT_SHOT_TEXT_INK_CHROMA_BLOCKS=20 npm run audit:layout  # siết số khối lệch sắc tối thiểu
 *   LAYOUT_SHOT_MAX_PIXELS=5000 npm run audit:layout            # nới ngân sách pixel của cả hai vùng
 *   LAYOUT_NOISE_RUNS=2 npm run audit:layout                    # đo độ nhiễu nội môi trường của từng trạng thái
 *   LAYOUT_CHROME_FLAGS='--disable-font-subpixel-positioning' npm run audit:layout
 *                                                              # mô phỏng một môi trường render khác
 *   LAYOUT_REPORT_JSON=/tmp/report.json npm run audit:layout     # ghi báo cáo máy đọc được
 *   npm run audit:multi-env                                     # chạy nhiều môi trường rồi phân loại vi phạm
 *   LAYOUT_BASELINE_TOLERANCE=10 npm run audit:layout           # nới ngưỡng hình học
 *
 * Làm mới chuẩn là hành động **có chủ ý**: nó chỉ nên chạy khi thay đổi bố cục hay
 * giao diện là điều mình muốn, và cả `scripts/layout-baseline.json` lẫn
 * `scripts/layout-shots/` phải được commit kèm theo. Hai chuẩn làm mới RIÊNG BIỆT —
 * ảnh chụp bằng `LAYOUT_UPDATE_SHOTS`, hình học bằng `LAYOUT_UPDATE_BASELINE` — vì
 * tần số đổi của chúng khác nhau, gộp vào một lệnh thì làm mới thứ này sẽ vô tình
 * viết lại thứ kia.
 *
 * Mặc định trỏ vào `http://127.0.0.1:4173` (bản dựng production, `npm run preview`).
 * Nếu cổng đó chưa có ai nghe, script tự khởi động `vite preview` từ `dist/` rồi tự
 * dọn. Cần `dist/` đã build (`npm run build`).
 */

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BASE_URL = 'http://127.0.0.1:4173';

/**
 * Ảnh chụp hình học dùng làm chuẩn, và ngưỡng lệch cho phép.
 *
 * Tệp chuẩn nằm trong kho vì nó là **hợp đồng bố cục**: nếu một thay đổi làm khối
 * xê dịch qua ngưỡng, người viết phải hoặc sửa nguyên nhân, hoặc cập nhật chuẩn một
 * cách có chủ ý (`LAYOUT_UPDATE_BASELINE=1`).
 *
 * Giới hạn đã biết: đây là ảnh chụp của MỘT môi trường render (Chromium headless,
 * 1x, thanh cuộn ẩn, bộ chữ của máy sinh ra nó). Chiều cao khối do CSS quyết định
 * (`min-height`, đệm, lưới) nên ổn định, nhưng chỗ nào chữ xuống dòng khác đi thì
 * khối đó lệch theo. Vì vậy job CI cài đúng bộ chữ mà ứng dụng khai báo — xem
 * comment trong `.github/workflows/ci.yml`.
 */
const BASELINE_PATH = fileURLToPath(new URL('./layout-baseline.json', import.meta.url));
const BASELINE_TOLERANCE_PX = Number(process.env['LAYOUT_BASELINE_TOLERANCE'] ?? 6);
const UPDATE_BASELINE = process.env['LAYOUT_UPDATE_BASELINE'] === '1';

/**
 * Làm mới ảnh chụp ảnh RIÊNG với ảnh hình học — hai chuẩn có tần số đổi khác nhau.
 *
 * Gộp vào một lệnh thì làm mới ảnh hình học sẽ vô tình viết lại file JSON (và ngược
 * lại): đo lại cho thấy toạ độ hình học dao động ±1–5px giữa hai lần chạy (hệ số làm
 * tròn bố cục con chữ), nên mỗi lần làm mới ảnh chụp sẽ ghi chênh hàng chục trạng
 * thái vào JSON mà không ai yêu cầu. Tách ra thì mỗi lệnh chỉ đụng đúng tệp của nó;
 * muốn làm cả hai thì đặt cả hai biến.
 */
const UPDATE_SHOTS = process.env['LAYOUT_UPDATE_SHOTS'] === '1';

/**
 * Ảnh chụp màn hình làm chuẩn — bắt thứ hình học không thấy: đổi màu, đổi ảnh
 * nền, đổi biểu tượng, đổi hiệu ứng.
 *
 * Hình học chỉ ghi toạ độ khối, nên một nút đổi từ xanh lá sang xanh dương vẫn
 * "không lệch một pixel nào". Phép so ở đây chia ảnh thành HAI LOẠI VÙNG:
 *
 * 1. **Ngoài vùng chữ** — so từng pixel: pixel nào lệch quá `SHOTS_TOLERANCE`
 *    (mặc định 20/255 trên một kênh) là pixel lệch. Đây là nền, viền, khối màu,
 *    biểu tượng: mọi thay đổi màu ở vùng này đều là thật.
 * 2. **Trong vùng chữ** — so theo khối `SHOTS_TEXT_BLOCK`×`SHOTS_TEXT_BLOCK`
 *    (mặc định 4×4): chỉ tính là lệch khi **trung bình khối** chênh quá
 *    `SHOTS_TEXT_TOLERANCE` (mặc định 12/255). Lý do: cùng một chữ do hai phiên
 *    bản Chrome hay hai bản dựng phông khác nhau vẽ ra thì từng pixel antialias
 *    khác nhau, còn lượng mực trên cả khối gần như không đổi — nên trung bình khối
 *    miễn nhiễm với khác biệt renderer, trong khi đổi MÀU chữ vẫn làm nó chênh rõ.
 *    Vùng chữ lấy từ chính DOM đang hiển thị (hộp của từng nút văn bản, nới thêm
 *    `SHOTS_TEXT_HALO` px để phủ viền antialias), KHÔNG lấy từ chuẩn — nhờ vậy
 *    không phải commit thêm mặt nạ nào, và khoá theo nơi chữ đang thật sự ở đó.
 *
 * Ngân sách của hai vùng KHÁC nhau, vì nhiễu của chúng khác nhau:
 * - ngoài vùng chữ: 0.1% diện tích ảnh — ở đó ảnh chụp tất định giữa các lần chạy;
 * - trong vùng chữ: một TỈ LỆ (mặc định 25%) diện tích vùng chữ, vì khác biệt
 *   renderer chỉ làm lệch rải rác vài phần trăm khối chữ, còn thay đổi màu chữ hệ
 *   thống làm lệch gần như toàn bộ. Xem khối `SHOTS_TEXT_BUDGET` để biết số đo.
 *
 * Hai bộ đếm được báo RIÊNG (`imageDiff`, `textDiff`) để đọc log là biết ngay lỗi màu
 * thật hay nhiễu vẽ chữ — và ảnh so sánh cũng dùng hai màu tương ứng.
 *
 * Ảnh chuẩn nằm trong kho (`scripts/layout-shots/`). Làm mới có chủ đích bằng
 * `LAYOUT_UPDATE_SHOTS=1` — RIÊNG với ảnh hình học, xem khối trên. Khi vượt ngưỡng,
 * ảnh so sánh ghi ra `layout-shot-diffs/` (gitignored; CI tải lên) với hai màu:
 * magenta = pixel ngoài vùng chữ, xanh dương = khối chữ lệch.
 *
 * Kích thước repo mới là ràng buộc thật khi phủ 110 trạng thái, nên ảnh chuẩn được
 * lưu ở 1/`LAYOUT_SHOT_DOWNSCALE` độ phân giải (mặc định 1/2 mỗi chiều) theo trung bình
 * khối, ở định dạng `LAYOUT_SHOT_FORMAT` (mặc định WebP không mất dữ liệu). Kết quả đo
 * được: **3,0MB cho 110 ảnh**, tức chỉ hơn 2,4MB của bản cũ 22 ảnh không đáng kể, trong
 * khi phạm vi tăng gấp năm. Hai điều đó chỉ dám làm khi có chốt tự kiểm: mỗi lần làm
 * mới, script so bản vừa ghi với chính dữ liệu trung bình khối (PNG không mất dữ liệu)
 * và hỏng ngay nếu lệch dù một mức — đo được là WebP MẶC ĐỊNH của Chrome lệch tới
 * 61/255, nên "WebP là không mất dữ liệu" không thể là giả định (xem `formatLoss`).
 *
 * Mỗi lần làm mới ghi kèm `scripts/layout-shots.json`: định dạng, danh sách khung
 * nhìn, các ngưỡng, mã băm từng ảnh, và **dấu vân tay môi trường render** (phiên bản
 * Chrome, nền tảng, phông chữ phân giải được). Lúc so, vân tay khác chuẩn thì script
 * in một dòng `notice` và ghi kèm lý do vào từng vi phạm — vẫn đỏ như cũ, nhưng đọc
 * là biết khả năng cao do môi trường chứ không phải do mã; muốn tách hẳn nhiễu môi
 * trường khỏi lỗi thật thì chạy `npm run audit:multi-env` (đo trên nhiều cấu hình
 * renderer và phân loại vi phạm theo số môi trường cùng thấy).
 */
const SHOTS_DIR = fileURLToPath(new URL(process.env['LAYOUT_SHOTS_DIR'] ?? './layout-shots', import.meta.url));
// Hồ sơ nằm NGAY CẠNH kho ảnh và cùng tên: `scripts/layout-shots/` + `layout-shots.json`.
// Nhờ vậy đổi `LAYOUT_SHOTS_DIR` (lúc thử nghiệm codec, lúc chạy nhiều môi trường) là
// mang theo cả hồ sơ, không có chuyện ảnh ở chỗ này còn hồ sơ tả chỗ khác.
const SHOTS_META_PATH = join(dirname(SHOTS_DIR), `${basename(SHOTS_DIR)}.json`);
const SHOTS_DIFF_DIR = fileURLToPath(new URL('../layout-shot-diffs', import.meta.url));
const SHOTS_TOLERANCE = Number(process.env['LAYOUT_SHOT_TOLERANCE'] ?? 20);
const SHOTS_MAX_PIXELS =
  process.env['LAYOUT_SHOT_MAX_PIXELS'] === undefined ? null : Number(process.env['LAYOUT_SHOT_MAX_PIXELS']);
const SHOTS_TEXT_TOLERANCE = Number(process.env['LAYOUT_SHOT_TEXT_TOLERANCE'] ?? 12);
const SHOTS_TEXT_BLOCK = Number(process.env['LAYOUT_SHOT_TEXT_BLOCK'] ?? 4);
const SHOTS_TEXT_HALO = Number(process.env['LAYOUT_SHOT_TEXT_HALO'] ?? 2);
const SHOTS_TEXT_MIN_PIXELS = Number(process.env['LAYOUT_SHOT_TEXT_MIN_PIXELS'] ?? 64);
/**
 * Tỉ lệ vùng chữ được phép lệch trước khi coi là vi phạm, mặc định 40%.
 *
 * Vì sao theo TỈ LỆ chứ không theo số pixel tuyệt đối: hai loại thay đổi có cùng độ lớn
 * trung bình nhưng khác hẳn nhau về ĐỘ PHỦ. Ngưỡng này phải đủ rộng cho loại thứ nhất.
 *
 * Con số 40% đến từ phép đo trên cả 110 ảnh, không phải từ một ảnh mẫu. Dưới renderer
 * khác (`--disable-font-subpixel-positioning`), trạng thái nhiều chữ nhất — `stats` ở
 * `820x1180` — đã tới **28,4%** vùng chữ lệch (chữ nhỏ dày đặc: rất nhiều pixel rìa, mà
 * rìa nét chính là chỗ hai renderer khác nhau nhiều nhất). Ngưỡng cũ 25% vì thế làm đỏ
 * oan đúng hai trạng thái `stats`, tức đúng chuyện cần tránh.
 *
 * Đổi lại, phạm vi phát hiện "thay đổi vùng chữ không đổi màu" co lại còn khoảng 40%
 * diện tích. Khả năng bắt đổi MÀU chữ không mất theo: nó chuyển sang thước đo sắc bên
 * dưới, đo được là bắt đủ 110/110 trạng thái. Còn đổi độ dày/nét chữ (in đậm, đổi phông)
 * vốn cũng làm xê dịch bố cục nên đã nằm ở tầng hình học với ngưỡng 6px.
 *
 * Ngưỡng kênh của tầng chữ (`SHOTS_TEXT_TOLERANCE`) vẫn là 12/255: nó quyết định khối
 * nào được TÍNH là lệch, còn tỉ lệ này quyết định bao nhiêu khối lệch thì đủ để đỏ.
 */
const SHOTS_TEXT_BUDGET = Number(process.env['LAYOUT_SHOT_TEXT_BUDGET'] ?? 0.4);
/**
 * Ngưỡng cho thước đo thứ hai của vùng chữ: MÀU MỰC (mặc định 12/255).
 *
 * Vì sao cần thước đo thứ hai — đo được chứ không phải suy đoán: trung bình khối bị pha
 * loãng bởi nền, nên đổi màu chữ một kênh 60/255 (đổi `--muted` từ `#566d63` sang
 * `#93a89f`, dùng ở 11 chỗ trong giao diện) chỉ làm trung bình khối lệch khoảng 9–15 —
 * ngay sát ngưỡng 12, và trên thực tế đã LỌT. Màu mực lấy trung bình các pixel đậm hơn
 * trung điểm của khối (tức gần như chỉ pixel lõi của nét chữ) nên giữ được gần đủ 60/255.
 * Cùng lúc đó nó VẪN chịu được khác biệt renderer, vì pixel rìa — chỗ hai renderer vẽ
 * khác nhau nhiều nhất — bị loại khỏi thước đo này.
 */
const SHOTS_TEXT_INK_TOLERANCE = Number(process.env['LAYOUT_SHOT_TEXT_INK_TOLERANCE'] ?? 12);
/**
 * Ngưỡng cho thước đo thứ ba của vùng chữ: ĐỘ LỆCH SẮC (mặc định 80/255) — khoảng cách
 * giữa kênh lệch nhiều nhất và kênh lệch ít nhất của màu mực trong cùng một khối.
 *
 * Vì sao cần thước đo thứ ba — đo được, không suy đoán. Màu mực (thước đo thứ hai) bắt
 * tốt thay đổi màu chữ ĐẬM, nhưng khi renderer vẽ chữ khác đi (đo bằng
 * `--disable-font-subpixel-positioning`, tức đúng loại khác biệt giữa các phiên bản
 * Chrome/bộ phông) thì mực cũng lệch tới 118/255 — CAO HƠN cả thay đổi màu chữ thật
 * (103/255 khi đổi `--text` từ `#132118` sang `#7a1010`). Nên độ lớn một mình không tách
 * được hai loại. Con số 118 là cực đại đo được trên cả 110 ảnh (ghi vô điều kiện, không
 * chỉ khi có khối đã vượt ngưỡng).
 *
 * Thứ tách được là HƯỚNG của độ lệch. Nhiễu vẽ chữ làm cả ba kênh lệch gần như bằng
 * nhau (mất/được độ phủ nét chữ là chuyện sáng tối, không phải chuyện màu), nên hiệu
 * giữa kênh lệch nhiều nhất và ít nhất nhỏ. Đổi màu chữ thật thì lệch hẳn về một phía
 * (`#132118` → `#7a1010` là đỏ +103, xanh lá −17, xanh dương −8 → sắc 120).
 *
 * Ngưỡng 80 nằm giữa hai nhóm, đo trên cả 110 ảnh chứ không phải một ảnh mẫu: nhiễu
 * renderer đạt tối đa **56/255**, thay đổi màu chữ thật đạt **120/255**, và cả 110 trạng
 * thái đều vượt ngưỡng 80 khi màu chữ đổi.
 */
const SHOTS_TEXT_INK_CHROMA = Number(process.env['LAYOUT_SHOT_TEXT_INK_CHROMA'] ?? 80);
/**
 * Số khối tối thiểu phải lệch sắc thì mới coi là vi phạm (mặc định 4).
 *
 * Số này phải thấp, vì có trạng thái chỉ dùng màu chữ đó ở vài chỗ: `study-revealed`
 * (màn đã lật thẻ) chỉ có **15–21 khối** lệch sắc khi màu chữ đổi — sàn 24 bỏ lọt đúng
 * cả 10 trạng thái đó. Đo lại dưới renderer khác ở ngưỡng 80/255: **0 khối** trên cả 110
 * ảnh. Sàn 4 vì thế vừa chừa chỗ cho vài khối trùng hợp, vừa không bỏ lọt trạng thái nào.
 *
 * Cảnh báo khi đổi số này: sàn cao sẽ ÂM THẦM bỏ qua những trạng thái ít chữ dùng màu đó
 * — chính là kiểu hỏng khó thấy nhất của một bộ kiểm tra ảnh.
 */
const SHOTS_TEXT_INK_CHROMA_BLOCKS = Number(process.env['LAYOUT_SHOT_TEXT_INK_CHROMA_BLOCKS'] ?? 4);
/**
 * Mức "mực" trong khoảng sáng/tối của khối: pixel được coi là mực khi độ sáng của nó
 * không quá `min + (max - min) × mức` (mặc định 0.5 = nửa dưới của khoảng).
 *
 * `min`/`max` lấy từ ẢNH CHUẨN, không lấy từ từng ảnh: nếu mỗi ảnh tự chọn ngưỡng theo
 * khoảng của chính nó thì hai bên chọn hai tập pixel khác nhau, và khác biệt renderer
 * (vốn chỉ đổi vài mức xám ở rìa nét) lại kéo được trung bình mực đi — đo được là cách
 * đó làm 80–150 khối lệch trung bình tới 103/255 dù chữ không hề khác. Ghim ngưỡng theo
 * ảnh chuẩn thì hai bên đo trên CÙNG một tập pixel, đúng thứ cần so.
 */
const SHOTS_TEXT_INK_LEVEL = Number(process.env['LAYOUT_SHOT_TEXT_INK_LEVEL'] ?? 0.5);
/**
 * Hệ số hạ độ phân giải của ảnh chuẩn (mỗi chiều), mặc định 2.
 *
 * Đây là cái làm cho việc phủ cả 10 khung nhìn trở nên rẻ: 110 ảnh ở độ phân giải gốc
 * là khoảng 12MB WebP (đã đo), còn ở 1/2 độ phân giải là khoảng 1/4 số điểm ảnh — cùng
 * cỡ với 2,4MB mà bản cũ tốn cho 22 ảnh. Đổi lại, một thay đổi NHỎ HƠN một khối vẫn
 * được bắt nếu nó đủ đậm để kéo trung bình khối qua ngưỡng (một đường kẻ 1px đổi màu
 * đổi 25–50% trung bình của khối nó đi qua), còn thay đổi màu ở vùng đặc thì mất đúng
 * 0 khả năng phát hiện.
 *
 * Trung bình khối ở đây do CHÍNH script tính (cộng từng pixel rồi chia), không để
 * `drawImage` làm: bộ lọc nội suy của trình duyệt có thể đổi giữa các phiên bản, còn
 * phép cộng-trung bình thì không.
 */
const SHOTS_DOWNSCALE = Number(process.env['LAYOUT_SHOT_DOWNSCALE'] ?? 2);
const SHOTS_FORMAT = (process.env['LAYOUT_SHOT_FORMAT'] ?? 'webp').trim().toLowerCase();
const CHROME_FLAGS = (process.env['LAYOUT_CHROME_FLAGS'] ?? '').trim().split(/\s+/).filter((flag) => flag !== '');
const NOISE_RUNS = Number(process.env['LAYOUT_NOISE_RUNS'] ?? 0);
const REPORT_PATH = process.env['LAYOUT_REPORT_JSON'] ?? null;

if (SHOTS_FORMAT !== 'png' && SHOTS_FORMAT !== 'webp') {
  throw new Error(`LAYOUT_SHOT_FORMAT chỉ nhận png hoặc webp, không nhận ${SHOTS_FORMAT}`);
}
if (SHOTS_TEXT_BLOCK < 1 || !Number.isInteger(SHOTS_TEXT_BLOCK)) {
  throw new Error(`LAYOUT_SHOT_TEXT_BLOCK phải là số nguyên >= 1, không nhận ${SHOTS_TEXT_BLOCK}`);
}
if (SHOTS_DOWNSCALE < 1 || !Number.isInteger(SHOTS_DOWNSCALE)) {
  throw new Error(`LAYOUT_SHOT_DOWNSCALE phải là số nguyên >= 1, không nhận ${SHOTS_DOWNSCALE}`);
}

/**
 * Khung nhìn nào giữ ảnh chuẩn — mặc định CẢ 10, bằng với phạm vi của ảnh hình học.
 *
 * Trước đây mặc định chỉ hai khung nhìn (điện thoại dọc + máy tính) vì 110 ảnh PNG
 * chiếm khoảng 10MB, quá nặng cho repo. Hai thứ đã đổi điều đó, và cả hai đều đo
 * được chứ không phải phỏng đoán: (1) WebP không mất dữ liệu nhỏ hơn hẳn PNG trên
 * giao diện phẳng, và (2) vùng chữ so theo khối nên không còn phải chụp dư độ phân
 * giải để bù nhiễu vẽ chữ. Tổng dung lượng sau khi đổi được ghi trong
 * `scripts/layout-shots.json` (`bytes`) và in ra ở dòng `shots` mỗi lần làm mới.
 *
 * Bao phủ cả 10 khung nhìn là chuyện thật, không phải cho đủ: bố cục ở 320×568 và
 * 414×896, hay hai chiều ngang 844×390 / 667×375, không suy ra được từ hai đầu
 * (đúng loại lỗi mà README đã ghi: thanh điều hướng che nút ở 320×568 nhưng không
 * che ở 390×844).
 *
 * `LAYOUT_SHOT_VIEWPORTS=390x844` chạy lọc cho lúc đang phát triển (nhanh hơn
 * nhiều, và mọi vi phạm vẫn được báo so với đúng những khung nhìn đó). Danh sách
 * phải là tập con của `ALL_VIEWPORTS`: id viết sai (hoặc danh sách rỗng) làm script
 * lỗi NGAY kèm danh sách id hợp lệ, chứ không lặng lẽ bỏ qua — bỏ qua im lặng thì
 * phép kiểm pixel biến thành no-op mà pipeline vẫn xanh.
 */
const SHOT_VIEWPORTS = (() => {
  const raw = (process.env['LAYOUT_SHOT_VIEWPORTS'] ?? 'all').trim();
  if (raw === '' || raw === 'all') return null;
  return new Set(
    raw
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== ''),
  );
})();

function shotViewport(viewportId) {
  return SHOT_VIEWPORTS === null || SHOT_VIEWPORTS.has(viewportId);
}

/** Số pixel lệch cho phép của một ảnh: 0.1% diện tích, trừ khi chỉ định sẵn. */
function shotPixelBudget(total) {
  return SHOTS_MAX_PIXELS ?? Math.max(1, Math.round(total * 0.001));
}

/** Ngân sách cho riêng phần vùng chữ: một TỈ LỆ diện tích vùng chữ, không dưới sàn. */
function shotTextPixelBudget(masked) {
  return SHOTS_MAX_PIXELS ?? Math.max(SHOTS_TEXT_MIN_PIXELS, Math.round(masked * SHOTS_TEXT_BUDGET));
}

/** Định dạng đang dùng để ĐỌC chuẩn: theo metadata nếu có, không thì theo biến môi trường. */
function shotFormatInUse() {
  return readShotMeta()?.format ?? SHOTS_FORMAT;
}

function shotFileName(key, format) {
  return `${key.replace('::', '--')}.${format}`;
}

/** Đường tới ảnh chuẩn của một trạng thái — tên khớp với khoá ảnh hình học. */
function shotPath(key, format = shotFormatInUse()) {
  return join(SHOTS_DIR, shotFileName(key, format));
}

/** Tên ảnh so sánh khi vượt ngưỡng — cũng là thứ sẽ tải lên CI khi job đỏ. */
function shotDiffPath(key) {
  return join('layout-shot-diffs', shotFileName(key, 'png'));
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Đọc `scripts/layout-shots.json` — hồ sơ của chuẩn ảnh.
 *
 * Không có tệp này nghĩa là chuẩn chưa được làm mới theo định dạng mới, hoặc bản
 * checkout thiếu tệp. Cả hai đều phải ồn ào: thiếu hồ sơ thì không biết phải đọc
 * ảnh đuôi nào, và "im lặng bỏ qua" sẽ biến phép kiểm pixel thành no-op.
 */
function readShotMeta() {
  if (!existsSync(SHOTS_META_PATH)) return null;
  try {
    return JSON.parse(readFileSync(SHOTS_META_PATH, 'utf8'));
  } catch (cause) {
    throw new Error(`Không đọc được ${SHOTS_META_PATH}: ${cause instanceof Error ? cause.message : cause}`);
  }
}

/**
 * Đọc ảnh chuẩn của một trạng thái.
 *
 * Trả về `null` khi tệp chưa có (đó là vi phạm riêng, không phải lỗi I/O), kèm mã
 * băm để đối chiếu với hồ sơ: một tệp bị cắt cụt hay bị chỉnh tay sẽ lộ ra thay vì
 * được coi là chuẩn hợp lệ.
 */
function readShot(key) {
  const format = shotFormatInUse();
  const path = shotPath(key, format);
  if (!existsSync(path)) return null;
  const bytes = readFileSync(path);
  return { base64: bytes.toString('base64'), bytes: bytes.byteLength, sha256: sha256(bytes), file: shotFileName(key, format) };
}

/** Ghi ảnh chuẩn mới. Chỉ ghi trạng thái vừa đo — làm mới một phần không xoá phần còn lại. */
function writeShot(key, base64) {
  mkdirSync(SHOTS_DIR, { recursive: true });
  const bytes = Buffer.from(base64, 'base64');
  writeFileSync(shotPath(key, SHOTS_FORMAT), bytes);
  // Đổi định dạng thì tệp cũ cùng khoá phải biến mất, nếu không thư mục chuẩn có hai
  // bản của cùng một trạng thái và không ai biết bản nào đang được so.
  const other = SHOTS_FORMAT === 'webp' ? 'png' : 'webp';
  rmSync(join(SHOTS_DIR, shotFileName(key, other)), { force: true });
  return { file: shotFileName(key, SHOTS_FORMAT), bytes: bytes.byteLength, sha256: sha256(bytes) };
}

/**
 * Ghi hồ sơ chuẩn, GỘP với hồ sơ cũ để làm mới một phần không xoá phần còn lại.
 * `renderer` luôn lấy từ lần chạy hiện tại: hồ sơ phải nói môi trường nào đã sinh ra
 * những ảnh đang nằm trong kho.
 */
function writeShotMeta(entries, renderer, prune) {
  const previous = readShotMeta() ?? { shots: {} };
  const shots = prune ? { ...entries } : { ...(previous.shots ?? {}), ...entries };
  // Dọn cả ẢNH của các mục vừa bị loại khỏi hồ sơ — hồ sơ nói về kho ảnh, để lại
  // ảnh mồ côi là hai nguồn sự thật lệch nhau ngay trong thư mục chuẩn.
  if (prune) {
    for (const [key, item] of Object.entries(previous.shots ?? {})) {
      if (key in shots) continue;
      rmSync(join(SHOTS_DIR, item.file ?? shotFileName(key, previous.format ?? SHOTS_FORMAT)), { force: true });
    }
  }
  const sorted = Object.fromEntries(Object.entries(shots).sort(([left], [right]) => left.localeCompare(right)));
  const bytes = Object.values(sorted).reduce((sum, item) => sum + item.bytes, 0);
  const document = {
    note:
      'Ảnh chuẩn từng pixel, sinh bằng LAYOUT_UPDATE_SHOTS=1 npm run audit:layout. Vùng chữ so theo ba thước đo (trung bình khối, màu mực, độ lệch sắc của mực), phần còn lại so từng pixel — xem scripts/audit-layout.mjs.',
    format: SHOTS_FORMAT,
    downscale: SHOTS_DOWNSCALE,
    tolerance: SHOTS_TOLERANCE,
    textTolerance: SHOTS_TEXT_TOLERANCE,
    textInkTolerance: SHOTS_TEXT_INK_TOLERANCE,
    textInkChroma: SHOTS_TEXT_INK_CHROMA,
    textInkChromaBlocks: SHOTS_TEXT_INK_CHROMA_BLOCKS,
    textInkLevel: SHOTS_TEXT_INK_LEVEL,
    textBudget: SHOTS_TEXT_BUDGET,
    textBlock: SHOTS_TEXT_BLOCK,
    textHalo: SHOTS_TEXT_HALO,
    budgetFraction: 0.001,
    bytes,
    viewports: [...new Set(Object.keys(sorted).map((key) => key.split('::')[0]))].sort(),
    renderer,
    shots: sorted,
  };
  writeFileSync(SHOTS_META_PATH, JSON.stringify(document, null, 2) + '\n', 'utf8');
  return document;
}

/** Ghi ảnh so sánh (data URL trả về từ trang) ra thư mục tạm, trả về đường dẫn log. */
function writeShotDiff(key, dataUrl) {
  mkdirSync(SHOTS_DIFF_DIR, { recursive: true });
  writeFileSync(join(SHOTS_DIFF_DIR, shotFileName(key, 'png')), Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
  return shotDiffPath(key);
}

/** `#rrggbb` để log nói được chỗ nào đổi từ màu gì sang màu gì. */
function toHex(rgb) {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** Cổng của máy chủ do script tự khởi động, nếu có — để URL mặc định trỏ đúng chỗ. */
let serverPort = 4173;

/** Gói máy chủ tự khởi động để dọn được nó kể cả khi script chết giữa đường. */
let spawnedServer = null;

/**
 * Dọn máy chủ tự khởi động.
 *
 * Phải chạy được cả trong `process.on('exit')`, nơi chỉ còn thao tác đồng bộ — nên
 * chỉ dùng `kill`, không `await`. Lần chạy đầu tiên của script đã bỏ quên một tiến
 * trình `vite preview` theo cách này: script bị đứt vì ghi vào pipe đã đóng (chạy qua
 * `| head`) TRƯỚC khi tới khối `finally`, và tiến trình ở lại chiếm cổng. Lặp lại vài
 * lần là hết cổng để chạy.
 */
function killSpawnedServer() {
  if (spawnedServer === null) return;
  const { child } = spawnedServer;
  spawnedServer = null;
  try {
    // `detached` biến con thành trưởng nhóm tiến trình, nên `-pid` dọn luôn cả cây
    // (`npm exec` bọc ngoài tiến trình `vite` thật).
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      /* Đã chết rồi thì thôi. */
    }
  }
}

process.on('exit', killSpawnedServer);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    killSpawnedServer();
    process.exit(130);
  });
}
const MSG_TIMEOUT_MS = 30_000;
const READY_TIMEOUT_MS = Number(process.env['LAYOUT_READY_TIMEOUT_MS'] ?? 20_000);

/**
 * Thời gian tối đa chờ trang hết chuyển động trước khi đo/chụp.
 *
 * Vì sao phải chờ: ứng dụng có `animation: midori-rise … backwards` (khối đang chờ
 * chạy thì đứng ở VỊ TRÍ BẮT ĐẦU) và hàng loạt `transition: transform/width` cùng
 * Svelte `in:fly` 200–480ms. Không chờ thì mỗi lần đo ra một kết quả khác: đã đo
 * được toạ độ lệch 7–8px giữa hai lần chạy và hàng nghìn pixel lệch (chữ nằm lệch
 * nửa pixel nên viền chữ đậm/nhạt khác hẳn) — đúng thứ làm CI đỏ oan.
 */
const SETTLE_TIMEOUT_MS = Number(process.env['LAYOUT_SETTLE_TIMEOUT_MS'] ?? 3_000);

const ALL_VIEWPORTS = [
  { id: '320x568', width: 320, height: 568 },
  { id: '360x640', width: 360, height: 640 },
  { id: '390x844', width: 390, height: 844 },
  { id: '414x896', width: 414, height: 896 },
  { id: '667x375', width: 667, height: 375 },
  { id: '844x390', width: 844, height: 390 },
  { id: '768x1024', width: 768, height: 1024 },
  { id: '820x1180', width: 820, height: 1180 },
  { id: '1024x768', width: 1024, height: 768 },
  { id: '1440x900', width: 1440, height: 900 },
];

/**
 * Các trạng thái màn hình được đo.
 *
 * Trạng thái phiên học cần `queue` là danh sách id thẻ CÓ THẬT trong thư viện (lõi
 * Rust bỏ id không tồn tại và có thể coi hàng đợi rỗng là không có phiên nào), nên
 * chúng được dựng bằng một hàm nhận ngữ cảnh chứa id thật vừa đọc từ IndexedDB.
 *
 * Trạng thái Collection cần `meta.collectionScope` — phạm vi là trạng thái điều
 * hướng nằm ở store, không nằm trong URL — nên chúng cũng khai báo ở đây.
 */
const ALL_SCREENS = [
  { id: 'home', screen: 'home' },
  {
    id: 'home-resume',
    screen: 'home',
    session: (ctx) => ({
      deckId: ctx.deckId,
      mode: 'flip',
      focus: 'due',
      queue: ctx.ids,
      index: 1,
      revealed: false,
      rated: 1,
      mistakes: 0,
    }),
  },
  { id: 'lessons', screen: 'lessons' },
  { id: 'patterns', screen: 'patterns' },
  { id: 'kanji', screen: 'kanji' },
  { id: 'collection-all', screen: 'collection', collectionScope: { kind: 'all' } },
  {
    id: 'collection-lesson',
    screen: 'collection',
    // Bài Minna có thẻ thật (một trong các bài đã phát hành), để màn Collection
    // chạy nhánh đầy đủ thay vì trạng thái "bài chưa có thẻ".
    collectionScope: (ctx) => ({ kind: 'lesson', deckId: 'vocabulary', lesson: ctx.lesson }),
  },
  {
    id: 'collection-pattern',
    screen: 'collection',
    // Bộ Mẫu câu cũng chia theo bài; dùng cùng bài đã chọn cho Từ vựng vì bộ
    // mẫu câu phủ đủ 50 bài.
    collectionScope: (ctx) => ({ kind: 'lesson', deckId: 'patterns', lesson: ctx.lesson }),
  },
  {
    id: 'collection-kanji',
    screen: 'collection',
    collectionScope: { kind: 'deck', deckId: 'kanji-noun' },
  },
  {
    id: 'collection-kanji-empty',
    screen: 'collection',
    // Nhóm Kanji chưa phát hành — trạng thái "Nội dung đang được chuẩn bị".
    collectionScope: { kind: 'deck', deckId: 'kanji-verb' },
  },
  {
    id: 'session-active',
    screen: 'session',
    session: (ctx) => ({
      deckId: ctx.deckId,
      mode: 'flip',
      focus: 'due',
      queue: ctx.ids,
      index: 1,
      revealed: false,
      rated: 1,
      mistakes: 0,
    }),
  },
  {
    id: 'session-revealed',
    screen: 'session',
    session: (ctx) => ({
      deckId: ctx.deckId,
      mode: 'flip',
      focus: 'due',
      queue: ctx.ids,
      index: 1,
      revealed: true,
      rated: 1,
      mistakes: 0,
    }),
  },
  { id: 'transfer', screen: 'transfer' },
  { id: 'settings', screen: 'settings' },
  { id: 'stats', screen: 'stats' },
  { id: 'editor', screen: 'editor' },
];

/**
 * Kỳ vọng cho từng bước vuốt ở màn Nhập/xuất, tính theo CHỈ SỐ nút trên thanh chọn
 * chứ không theo nhãn: nhãn là câu chữ hiển thị và có thể đổi, còn "mục kế tiếp"
 * mới là hành vi.
 *
 * `changed` là khối nội dung có được dựng lại hay không — đây mới là phép kiểm
 * "không đổi chủ đề". Không so `direction` ở các bước đó: khối cũ vẫn có thể đang
 * chạy nốt hiệu ứng của lần đổi trước, nên dịch ngang còn sót lại không có nghĩa gì.
 *
 * `direction` là dấu của dịch ngang mà khối MỚI bắt đầu từ đó: `+1` nghĩa là nó vào
 * từ bên phải (đi tới), `-1` là từ bên trái (quay lại).
 */
const SWIPE_STEPS = [
  { name: 'next', activeIndex: 1, changed: true, direction: 1 },
  { name: 'previous', activeIndex: 0, changed: true, direction: -1 },
  { name: 'first-item-clamp', activeIndex: 0, changed: false },
  { name: 'short-swipe', activeIndex: 0, changed: false },
  { name: 'swipe-on-select', activeIndex: 0, changed: false },
  { name: 'vertical-dominant', activeIndex: 0, changed: false },
  { name: 'reach-middle', activeIndex: 1, changed: true, direction: 1 },
  { name: 'reach-last', activeIndex: 2, changed: true, direction: 1 },
  { name: 'past-end', activeIndex: 2, changed: false },
];

/**
 * Thẻ mẫu cố định cho audit bố cục.
 *
 * Chỉ dùng cho profile Chrome tạm do script này tạo. Giữ nguyên văn bản và số
 * lượng để ảnh chuẩn so sánh được giữa các lần chạy; đổi nội dung ở đây là đổi
 * chuẩn hình ảnh, phải làm mới `scripts/layout-shots/`.
 */
const FIXTURE_CARDS = [
  { deckId: 'vocabulary', front: 'Xin chào', back: 'こんにちは', furigana: 'こんにちは', romaji: 'konnichiwa', lesson: 1 },
  { deckId: 'vocabulary', front: 'Tạm biệt', back: 'さようなら', furigana: 'さようなら', romaji: 'sayounara', lesson: 1 },
  { deckId: 'vocabulary', front: 'Cảm ơn', back: 'ありがとう', furigana: 'ありがとう', romaji: 'arigatou', lesson: 1 },
  { deckId: 'vocabulary', front: 'Xin lỗi', back: 'ごめんなさい', furigana: 'ごめんなさい', romaji: 'gomen nasai', lesson: 2 },
  { deckId: 'vocabulary', front: 'Buổi sáng', back: '朝', furigana: 'あさ', romaji: 'asa', lesson: 2 },
  { deckId: 'vocabulary', front: 'Buổi trưa', back: '昼', furigana: 'ひる', romaji: 'hiru', lesson: 3 },
  { deckId: 'vocabulary', front: 'Buổi tối', back: '夜', furigana: 'よる', romaji: 'yoru', lesson: 3 },
  { deckId: 'vocabulary', front: 'Hôm nay', back: '今日', furigana: 'きょう', romaji: 'kyou', lesson: 3 },
  { deckId: 'patterns', front: 'Bạn là ai?', back: 'あなたは誰ですか', furigana: 'あなたはだれですか', lesson: 3 },
  { deckId: 'patterns', front: 'Tôi là học sinh', back: '私は学生です', furigana: 'わたしはがくせいです', lesson: 3 },
  { deckId: 'patterns', front: 'Nhà vệ sinh ở đâu?', back: 'トイレはどこですか', furigana: 'トイレはどこですか', lesson: 3 },
  { deckId: 'kanji-noun', front: 'Nhật Bản', back: '日本', furigana: 'にほん', romaji: 'nihon' },
  { deckId: 'kanji-noun', front: 'Trường học', back: '学校', furigana: 'がっこう', romaji: 'gakkou' },
  { deckId: 'kanji-noun', front: 'Giáo viên', back: '先生', furigana: 'せんせい', romaji: 'sensei' },
  { deckId: 'kanji-noun', front: 'Thời gian', back: '時間', furigana: 'じかん', romaji: 'jikan' },
];

const viewports = selectById(ALL_VIEWPORTS, process.env['LAYOUT_VIEWPORTS'], 'LAYOUT_VIEWPORTS');
const screens = selectById(ALL_SCREENS, process.env['LAYOUT_SCREENS'], 'LAYOUT_SCREENS');

// Lần chạy ĐẦY ĐỦ (không lọc khung nhìn/trạng thái) đo trọn bộ hiện có, nên khi làm
// mới chuẩn nó được phép DỌN các mục cũ không còn tồn tại (ví dụ trạng thái của màn
// hình đã bị gỡ khỏi ALL_SCREENS). Chạy có lọc phải giữ nguyên phần không đo — đó
// chính là lý do writeBaseline/writeShotMeta gộp thay vì ghi đè.
const FULL_RUN =
  (process.env['LAYOUT_VIEWPORTS'] ?? '') === '' && (process.env['LAYOUT_SCREENS'] ?? '') === '';

// Danh sách khung nhìn giữ ảnh chuẩn cũng được kiểm: một id viết sai mà bị bỏ qua im lặng
// thì không ảnh nào được so, tức là phép kiểm mới biến mất mà job vẫn xanh.
if (SHOT_VIEWPORTS !== null) {
  if (SHOT_VIEWPORTS.size === 0) {
    throw new Error(
      'LAYOUT_SHOT_VIEWPORTS rỗng — bỏ hẳn biến để dùng mặc định, hoặc đặt `all` để chụp mọi khung nhìn',
    );
  }
  requireKnownIds('LAYOUT_SHOT_VIEWPORTS', SHOT_VIEWPORTS, ALL_VIEWPORTS);
}
const verbose = process.env['LAYOUT_VERBOSE'] === '1';

const server = await ensurePreviewServer();
const browser = await launchChrome();
let failures = 0;

try {
  const session = await openTarget(browser);
  const baseline = readBaseline();
  const geometry = {};
  const violations = [];
  let gestureProbes = 0;
  let shotsWritten = 0;
  let shotsCompared = 0;
  const shotEntries = {};
  const formatLoss = { checked: 0 };
  const noiseFloor = { runs: 0, states: [], imageDiff: 0, textDiff: 0, maxDelta: 0, maxTextDelta: 0 };

  // Chuẩn ảnh phải tự mô tả được: biết định dạng tệp, biết ngưỡng nào đã dùng lúc
  // chụp, và biết môi trường render nào đã sinh ra nó.
  const shotMeta = readShotMeta();
  if (shotMeta === null && !UPDATE_SHOTS) {
    throw new Error(
      'thiếu scripts/layout-shots.json nên không biết phải đọc ảnh chuẩn đuôi nào — làm mới bằng LAYOUT_UPDATE_SHOTS=1 npm run audit:layout',
    );
  }
  if (shotMeta !== null && shotMeta.format !== SHOTS_FORMAT) {
    throw new Error(
      `chuẩn ảnh đang ở định dạng .${shotMeta.format} nhưng LAYOUT_SHOT_FORMAT=${SHOTS_FORMAT} — xoá scripts/layout-shots/ và scripts/layout-shots.json rồi chạy LAYOUT_UPDATE_SHOTS=1 npm run audit:layout, hoặc đặt LAYOUT_SHOT_FORMAT=${shotMeta.format}`,
    );
  }

  const fingerprint = rendererFingerprint(browser);
  const notices = rendererNotices(shotMeta, fingerprint);
  const parameterDiffs = parameterNotices(shotMeta);
  const noticeText = (items) => items.map((notice) => `${notice.field} ${notice.before} → ${notice.after}`).join(', ');
  const noticeSuffix =
    notices.length === 0 && parameterDiffs.length === 0
      ? ''
      : ` · khác lúc chụp chuẩn (${[...(notices.length === 0 ? [] : [`môi trường render: ${noticeText(notices)}`]), ...(parameterDiffs.length === 0 ? [] : [`thông số so sánh: ${noticeText(parameterDiffs)}`])].join('; ')})`;
  if (notices.length > 0) {
    console.log(JSON.stringify({ kind: 'notice', check: 'renderer-differs', notices, baseline: shotMeta?.renderer ?? null, current: fingerprint }));
  }
  if (parameterDiffs.length > 0) {
    console.log(JSON.stringify({ kind: 'notice', check: 'parameters-differ', notices: parameterDiffs }));
  }

  // Ảnh so sánh của lần chạy trước không được lẫn vào lần này — đặc biệt là khi
  // lần này sạch: một ảnh cũ còn đó sẽ làm tin rằng job đỏ là do lỗi mới.
  if (!UPDATE_SHOTS && existsSync(SHOTS_DIFF_DIR)) {
    rmSync(SHOTS_DIFF_DIR, { recursive: true, force: true });
  }

  /**
   * Chụp và so ảnh chuẩn của MỘT trạng thái (hoặc ghi ảnh mới nếu đang làm mới).
   *
   * Tách thành hàm để vòng đo bố cục giữ nguyên độ dài như trước: chụp chỉ xảy ra ở
   * đầu trang, ở khung nhìn nằm trong danh sách ảnh — cùng mốc với ảnh hình học nên
   * hai chuẩn nhìn thấy đúng một khung hình.
   */
  async function auditShot(session, key, { viewport, screen, violations }) {
    // Chụp ở ĐỘ PHÂN GIẢI GỐC rồi mới hạ xuống: ảnh gốc là thứ dùng để vẽ ảnh so sánh
    // (nhìn thấy giao diện thật), còn ảnh hạ là thứ lưu và so.
    const text = await captureTextRegions(session);
    const shot = await captureShot(session, 'png');
    const downscaled = await downscaleShot(session, shot, 'image/png');
    const mime = downscaled.mime;
    const spotText = (spots) =>
      spots.map((spot) => `(${spot.x},${spot.y}) ${toHex(spot.before)}→${toHex(spot.after)}`).join(', ');

    // Đo độ nhiễu NỘI MÔI TRƯỜNG nếu được yêu cầu: chụp thêm vài lần cùng khung hình
    // rồi so các lần với nhau (không dính gì tới chuẩn). Đây là con số duy nhất nói
    // được ngưỡng hiện tại đang có bao nhiêu biên — chạy ở mỗi môi trường render thì
    // so hai con số là biết khác biệt nào là nhiễu môi trường, khác biệt nào là thật.
    if (NOISE_RUNS > 0) {
      let previous = downscaled;
      for (let run = 0; run < NOISE_RUNS; run += 1) {
        const next = await downscaleShot(session, await captureShot(session, 'png'), 'image/png');
        const drift = await compareShot(session, previous.data, next.data, text, mime);
        previous = next;
        noiseFloor.runs += 1;
        noiseFloor.imageDiff = Math.max(noiseFloor.imageDiff, drift.imageDiff ?? 0);
        noiseFloor.textDiff = Math.max(noiseFloor.textDiff, drift.textDiff ?? 0);
        noiseFloor.maxDelta = Math.max(noiseFloor.maxDelta, drift.maxDelta ?? 0);
        noiseFloor.maxTextDelta = Math.max(noiseFloor.maxTextDelta, drift.maxTextDelta ?? 0);
        if ((drift.imageDiff ?? 0) > 0 || (drift.textDiff ?? 0) > 0) noiseFloor.states.push(key);
      }
    }

    if (UPDATE_SHOTS) {
      const written = writeShot(key, downscaled.data);
      shotsWritten += 1;
      shotEntries[key] = { ...written, columns: downscaled.columns, rows: downscaled.rows };
      // Codec ghi chuẩn phải KHÔNG mất dữ liệu: so bản vừa ghi với chính dữ liệu trung
      // bình khối (đã có sẵn dạng PNG không mất dữ liệu). Ngưỡng 1/255 nên chỉ cần lệch
      // một mức là hỏng bước làm mới — Chrome đổi cách mã hoá thì lộ ra ngay, không âm
      // thầm đưa một chuẩn đã méo vào repo.
      const loss = await compareShot(session, downscaled.lossless, downscaled.data, { rects: [], tolerance: 0, block: 1, factor: 1 }, mime, 1);
      if (loss.sizeChanged !== undefined) {
        throw new Error(`${key}: ảnh ${SHOTS_FORMAT} đọc lại khác kích thước với dữ liệu khối — không so được`);
      }
      const lost = (loss.imageDiff ?? 0) + (loss.textDiff ?? 0);
      if (lost > 0) {
        throw new Error(
          `${key}: ${SHOTS_FORMAT} làm mất dữ liệu so với dữ liệu khối — ${lost} pixel lệch (chênh tối đa ${loss.maxDelta}, ví dụ ${spotText(loss.spots.slice(0, 2))}). Đặt LAYOUT_SHOT_FORMAT=png rồi làm mới lại chuẩn.`,
        );
      }
      formatLoss.checked += 1;
      if (verbose) {
        console.log(
          JSON.stringify({ kind: 'shot', state: key, file: written.file, bytes: written.bytes, columns: downscaled.columns, rows: downscaled.rows }),
        );
      }
      return;
    }

    const expectedShot = readShot(key);
    if (expectedShot === null) {
      violations.push({
        viewport: viewport.id,
        screen: screen.id,
        position: 'shot',
        check: 'shot-missing',
        detail: `${key} chưa có ảnh chuẩn — chạy LAYOUT_UPDATE_SHOTS=1 npm run audit:layout rồi commit scripts/layout-shots/`,
      });
      return;
    }

    // Mã băm trong hồ sơ là chốt an toàn cho tệp nhị phân: một ảnh bị cắt cụt, bị chỉnh
    // tay, hay bị đưa sai định dạng sẽ lộ ra ở đây thay vì được coi là chuẩn hợp lệ.
    const record = shotMeta?.shots?.[key];
    if (record !== undefined && record.sha256 !== expectedShot.sha256) {
      violations.push({
        viewport: viewport.id,
        screen: screen.id,
        position: 'shot',
        check: 'shot-corrupt',
        detail: `${key}: ${record.file} có mã băm khác hồ sơ ${'layout-shots.json'} (${record.sha256.slice(0, 12)}… so với ${expectedShot.sha256.slice(0, 12)}…) — tệp chuẩn bị sửa, hãy trả lại nguyên trạng hoặc làm mới chuẩn`,
      });
      return;
    }

    const report = await compareShot(session, expectedShot.base64, downscaled.data, text, mime);
    shotsCompared += 1;
    if (report.sizeChanged !== undefined) {
      violations.push({
        viewport: viewport.id,
        screen: screen.id,
        position: 'shot',
        check: 'shot-size-changed',
        detail: `${key}: ảnh chuẩn ${report.sizeChanged.expected.join('×')} nhưng hiện tại ${report.sizeChanged.actual.join('×')} — khung nhìn hoặc bố cục đã đổi`,
      });
      return;
    }

    const imageBudget = shotPixelBudget(report.total);
    const textBudget = shotTextPixelBudget(report.masked);
    const overImage = report.imageDiff > imageBudget;
    // Thước đo sắc màu mực tính theo SỐ KHỐI chứ không theo tỉ lệ diện tích: một thay đổi
    // màu chữ đụng mọi khối chữ cùng lúc, còn vài khối lẻ vượt ngưỡng ở ảnh hạ độ phân
    // giải là chuyện trùng hợp — xem khối SHOTS_TEXT_INK_CHROMA_BLOCKS.
    const overChroma = report.blocksInkChromaOver >= SHOTS_TEXT_INK_CHROMA_BLOCKS;
    const overText = report.textDiff > textBudget || overChroma;
    if (overImage || overText) {
      const diffPath = writeShotDiff(
        key,
        await renderShotDiff(session, expectedShot.base64, downscaled.data, text, mime, shot, report.overBlocks),
      );
      const parts = [];
      if (overImage) {
        parts.push(
          `${report.imageDiff} pixel NGOÀI vùng chữ lệch (ngưỡng ${imageBudget}), chênh tối đa ${report.maxDelta}, ví dụ ${spotText(report.spots.slice(0, 3))}`,
        );
      }
      if (overText) {
        const share = report.masked === 0 ? 0 : Math.round((report.textDiff / report.masked) * 1000) / 10;
        const inkNote =
          report.blocksInkOver > 0
            ? `, ${report.blocksInkOver} trong số đó lệch vì MÀU MỰC (tối đa ${report.maxInkDelta}/255 so với ngưỡng ${report.textInkTolerance}, ví dụ ${spotText(report.inkSpots.slice(0, 2))})`
            : '';
        parts.push(
          `${share}% vùng chữ lệch (${report.textDiff}/${report.masked} pixel, ${report.blocksOver} khối ${report.textBlock}×${report.textBlock}, ngưỡng ${Math.round(SHOTS_TEXT_BUDGET * 100)}% và ngưỡng kênh ${report.textTolerance}; ${report.inkBlocks} khối đủ dày để đo mực)${inkNote}`,
        );
      }
      if (overChroma) {
        parts.push(
          `mực chữ lệch SẮC ở ${report.blocksInkChromaOver} khối (tối thiểu ${SHOTS_TEXT_INK_CHROMA_BLOCKS} khối, tối đa ${report.maxInkChroma}/255 so với ngưỡng ${report.textInkChroma}/255 — đổi màu chữ thì cả ba kênh lệch khác hướng nhau, còn nhiễu vẽ chữ chỉ làm chúng lệch cùng chiều, ví dụ ${spotText(report.chromaSpots.slice(0, 2))})`,
        );
      }
      violations.push({
        viewport: viewport.id,
        screen: screen.id,
        position: 'shot',
        check: 'pixel-drift',
        detail: `${key}: ${parts.join(' · ')} · vùng chữ ${report.masked}/${report.total} pixel · ảnh so sánh (magenta = ngoài vùng chữ, xanh = khối chữ): ${diffPath}${noticeSuffix}`,
      });
    } else if (verbose) {
      console.log(
        JSON.stringify({
          kind: 'shot',
          state: key,
          imageDiff: report.imageDiff,
          textDiff: report.textDiff,
          masked: report.masked,
          imageBudget,
          textBudget,
          blocksOver: report.blocksOver,
          blocksInkOver: report.blocksInkOver,
          blocksInkChromaOver: report.blocksInkChromaOver,
          inkBlocks: report.inkBlocks,
          maxInkDelta: report.maxInkDelta,
          maxInkChroma: report.maxInkChroma,
        }),
      );
    }
  }

  for (const viewport of viewports) {
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.width <= 720,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    });

    // Lần đo đầu tiên cần nạp ứng dụng để nó cài nội dung hạt giống và dựng thư
    // viện; các trạng thái sau chỉ ghi đè trạng thái rồi tải lại.
    //
    // `waitReady()` là bắt buộc ở đây, không thừa: việc cài hạt giống chạy SAU
    // sự kiện `load` (nạp WASM rồi mở giao dịch IndexedDB), nên đọc thư viện ngay
    // sau `load` là đọc trước khi giao dịch ghi xong. Trên máy phát triển khoảng
    // trễ đó lọt vào 120 ms mà `navigate()` chờ sẵn; trên runner chậm hơn nó không
    // lọt, và audit đỏ với "thư viện rỗng" trong khi ứng dụng hoàn toàn đúng.
    await session.navigate(baseUrl(), { first: true });
    await session.waitReady();
    // Ứng dụng phát hành với cơ sở dữ liệu RỖNG: nội dung là do người dùng thêm.
    // Audit vẫn cần thư viện có thẻ để đo màn Collection và phiên học, nên nó tự
    // gieo dữ liệu mẫu vào profile Chrome tạm của chính nó — không phải nội dung
    // hạt giống của ứng dụng, và không bao giờ chạm tới hồ sơ người dùng thật.
    if (await seedFixtureLibrary(session)) {
      await session.navigate(baseUrl());
      await session.waitReady();
    }
    const library = await readLibrary(session);

    for (const screen of screens) {
      const ctx = { deckId: library.deckId, ids: library.ids, lesson: library.lesson };
      const state = { screen: screen.screen, session: null };
      if (typeof screen.session === 'function') {
        state.session = screen.session(ctx);
      }
      if (typeof screen.collectionScope === 'function') {
        state.collectionScope = screen.collectionScope(ctx);
      } else if (screen.collectionScope !== undefined) {
        state.collectionScope = screen.collectionScope;
      }
      await writeState(session, state);
      await session.navigate(baseUrl());
      await session.waitReady();
      await session.settle();

      for (const position of ['top', 'bottom']) {
        await session.scrollTo(position);
        const report = await measure(session);
        const found = collect(report, position);
        const errors = session.takeErrors();
        if (errors.length > 0) found.push({ check: 'console-error', detail: errors.slice(0, 3).join(' | ') });

        const row = { viewport: viewport.id, screen: screen.id, position, ...report };
        if (found.length > 0 || verbose) {
          console.log(JSON.stringify({ kind: 'measure', viewport: viewport.id, screen: screen.id, position, checks: found, metrics: row }));
        }
        for (const item of found) violations.push({ viewport: viewport.id, screen: screen.id, position, ...item });

        // Ảnh chụp hình học chỉ lấy ở ĐẦU trang: toạ độ đọc bằng
        // `getBoundingClientRect` phụ thuộc vị trí cuộn, nên chỉ so sánh được khi mọi
        // trạng thái cùng một mốc.
        if (position === 'top') {
          const key = `${viewport.id}::${screen.id}`;
          const snapshot = await captureGeometry(session);
          geometry[key] = snapshot;
          if (!UPDATE_BASELINE) {
            const drift = compareGeometry(key, snapshot, baseline);
            if (drift.length > 0 || verbose) {
              console.log(JSON.stringify({ kind: 'geometry', state: key, checks: drift, entries: Object.keys(snapshot).length }));
            }
            for (const item of drift) violations.push({ viewport: viewport.id, screen: screen.id, position: 'geometry', ...item });
          }

          // Ảnh chụp màn hình cũng ĐẶT Ở ĐÂY — cùng mốc với ảnh hình học, nên hai
          // chuẩn nhìn thấy đúng một khung hình và lỗi màu/ảnh nền nằm dưới cùng
          // một ảnh chụp.
          if (shotViewport(viewport.id)) {
            await auditShot(session, key, { viewport, screen, violations });
          }
        }
      }

      // Cử chỉ vuốt chỉ có ở màn Nhập/xuất, và chạy SAU các phép đo bố cục vì nó
      // đổi chủ đề đang chọn (kết thúc ở mục cuối).
      if (screen.id === 'transfer') {
        gestureProbes += 1;
        const probe = await swipeProbe(session);
        const found = collectSwipe(probe);
        if (found.length > 0 || verbose) {
          console.log(JSON.stringify({ kind: 'swipe', viewport: viewport.id, screen: screen.id, checks: found, steps: probe.steps ?? null }));
        }
        for (const item of found) violations.push({ viewport: viewport.id, screen: screen.id, position: 'gesture', ...item });
      }
    }
  }

  // Ghi đè chuẩn là hành động có chủ ý, và chỉ gộp những trạng thái VỪA ĐO: chạy
  // `LAYOUT_VIEWPORTS=390x844 LAYOUT_UPDATE_BASELINE=1` phải chỉ làm mới khung nhìn
  // đó, không xoá 99 trạng thái còn lại.
  if (UPDATE_BASELINE) {
    writeBaseline(geometry, FULL_RUN);
    console.log(
      JSON.stringify({
        kind: 'baseline',
        path: BASELINE_PATH,
        refreshed: Object.keys(geometry).length,
        total: Object.keys(readBaseline().states).length,
        tolerancePx: BASELINE_TOLERANCE_PX,
      }),
    );
  }

  if (UPDATE_SHOTS) {
    const meta = writeShotMeta(shotEntries, fingerprint, FULL_RUN && SHOT_VIEWPORTS === null);
    console.log(
      JSON.stringify({
        kind: 'shots',
        dir: relative(process.cwd(), SHOTS_DIR) || SHOTS_DIR,
        refreshed: shotsWritten,
        files: Object.keys(meta.shots).length,
        viewports: [...(SHOT_VIEWPORTS ?? new Set(ALL_VIEWPORTS.map((item) => item.id)))],
        format: SHOTS_FORMAT,
        bytes: meta.bytes,
        formatLoss,
        tolerance: SHOTS_TOLERANCE,
        textTolerance: SHOTS_TEXT_TOLERANCE,
        textBlock: SHOTS_TEXT_BLOCK,
      }),
    );
  }

  const summary = {
    kind: 'summary',
    viewports: viewports.length,
    screens: screens.length,
    measurements: viewports.length * screens.length * 2,
    gestureProbes,
    gestureSteps: gestureProbes * SWIPE_STEPS.length,
    geometryStates: Object.keys(geometry).length,
    shots: UPDATE_SHOTS ? shotsWritten : shotsCompared,
    shotViewports: [...(SHOT_VIEWPORTS ?? new Set(ALL_VIEWPORTS.map((item) => item.id)))],
    shotFormat: shotFormatInUse(),
    shotDownscale: readShotMeta()?.downscale ?? SHOTS_DOWNSCALE,
    shotTolerance: SHOTS_TOLERANCE,
    shotTextTolerance: SHOTS_TEXT_TOLERANCE,
    shotTextBlock: SHOTS_TEXT_BLOCK,
    noiseRuns: NOISE_RUNS,
    noiseFloor: NOISE_RUNS > 0 ? noiseFloor : null,
    renderer: fingerprint.browser,
    rendererNotices: notices.length,
    baseline: UPDATE_BASELINE ? 'refreshed' : 'compared',
    shotsBaseline: UPDATE_SHOTS ? 'refreshed' : 'compared',
    violations: violations.length,
  };
  console.log(JSON.stringify(summary));
  if (violations.length > 0) {
    failures = violations.length;
    for (const item of violations) {
      console.log(JSON.stringify({ kind: 'violation', ...item }));
    }
  }

  // Báo cáo máy đọc được cho `npm run audit:multi-env`: nó chạy script này nhiều lần
  // trên các cấu hình renderer khác nhau rồi so các báo cáo để biết vi phạm nào chỉ
  // một môi trường thấy (nhiễu) và vi phạm nào mọi môi trường đều thấy (lỗi thật).
  if (REPORT_PATH !== null) {
    writeFileSync(
      REPORT_PATH,
      `${JSON.stringify(
        {
          summary,
          renderer: fingerprint,
          notices,
          parameterNotices: parameterDiffs,
          noiseFloor: NOISE_RUNS > 0 ? noiseFloor : null,
          violations,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  }
  session.close();
} finally {
  await browser.close();
  await server.close();
}

process.exit(failures > 0 ? 1 : 0);

// ── Hạ tầng: máy chủ, trình duyệt, phiên CDP ───────────────────────────────

function baseUrl() {
  const configured = process.env['LAYOUT_BASE_URL'];
  if (configured !== undefined) return configured.replace(/\/+$/, '') + '/';
  if (serverPort !== 4173) return `http://127.0.0.1:${serverPort}/`;
  return DEFAULT_BASE_URL.replace(/\/+$/, '') + '/';
}

/**
 * Bảo đảm có máy chủ để đo.
 *
 * - Có `LAYOUT_BASE_URL`: dùng đúng địa chỉ đó, không khởi động gì thêm (dùng khi
 *   người dùng đang chạy `npm run dev`).
 * - Không có: nếu `http://127.0.0.1:4173` đã trả lời thì dùng lại; nếu không, tự
 *   khởi động `vite preview` trên một cổng trống rồi tự dọn.
 *
 * Máy chủ tự khởi động phải bind `127.0.0.1` chứ không để mặc định `localhost`:
 * trên máy này `localhost` phân giải ra `::1`, nên một máy chủ chỉ nghe IPv6 sẽ
 * không trả lời `127.0.0.1` — đúng cái bẫy đã làm lần chạy đầu tiên báo "không
 * sẵn sàng" dù máy chủ đã lên.
 */
async function ensurePreviewServer() {
  if (process.env['LAYOUT_BASE_URL'] !== undefined) {
    const url = baseUrl();
    if (!(await reachable(url))) throw new Error(`Không kết nối được ${url}.`);
    return { close: async () => {} };
  }

  if (await reachable(DEFAULT_BASE_URL)) return { close: async () => {} };

  const dist = fileURLToPath(new URL('../dist/index.html', import.meta.url));
  if (!existsSync(dist)) {
    throw new Error('Chưa có bản dựng trong dist/. Chạy `npm run build` trước.');
  }

  const port = await freePort([4181, 4182, 4183]);
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(
    'npx',
    ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'ignore', detached: true },
  );
  spawnedServer = { child };
  serverPort = port;

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await reachable(url)) return { close: async () => killSpawnedServer() };
    await sleep(150);
  }
  throw new Error(`vite preview không sẵn sàng ở ${url} trong ${READY_TIMEOUT_MS} ms.`);
}

/** Cổng đầu tiên trong danh sách còn trống, để `vite preview` không đụng cổng khác. */
async function freePort(candidates) {
  for (const port of candidates) {
    if (await portFree(port)) return port;
  }
  // Hết ứng viên (ví dụ vài máy chủ còn sót lại từ lần chạy trước): để hệ điều hành
  // cấp một cổng trống thay vì từ chối chạy. Cửa sổ đua ở đây là giữa lúc đóng đầu dò
  // và lúc `vite` bind, chấp nhận được cho một công cụ đo tại chỗ.
  return await ephemeralPort();
}

function ephemeralPort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

function portFree(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

async function reachable(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Khởi động Chrome headless và trả về địa chỉ DevTools của nó. */
async function launchChrome() {
  const binary = process.env['LAYOUT_CHROME'] ?? findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'midori-layout-'));
  const child = spawn(
    binary,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--hide-scrollbars',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      // Cờ thêm vào để MÔ PHỎNG một môi trường render khác trên cùng một máy — ví dụ
      // `--font-render-hinting=none` đổi cách vẽ chữ mà không đổi bố cục. Đây là thứ
      // `npm run audit:multi-env` dùng để tách nhiễu môi trường khỏi lỗi thật.
      ...CHROME_FLAGS,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  const portFile = join(profile, 'DevToolsActivePort');
  const deadline = Date.now() + 15_000;
  while (!existsSync(portFile)) {
    if (Date.now() > deadline) throw new Error('Chrome không mở cổng DevTools.');
    await sleep(100);
  }
  const [port] = readFileSync(portFile, 'utf8').split('\n');
  const httpBase = `http://127.0.0.1:${port}`;
  // Phiên bản trình duyệt là phần quan trọng nhất của dấu vân tay: nó giải thích
  // được vì sao cùng một mã nguồn lại cho ra ảnh chụp khác nhau giữa hai máy.
  const version = await fetch(`${httpBase}/json/version`)
    .then((response) => response.json())
    .then((info) => info['Browser'] ?? 'không rõ')
    .catch(() => 'không rõ');

  return {
    httpBase,
    version,
    binary,
    close: async () => {
      child.kill('SIGTERM');
      await sleep(150);
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        /* Hồ sơ tạm có thể còn bị Chrome giữ; không quan trọng. */
      }
    },
  };
}

function findChrome() {
  for (const candidate of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome']) {
    const located = which(candidate);
    if (located !== null) return located;
  }
  throw new Error('Không tìm thấy Chrome. Đặt LAYOUT_CHROME trỏ tới tệp thực thi.');
}

function which(name) {
  const paths = (process.env['PATH'] ?? '').split(':');
  for (const dir of paths) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Dấu vân tay của môi trường render đã sinh ra ảnh chuẩn (hoặc đang đo).
 *
 * Bốn thứ quyết định ảnh chụp khác nhau giữa hai máy: phiên bản trình duyệt, nền
 * tảng, bộ phông chữ phân giải được cho `sans-serif`, và định dạng ảnh. Ghi cả cờ
 * dòng lệnh vì cờ là cách mô phỏng môi trường khác trên cùng một máy. Lúc so, vân tay
 * khác chuẩn KHÔNG làm job đỏ thêm — nó chỉ khiến vi phạm tự khai ra nghi phạm.
 */
function rendererFingerprint(browser) {
  return {
    browser: browser.version,
    platform: `${process.platform}-${process.arch}`,
    binary: browser.binary,
    deviceScaleFactor: 1,
    sansSerif: resolvedSansSerif(),
    flags: CHROME_FLAGS,
    format: SHOTS_FORMAT,
  };
}

/** Phông mà `sans-serif` phân giải thành — `null` nếu máy không có fontconfig. */
function resolvedSansSerif() {
  try {
    const output = execFileSync('fc-match', ['--format=%{family}', 'sans-serif'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.trim() === '' ? null : output.trim();
  } catch {
    return null;
  }
}

/**
 * Thông số so sánh đã đổi so với lúc chụp chuẩn.
 *
 * Hồ sơ ghi lại các ngưỡng đã dùng để sinh ra chuẩn. Đổi mặc định trong script (hay đặt
 * biến môi trường cho khác đi) mà không làm mới chuẩn thì ảnh chuẩn vẫn là ảnh cũ nhưng
 * luật so đã khác — đọc hồ sơ ra sẽ tưởng chuẩn được sinh bằng luật đang chạy. Không
 * làm job đỏ (đổi ngưỡng có thể là chủ ý), nhưng phải nói ra.
 */
function parameterNotices(meta) {
  if (meta === null) return [];
  const current = {
    format: SHOTS_FORMAT,
    downscale: SHOTS_DOWNSCALE,
    tolerance: SHOTS_TOLERANCE,
    textTolerance: SHOTS_TEXT_TOLERANCE,
    textInkTolerance: SHOTS_TEXT_INK_TOLERANCE,
    textInkChroma: SHOTS_TEXT_INK_CHROMA,
    textInkChromaBlocks: SHOTS_TEXT_INK_CHROMA_BLOCKS,
    textInkLevel: SHOTS_TEXT_INK_LEVEL,
    textBudget: SHOTS_TEXT_BUDGET,
    textBlock: SHOTS_TEXT_BLOCK,
    textHalo: SHOTS_TEXT_HALO,
  };
  const notices = [];
  for (const [field, value] of Object.entries(current)) {
    const before = meta[field];
    if (before !== undefined && before !== value) {
      notices.push({ field, before, after: value });
    }
  }
  return notices;
}

/**
 * Khác biệt giữa vân tay hiện tại và vân tay trong hồ sơ chuẩn.
 *
 * Chỉ so những thứ thật sự đổi kết quả vẽ: phiên bản trình duyệt và phông chữ. Cờ
 * dòng lệnh không so vì đó chính là biến người dùng chủ động đổi khi muốn mô phỏng
 * môi trường khác — báo động vì nó thì mọi lần chạy có cờ đều ồn.
 */
function rendererNotices(meta, fingerprint) {
  const before = meta?.renderer;
  if (before === undefined || before === null) return [];
  const notices = [];
  if (before.browser !== undefined && before.browser !== fingerprint.browser) {
    notices.push({ field: 'trình duyệt', before: before.browser, after: fingerprint.browser });
  }
  if ((before.sansSerif ?? null) !== (fingerprint.sansSerif ?? null)) {
    notices.push({
      field: 'phông sans-serif',
      before: before.sansSerif ?? 'không rõ',
      after: fingerprint.sansSerif ?? 'không rõ',
    });
  }
  return notices;
}

/** Mở một tab và gói giao thức CDP của nó thành các thao tác có ý nghĩa. */
async function openTarget(browser) {
  // `/json/version` trả JSON qua HTTP và cho ta WebSocket của phiên trình duyệt.
  const version = await fetch(`${browser.httpBase}/json/version`).then((response) => response.json());

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('Không mở được WebSocket DevTools.')), { once: true });
  });

  const session = createSession(ws, version.webSocketDebuggerUrl);
  const targetId = (await session.send('Target.createTarget', { url: 'about:blank' })).targetId;
  const { sessionId } = await session.send('Target.attachToTarget', { targetId, flatten: true });
  session.attach(sessionId);

  await session.send('Page.enable');
  await session.send('Runtime.enable');
  await session.send('Log.enable');

  // Ghim màu giao diện. Ứng dụng CHỌN sáng/tối bằng
  // `matchMedia('(prefers-color-scheme: dark)')`, nên nếu máy đo đang ở chế độ tối
  // thì ảnh chụp là bản tối trong khi chuẩn là bản sáng — CI đỏ vì môi trường,
  // không vì mã. Tương phản cũng ghim (mặc định) để không khí máy nào đó đẩy viền
  // dày hơn và làm lệch cả ảnh lẫn chữ số.
  await session.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: 'light' },
      { name: 'prefers-contrast', value: 'no-preference' },
    ],
  });
  return session;
}

function createSession(ws, label) {
  let nextId = 0;
  let sessionId = null;
  let loadResolvers = [];
  const pending = new Map();
  const errors = [];

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
    if (message.id !== undefined) {
      const entry = pending.get(message.id);
      if (entry === undefined) return;
      pending.delete(message.id);
      if (message.error !== undefined) entry.reject(new Error(`${label}: ${message.error.message}`));
      else entry.resolve(message.result ?? {});
      return;
    }
    if (message.method === 'Page.loadEventFired') {
      for (const resolve of loadResolvers) resolve();
      loadResolvers = [];
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      errors.push(`console: ${message.params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(' ')}`);
    }
    if (message.method === 'Runtime.exceptionThrown') {
      errors.push(`exception: ${message.params?.exceptionDetails?.exception?.description ?? 'unknown'}`);
    }
    if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
      errors.push(`log: ${message.params.entry.text}`);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const payload = sessionId === null ? { id, method, params } : { id, method, params, sessionId };
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${label}: hết thời gian chờ ${method}`));
      }, MSG_TIMEOUT_MS);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      ws.send(JSON.stringify(payload));
    });

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails !== undefined) {
      throw new Error(`Lỗi trong trang: ${result.exceptionDetails.exception?.description ?? expression.slice(0, 60)}`);
    }
    return result.result?.value;
  };

  const session = {
    attach(id) {
      sessionId = id;
    },
    send,
    evaluate,
    async navigate(url, { first = false } = {}) {
      const loaded = new Promise((resolve) => loadResolvers.push(resolve));
      if (first) await send('Page.navigate', { url });
      else await send('Page.reload', { ignoreCache: false });
      await Promise.race([loaded, sleep(READY_TIMEOUT_MS)]);
      await sleep(120);
    },
    async waitReady() {
      const deadline = Date.now() + READY_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const ready = await evaluate(
          `Boolean(document.querySelector('nav[aria-label="Điều hướng chính"]')) && document.querySelector('.splash') === null && document.body.innerText.length > 0`,
        );
        if (ready) {
          await evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
          return;
        }
        await sleep(120);
      }
      throw new Error('Ứng dụng không sẵn sàng trong thời gian cho phép.');
    },

    /**
     * Chờ trang hết chuyển động — bước BẮT BUỘC trước khi đo hình học và chụp ảnh.
     *
     * Hai việc, cùng một lần gọi:
     * 1. Chờ các hiệu ứng hữu hạn (`midori-rise`, `in:fly`, `transition: width`…)
     *    chạy xong — có mốc thời gian chặn để không treo khi hiệu ứng không chịu
     *    dừng.
     * 2. ĐÓNG BĂNG hiệu ứng lặp vô hạn (spinner, shimmer) ở mốc 0: không thể “chờ
     *    kết thúc” chúng, mà chụp tuỳ hứng thì khung nào cũng khác khung nào — nên
     *    chọn một khung XÁC ĐỊNH thay vì chụp lúc nó đang quay.
     */
    async settle() {
      const deadline = Date.now() + SETTLE_TIMEOUT_MS;
      for (;;) {
        // Mốc thời gian tính Ở NODE: `Date.now()` trong trang là giá trị epoch, không
        // dùng được làm đồng hồ đếm ngược cục bộ.
        const timedOut = Date.now() >= deadline;
        const stillRunning = await evaluate(`((force) => {
          const all = typeof document.getAnimations === 'function' ? document.getAnimations() : [];
          const running = all.filter((animation) => animation.playState === 'running');
          for (const animation of running) {
            const timing = animation.effect ? animation.effect.getTiming() : {};
            if (timing.iterations === Infinity) {
              try { animation.pause(); animation.currentTime = 0; } catch { /* đã đứng yên rồi */ }
            }
          }
          const remaining = all.filter((animation) => animation.playState === 'running');
          if (remaining.length === 0) return 0;
          if (force) {
            for (const animation of remaining) { try { animation.pause(); } catch { /* bỏ qua */ } }
            return -1;
          }
          return remaining.length;
        })(${timedOut ? 'true' : 'false'})`);
        if (stillRunning === 0 || stillRunning === -1) break;
        await sleep(50);
      }
      await evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
    },
    async scrollTo(position) {
      await evaluate(
        position === 'bottom'
          ? 'window.scrollTo(0, document.documentElement.scrollHeight); true'
          : 'window.scrollTo(0, 0); true',
      );
      await evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
    },
    takeErrors() {
      const out = errors.slice();
      errors.length = 0;
      return out;
    },
    close() {
      ws.close();
    },
  };
  return session;
}

// ── Trạng thái và phép đo trong trang ─────────────────────────────────────

/**
 * Gieo thư viện mẫu nếu profile đang rỗng. Trả về `true` khi đã ghi, để nơi gọi
 * tải lại trang và cho store đọc thư viện mới.
 */
async function seedFixtureLibrary(session) {
  return await session.evaluate(`(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('midori');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = await new Promise((resolve, reject) => {
      const request = db.transaction('cards', 'readonly').objectStore('cards').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (count > 0) {
      db.close();
      return false;
    }
    const now = Date.now();
    const cards = ${JSON.stringify(FIXTURE_CARDS)}.map((card, index) => ({
      ...card,
      id: 'audit-' + (index + 1),
      tags: card.lesson === undefined ? [] : ['bài ' + card.lesson],
      createdAt: now,
      srs: { ease: 2.5, interval: 0, repetitions: 0, lapses: 0, due: now },
    }));
    await new Promise((resolve, reject) => {
      const tx = db.transaction('cards', 'readwrite');
      const store = tx.objectStore('cards');
      for (const card of cards) store.put(card);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  })()`);
}

/** Đọc vài id thẻ thật của một bộ, để dựng phiên học hợp lệ. */
async function readLibrary(session) {
  const value = await session.evaluate(`(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('midori');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const cards = await new Promise((resolve, reject) => {
      const request = db.transaction('cards', 'readonly').objectStore('cards').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const pick = cards.filter((card) => card.deckId === 'vocabulary');
    const chosen = pick.length > 0 ? pick : cards;
    return {
      deckId: chosen[0]?.deckId ?? 'vocabulary',
      ids: chosen.slice(0, 5).map((card) => card.id),
      lesson: chosen.find((card) => typeof card.lesson === 'number')?.lesson ?? 1,
    };
  })()`);
  if (value === undefined || value.ids.length === 0) {
    throw new Error('Thư viện rỗng: ứng dụng chưa cài được nội dung hạt giống, nên phiên học không dựng được.');
  }
  return value;
}

/**
 * Ghi `meta.screen` (và `meta.session`, `meta.collectionScope` nếu có) — đúng cách
 * ứng dụng đọc lúc khởi động. Cả hai khoá trạng thái đều được XOÁ trước rồi ghi
 * lại, để mỗi trạng thái đo không thừa hưởng dữ liệu của trạng thái trước.
 */
async function writeState(session, state) {
  const sessionJson = state.session === null ? 'null' : JSON.stringify(state.session);
  const scopeJson =
    state.collectionScope === undefined ? 'null' : JSON.stringify(state.collectionScope);
  await session.evaluate(`(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('midori');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const write = (key, value) => new Promise((resolve, reject) => {
      const request = db.transaction('meta', 'readwrite').objectStore('meta').put(value, key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
    const remove = (key) => new Promise((resolve, reject) => {
      const request = db.transaction('meta', 'readwrite').objectStore('meta').delete(key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
    await remove('session');
    await remove('collectionScope');
    await write('screen', ${JSON.stringify(state.screen)});
    const collectionScope = ${scopeJson};
    if (collectionScope !== null) await write('collectionScope', collectionScope);
    const session = ${sessionJson};
    if (session !== null) await write('session', { ...session, savedAt: Date.now() });
    db.close();
    return true;
  })()`);
}

async function measure(session) {
  return session.evaluate(`(${measureInPage.toString()})()`);
}

async function swipeProbe(session) {
  return session.evaluate(`(${swipeProbeInPage.toString()})()`);
}

async function captureGeometry(session) {
  return session.evaluate(`(${captureGeometryInPage.toString()})()`);
}

/**
 * Chụp KHUNG NHÌN hiện tại (không chụp toàn trang): cùng mốc với ảnh hình học,
 * nên hai chuẩn nhìn thấy đúng một khung hình.
 */
async function captureShot(session, format = SHOTS_FORMAT) {
  const { data } = await session.send('Page.captureScreenshot', {
    format,
    fromSurface: true,
    captureBeyondViewport: false,
    // WebP của Chrome chỉ KHÔNG mất dữ liệu ở quality 100; mặc định là mã hoá mất
    // dữ liệu. Đo được: ở mặc định, cùng một khung hình lệch 98.796 pixel và chênh
    // tới 61/255 so với PNG — tức là không dùng làm chuẩn được. Bước làm mới vẫn tự
    // kiểm lại (xem `formatLoss`), nên nếu Chrome đổi hành vi thì lộ ra ngay.
    ...(format === 'webp' ? { quality: 100 } : {}),
  });
  return data;
}

/**
 * Vùng chữ của khung hình hiện tại, đã nới halo — dùng làm mặt nạ lúc so ảnh.
 *
 * Toạ độ ở đây là toạ độ ẢNH GỐC; hàm so ảnh tự quy đổi sang ảnh đã hạ độ phân giải
 * bằng `factor`.
 */
async function captureTextRegions(session) {
  const rects = await session.evaluate(`(${collectTextRectsInPage.toString()})(${SHOTS_TEXT_HALO})`);
  return {
    rects,
    tolerance: SHOTS_TEXT_TOLERANCE,
    inkTolerance: SHOTS_TEXT_INK_TOLERANCE,
    // Ngưỡng sắc PHẢI đi qua đối tượng này: khối so sánh chạy trong trang nên không
    // thấy được hằng số của module — một tham chiếu trực tiếp sẽ nổ `is not defined`
    // ngay lần chạy đầu.
    inkChroma: SHOTS_TEXT_INK_CHROMA,
    inkLevel: SHOTS_TEXT_INK_LEVEL,
    block: SHOTS_TEXT_BLOCK,
    factor: SHOTS_DOWNSCALE,
  };
}

/**
 * Hạ ảnh chụp xuống `factor` lần theo trung bình khối, chạy TRONG trang.
 *
 * Trả về ảnh đã hạ ở đúng định dạng chuẩn (`SHOTS_FORMAT`) cùng kích thước mới, để
 * Node không phải giải mã/ghép ảnh mà vẫn biết ảnh nào đã được ghi.
 *
 * `mime` trả về là định dạng TRÌNH DUYỆT thật sự mã hoá được: nếu nó khác định dạng
 * yêu cầu thì chỗ gọi phải dừng lại, không được ghi một tệp `.webp` chứa dữ liệu PNG.
 */
async function downscaleShotInPage(base64, factor, mime, format) {
  const decode = (source) =>
    new Promise((resolve, reject) => {
      const bytes = Uint8Array.from(atob(source), (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`không giải mã được ảnh ${mime}`));
      };
      image.src = url;
    });

  const image = await decode(base64);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const sourceContext = source.getContext('2d', { willReadFrequently: true });
  sourceContext.drawImage(image, 0, 0);
  const pixels = sourceContext.getImageData(0, 0, width, height).data;

  const columns = Math.ceil(width / factor);
  const rows = Math.ceil(height / factor);
  const sums = new Float64Array(columns * rows * 4);
  const counts = new Int32Array(columns * rows);
  for (let y = 0; y < height; y += 1) {
    const row = Math.floor(y / factor) * columns;
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const target = (row + Math.floor(x / factor)) * 4;
      sums[target] += pixels[offset];
      sums[target + 1] += pixels[offset + 1];
      sums[target + 2] += pixels[offset + 2];
      sums[target + 3] += pixels[offset + 3];
      counts[row + Math.floor(x / factor)] += 1;
    }
  }

  const means = new Uint8ClampedArray(columns * rows * 4);
  for (let index = 0; index < counts.length; index += 1) {
    const count = counts[index];
    for (let channel = 0; channel < 4; channel += 1) {
      means[index * 4 + channel] = Math.round(sums[index * 4 + channel] / count);
    }
  }

  const target = document.createElement('canvas');
  target.width = columns;
  target.height = rows;
  const context = target.getContext('2d', { willReadFrequently: true });
  context.putImageData(new ImageData(means, columns, rows), 0, 0);
  const encoded = format === 'webp' ? target.toDataURL('image/webp', 1) : target.toDataURL('image/png');
  // Bản PNG của ĐÚNG dữ liệu trung bình đó, luôn không mất dữ liệu, để chỗ gọi kiểm
  // xem codec đã ghi có làm méo gì không. Không có nó thì "codec không mất dữ liệu"
  // chỉ là niềm tin: đo được là WebP mặc định của Chrome lệch tới 61/255.
  const lossless = target.toDataURL('image/png');
  return {
    data: encoded.slice(encoded.indexOf(',') + 1),
    mime: encoded.slice('data:'.length, encoded.indexOf(';')),
    lossless: lossless.slice(lossless.indexOf(',') + 1),
    columns,
    rows,
  };
}

/** Hạ ảnh chụp xuống theo cấu hình chuẩn. Định dạng trả về mà khác yêu cầu là lỗi. */
async function downscaleShot(session, base64, mime) {
  const result = await session.evaluate(
    `(${downscaleShotInPage.toString()})(${JSON.stringify(base64)}, ${SHOTS_DOWNSCALE}, ${JSON.stringify(mime)}, ${JSON.stringify(SHOTS_FORMAT)})`,
  );
  const expected = SHOTS_FORMAT === 'webp' ? 'image/webp' : 'image/png';
  if (result.mime !== expected) {
    throw new Error(
      `trình duyệt mã hoá ảnh hạ độ phân giải thành ${result.mime} trong khi chuẩn cần ${expected} — đặt LAYOUT_SHOT_FORMAT=png hoặc dùng trình duyệt khác`,
    );
  }
  return result;
}

/**
 * So hai ảnh ngay trong trang — trình duyệt giải mã ảnh thay cho Node.
 *
 * `text` là vùng chữ đọc từ DOM (`{ rects, tolerance, block }`), `mime` để trình
 * duyệt biết giải mã định dạng nào (WebP hay PNG).
 */
async function compareShot(session, expected, actual, text, mime, tolerance = SHOTS_TOLERANCE) {
  return session.evaluate(
    `(${compareShotInPage.toString()})(${JSON.stringify(expected)}, ${JSON.stringify(actual)}, ${tolerance}, ${JSON.stringify(text)}, ${JSON.stringify(mime)})`,
  );
}

/**
 * Vẽ ảnh hiện tại với chỗ lệch được tô màu, để nhìn thấy ngay khi job đỏ.
 *
 * Ảnh nền để vẽ là ảnh chụp ĐỘ PHÂN GIẢI GỐC (`fullRes`), còn hai ảnh đem so là ảnh
 * đã hạ độ phân giải — nhờ vậy ảnh so sánh vẫn là giao diện thật, không phải bản thu nhỏ.
 */
async function renderShotDiff(session, expected, actual, text, mime, fullRes, overBlocks) {
  return session.evaluate(
    `(${renderShotDiffInPage.toString()})(${JSON.stringify(expected)}, ${JSON.stringify(actual)}, ${SHOTS_TOLERANCE}, ${JSON.stringify(text)}, ${JSON.stringify(mime)}, ${JSON.stringify(fullRes)}, ${JSON.stringify(overBlocks)})`,
  );
}

/** Đọc ảnh chụp chuẩn đã commit. Tệp hỏng thì báo thẳng, không coi như "chưa có". */
function readBaseline() {
  if (!existsSync(BASELINE_PATH)) return { states: {} };
  try {
    const parsed = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    return { states: parsed.states ?? {} };
  } catch (cause) {
    throw new Error(`Không đọc được ${BASELINE_PATH}: ${cause instanceof Error ? cause.message : cause}`);
  }
}

/** Ghi chuẩn mới, GỘP với chuẩn cũ để lần làm mới một phần không xoá phần còn lại. */
function writeBaseline(geometry, prune) {
  const states = prune ? { ...geometry } : { ...readBaseline().states, ...geometry };
  const sorted = Object.fromEntries(Object.entries(states).sort(([left], [right]) => left.localeCompare(right)));
  const document = {
    note: 'Ảnh chụp hình học từng trạng thái, sinh bằng LAYOUT_UPDATE_BASELINE=1 npm run audit:layout. Đây là hợp đồng bố cục: lệch quá tolerancePx là vi phạm hình học.',
    tolerancePx: BASELINE_TOLERANCE_PX,
    capturedWith: 'Chromium headless, deviceScaleFactor 1, thanh cuộn ẩn',
    states: sorted,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(document, null, 2) + '\n', 'utf8');
}

/**
 * So ảnh chụp hiện tại với chuẩn.
 *
 * Ba loại lệch, tách tên để đọc log là biết ngay loại gì:
 * - `geometry-drift`: khối còn đó nhưng xê dịch quá ngưỡng — loại lỗi thật sự cần
 *   bắt;
 * - `geometry-element-missing` / `geometry-element-added`: khối biến mất hoặc mới
 *   xuất hiện. Đây cũng là lệch bố cục, không phải chuyện nhỏ bỏ qua.
 */
function compareGeometry(key, snapshot, baseline) {
  const expected = baseline.states[key];
  if (expected === undefined) {
    return [
      {
        check: 'geometry-baseline-missing',
        detail: `${key} chưa có trong layout-baseline.json — trạng thái mới thì chạy LAYOUT_UPDATE_BASELINE=1 npm run audit:layout`,
      },
    ];
  }

  const found = [];
  for (const name of Object.keys(expected)) {
    if (!(name in snapshot)) found.push({ check: 'geometry-element-missing', detail: `${key} · ${name}` });
  }
  for (const [name, now] of Object.entries(snapshot)) {
    const before = expected[name];
    if (before === undefined) {
      found.push({ check: 'geometry-element-added', detail: `${key} · ${name}` });
      continue;
    }
    const changes = [];
    for (const field of ['top', 'left', 'width', 'height']) {
      const delta = now[field] - before[field];
      if (Math.abs(delta) > BASELINE_TOLERANCE_PX) {
        changes.push(`${field} ${before[field]}→${now[field]} (${delta > 0 ? '+' : ''}${delta})`);
      }
    }
    if (changes.length > 0) found.push({ check: 'geometry-drift', detail: `${key} · ${name}: ${changes.join(', ')}` });
  }
  return found;
}

/** So kết quả đo được với kỳ vọng; mọi lệch là một vi phạm. */
function collectSwipe(probe) {
  if (probe.available !== true) {
    return [{ check: 'swipe-probe-unavailable', detail: 'không tìm thấy thanh chọn chủ đề để mô phỏng cử chỉ' }];
  }

  const found = [];
  // Không có ô chọn thì bước "vuốt bắt đầu trên ô chọn" rơi vào thanh chọn và tự
  // "đạt" một cách vô nghĩa. Nói thẳng ra thay vì để độ phủ mất im lặng.
  if (probe.selectPresent !== true) {
    found.push({ check: 'swipe-probe-incomplete', detail: 'mục đầu không còn ô chọn nên bước kiểm "bỏ qua ô chọn" không chạy được' });
  }

  for (const expected of SWIPE_STEPS) {
    const index = probe.steps.findIndex((item) => item.name === expected.name);
    if (index === -1) {
      found.push({ check: 'swipe-step-missing', detail: expected.name });
      continue;
    }
    const step = probe.steps[index];
    const before = probe.steps[index - 1];
    const blockChanged = before !== undefined && step.scopeId !== before.scopeId;
    const detail = `${expected.name}: chọn ${step.activeIndex} (mong đợi ${expected.activeIndex}), khối dựng lại ${blockChanged} (mong đợi ${expected.changed})`;

    if (step.activeIndex !== expected.activeIndex) {
      found.push({ check: 'swipe-selection-wrong', detail: `${detail} · nhãn "${step.label ?? '—'}"` });
    }
    if (before !== undefined && blockChanged !== expected.changed) {
      found.push({ check: 'swipe-block-wrong', detail });
    }
    if (expected.direction !== undefined && step.direction !== expected.direction) {
      found.push({
        check: 'swipe-direction-wrong',
        detail: `${detail}, trượt ${step.direction ?? 'không'} (mong đợi ${expected.direction}) · transform=${step.transform} opacity=${step.opacity}`,
      });
    }
  }
  return found;
}

/**
 * Phép đo chạy TRONG trang.
 *
 * Viết dưới dạng hàm thuần, không tham chiếu biến ngoài, vì nó được truyền sang
 * trình duyệt qua `Function.prototype.toString`.
 */
function measureInPage() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const doc = document.documentElement;
  const nav = document.querySelector('nav[aria-label="Điều hướng chính"]');
  const navTop = nav === null ? vh : nav.getBoundingClientRect().top;

  const INTERACTIVE = 'button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="link"], [role="switch"]';

  const describe = (element) => {
    const tag = element.tagName.toLowerCase();
    const text = (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32);
    const cls = typeof element.className === 'string' && element.className !== '' ? '.' + element.className.trim().split(/\s+/)[0] : '';
    return text === '' ? tag + cls : tag + cls + ' "' + text + '"';
  };

  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0;
  };

  const report = {
    viewport: { width: vw, height: vh },
    scrollWidth: doc.scrollWidth,
    scrollHeight: doc.scrollHeight,
    clientHeight: doc.clientHeight,
    overflowX: Math.max(0, doc.scrollWidth - vw),
    clipped: [],
    cardScroll: [],
    smallTargets: [],
    navClipped: [],
    covered: [],
    behindNav: [],
  };

  // Cắt chữ do `overflow: hidden/clip`: chỉ xét phần tử giữ chữ trực tiếp, nếu
  // không mọi khung bao quanh đều bị tính là "cắt". Bỏ qua ellipsis có chủ ý:
  // nhãn dài trong danh sách xem trước được rút gọn bằng `text-overflow`, và
  // đó là thiết kế, không phải chữ bị mất ngoài ý muốn.
  for (const element of document.querySelectorAll('*')) {
    const style = getComputedStyle(element);
    const hiddenX = style.overflowX === 'hidden' || style.overflowX === 'clip';
    const hiddenY = style.overflowY === 'hidden' || style.overflowY === 'clip';
    if (!hiddenX && !hiddenY) continue;
    let holdsText = false;
    for (const node of element.childNodes) {
      if (node.nodeType === 3 && (node.textContent || '').trim() !== '') {
        holdsText = true;
        break;
      }
    }
    if (!holdsText) continue;
    const ellipsisX = style.textOverflow === 'ellipsis';
    if (hiddenX && !ellipsisX && element.scrollWidth - element.clientWidth > 1) {
      report.clipped.push({ el: describe(element), axis: 'x', over: element.scrollWidth - element.clientWidth });
    }
    if (hiddenY && element.scrollHeight - element.clientHeight > 1) {
      report.clipped.push({ el: describe(element), axis: 'y', over: element.scrollHeight - element.clientHeight });
    }
  }

  // Mặt thẻ không được tự mọc thanh cuộn bên trong: nội dung dài hơn khung là lỗi
  // bố cục, không phải tính năng.
  for (const face of document.querySelectorAll('.face')) {
    if (face.scrollHeight - face.clientHeight > 1) {
      report.cardScroll.push({ el: describe(face), over: face.scrollHeight - face.clientHeight });
    }
  }

  const targets = [...document.querySelectorAll(INTERACTIVE)].filter(visible);
  for (const element of targets) {
    const rect = element.getBoundingClientRect();
    if (Math.min(rect.width, rect.height) < 32 - 0.5) {
      report.smallTargets.push({ el: describe(element), w: Math.round(rect.width), h: Math.round(rect.height) });
    }
  }

  if (nav !== null) {
    for (const label of nav.querySelectorAll('span')) {
      if (label.scrollWidth - label.clientWidth > 1) report.navClipped.push(describe(label));
    }
  }

  for (const element of targets) {
    const rect = element.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= vh) continue;

    // Điểm giữa có chạm tới phần tử không? `elementFromPoint` tại tâm nút trả về
    // chính nút đó (hoặc con của nó); trả về thứ khác nghĩa là nút bị che.
    const cx = Math.min(Math.max(rect.left + rect.width / 2, 0), vw - 1);
    const cy = Math.min(Math.max(rect.top + rect.height / 2, 0), vh - 1);
    const hit = document.elementFromPoint(cx, cy);
    if (hit === null || (hit !== element && !element.contains(hit) && !hit.contains(element))) {
      report.covered.push({ el: describe(element), hit: hit === null ? 'null' : describe(hit) });
    }

    // Nằm một phần sau thanh điều hướng cố định. Bỏ qua chính các tab trong thanh:
    // chúng ở đúng chỗ của mình.
    if (nav !== null && !nav.contains(element) && rect.bottom > navTop + 1 && rect.top < vh) {
      report.behindNav.push({
        el: describe(element),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        navTop: Math.round(navTop),
      });
    }
  }

  return report;
}

/**
 * Mô phỏng cử chỉ vuốt ngang ở màn Nhập/xuất — chạy TRONG trang.
 *
 * Cùng ràng buộc với `measureInPage`: hàm thuần, không tham chiếu biến ngoài, vì nó
 * được truyền sang trình duyệt qua `Function.prototype.toString`.
 *
 * Mỗi bước vuốt trả về ba thứ: mục đang được chọn (theo chỉ số), khối nội dung có
 * được dựng lại không (so danh tính phần tử — cách duy nhất phân biệt "không đổi"
 * với "đổi rồi nhưng trông giống nhau"), và dấu dịch ngang của khối mới ngay sau
 * khi nó xuất hiện. Hiệu ứng chạy 200ms và đơn điệu, nên đọc ở khung hình đầu vẫn
 * giữ đúng dấu.
 */
function swipeProbeInPage() {
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(true)));
  const picker = document.querySelector('.section-picker');
  const surface = document.querySelector('.swipe-surface');
  if (picker === null || surface === null) return Promise.resolve({ available: false });

  const buttons = [...picker.querySelectorAll('button')];
  const tags = new WeakMap();
  let nextTag = 0;
  const scopeId = (element) => {
    if (element === null) return -1;
    if (!tags.has(element)) tags.set(element, ++nextTag);
    return tags.get(element);
  };

  const observe = () => {
    // Tab Liquid Glass đánh dấu mục đang chọn bằng `aria-selected`, không phải
    // class `active` cũ; đọc cả hai để phép dò không phụ thuộc cách tô trạng thái.
    const activeIndex = buttons.findIndex(
      (button) => button.classList.contains('active') || button.getAttribute('aria-selected') === 'true',
    );
    const scope = document.querySelector('.scope');
    const style = scope === null ? null : getComputedStyle(scope);
    let direction = null;
    if (style !== null) {
      const match = /matrix\(([^)]+)\)/.exec(style.transform);
      if (match !== null) {
        const translateX = Number(match[1].split(',')[4]);
        if (Number.isFinite(translateX) && Math.abs(translateX) > 0.5) direction = Math.sign(translateX);
      }
    }
    return {
      activeIndex,
      label: activeIndex === -1 ? null : (buttons[activeIndex].textContent || '').trim(),
      scopeId: scopeId(scope),
      direction,
      transform: style === null ? 'none' : style.transform,
      opacity: style === null ? null : Number(style.opacity),
    };
  };

  const touch = (element, type, x, y) => {
    const point = new Touch({ identifier: 1, target: element, clientX: x, clientY: y });
    element.dispatchEvent(
      new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: type === 'touchend' ? [] : [point],
        targetTouches: type === 'touchend' ? [] : [point],
        changedTouches: [point],
      }),
    );
  };

  const gesture = async (element, dx, dy = 0) => {
    const rect = element.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    touch(element, 'touchstart', x, y);
    // `touchend` mang toạ độ ĐIỂM KẾT THÚC; khoảng cách so với điểm bắt đầu mới là
    // cử chỉ, nên phải cộng delta vào đây.
    touch(element, 'touchend', x + dx, y + dy);
    await frame();
    return observe();
  };

  return (async () => {
    const steps = [{ name: 'baseline', ...observe() }];
    const record = async (name, element, dx, dy = 0) => {
      steps.push({ name, ...(await gesture(element, dx, dy)) });
    };

    // Vuốt trên THÂN khối, không trên thanh tab: thanh tab Liquid Glass là bề mặt
    // kéo lớp kính chỉ báo, nên cử chỉ ngang ở đó không còn là "đổi chủ đề". Khối
    // `.scope` được dựng lại theo `{#key section}` nên phải tìm lại sau mỗi bước.
    // Dùng dòng gợi ý trong khối thay vì cả khối: tâm khối có thể rơi trúng ô chọn,
    // mà cử chỉ bắt đầu trên ô chọn phải bị bỏ qua theo thiết kế.
    const contentTarget = () =>
      surface.querySelector('.scope-note') ?? surface.querySelector('.scope') ?? surface;
    await record('next', contentTarget(), -80);
    await record('previous', contentTarget(), 80);
    // Vuốt ngược ở mục đầu và xuôi ở mục cuối đều phải dừng, không quay vòng.
    await record('first-item-clamp', contentTarget(), 80);
    await record('short-swipe', contentTarget(), -20);
    // Ô chọn nằm trong `.scope`; tìm trên cả vùng thay vì trên dòng gợi ý vừa dùng
    // để vuốt, nếu không sẽ luôn ra null và bước kiểm này lặng lẽ mất tác dụng.
    const select = surface.querySelector('select');
    // Ô chọn nằm trong vùng nhận cử chỉ, nên vuốt bắt đầu trên nó phải bị bỏ qua.
    await record('swipe-on-select', select === null ? contentTarget() : select, -90);
    // Vuốt xiên: dịch ngang đủ lớn nhưng dịch dọc trội hơn — đây là cuộn, không phải
    // đổi chủ đề.
    await record('vertical-dominant', contentTarget(), -80, 120);
    await record('reach-middle', contentTarget(), -80);
    await record('reach-last', contentTarget(), -80);
    await record('past-end', contentTarget(), -80);

    return { available: true, steps, selectPresent: select !== null };
  })();
}

/**
 * Vùng chữ của khung hình hiện tại — chạy TRONG trang.
 *
 * Trả về danh sách hộp (đã nới `halo` px) của mọi nút văn bản đang HIỆN: hộp theo
 * TỪNG DÒNG do `Range.getClientRects()` trả về, nên chữ xuống dòng vẫn được phủ đúng
 * từng dòng chứ không phải cả khối.
 *
 * Lấy từ DOM đang render chứ không lưu mặt nạ vào chuẩn: mặt nạ là hệ quả của bố cục
 * hiện tại, và nếu lưu nó thành tệp thì mỗi lần đổi bố cục lại phải cập nhật thêm một
 * thứ nữa có thể lệch với ảnh.
 *
 * Ô nhập / ô chọn vẽ chữ bằng trình duyệt (placeholder, mục đang chọn) chứ không phải
 * nút văn bản, nhưng vẫn là chữ — nên chúng được lấy theo HỘP NỘI DUNG (trừ viền) để
 * viền và nền của ô vẫn được so từng pixel.
 */
function collectTextRectsInPage(halo) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const rects = [];
  const push = (left, top, right, bottom) => {
    const x0 = Math.max(0, left - halo);
    const y0 = Math.max(0, top - halo);
    const x1 = Math.min(width, right + halo);
    const y1 = Math.min(height, bottom + halo);
    if (x1 > x0 && y1 > y0) rects.push([x0, y0, x1, y1]);
  };
  const visible = (element) => {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (Number.parseFloat(style.opacity) === 0) return false;
    return Number.parseFloat(style.fontSize) > 0;
  };

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if ((node.textContent ?? '').trim() === '') continue;
    const parent = node.parentElement;
    if (parent === null || !visible(parent)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) push(rect.left, rect.top, rect.right, rect.bottom);
  }

  for (const field of document.querySelectorAll('input, textarea, select')) {
    const tag = field.tagName.toLowerCase();
    const showsText =
      tag === 'select' || ((field.value ?? '') === '' && (field.getAttribute('placeholder') ?? '') !== '');
    if (!showsText || !visible(field)) continue;
    const box = field.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    push(box.left + field.clientLeft, box.top + field.clientTop, box.left + field.clientLeft + field.clientWidth, box.top + field.clientTop + field.clientHeight);
  }

  return rects;
}

/**
 * So hai ảnh **theo vùng** ngay trong trang.
 *
 * Dùng `Blob` chứ không phải `data:` URL: `Blob` cùng nguồn với trang nên canvas
 * không bị coi là "làm bẩn", `getImageData` chạy được.
 *
 * Trả về HAI bộ đếm tách biệt: `imageDiff` là pixel NGOÀI vùng chữ lệch quá
 * `tolerance`, `textDiff` là pixel TRONG vùng chữ thuộc khối có trung bình lệch quá
 * `text.tolerance`. Kèm chênh lớn nhất của mỗi loại và vài toạ độ mẫu — để log chỉ
 * đúng chỗ đổi và nói được đó là lệch màu thật hay nhiễu vẽ chữ.
 */
async function compareShotInPage(expectedBase64, actualBase64, tolerance, text, mime) {
  const decode = (base64) =>
    new Promise((resolve, reject) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`không giải mã được ảnh ${mime}`));
      };
      image.src = url;
    });

  const [expected, actual] = await Promise.all([decode(expectedBase64), decode(actualBase64)]);
  const width = actual.naturalWidth;
  const height = actual.naturalHeight;
  if (expected.naturalWidth !== width || expected.naturalHeight !== height) {
    return {
      sizeChanged: { expected: [expected.naturalWidth, expected.naturalHeight], actual: [width, height] },
      total: 0,
      masked: 0,
      imageDiff: 0,
      textDiff: 0,
      maxDelta: 0,
      maxTextDelta: 0,
      maxInkDelta: 0,
      maxInkChroma: 0,
      blocksOver: 0,
      blocksInkOver: 0,
      blocksInkChromaOver: 0,
      inkBlocks: 0,
      textTolerance: text.tolerance,
      textInkTolerance: text.inkTolerance ?? text.tolerance,
      textBlock: text.block,
      spots: [],
      blockSpots: [],
      inkSpots: [],
      chromaSpots: [],
      overBlocks: [],
    };
  }

  const pixels = (image) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, width, height).data;
  };

  const wanted = pixels(expected);
  const given = pixels(actual);
  const total = width * height;

  // Mặt nạ vùng chữ, ở mức KHỐI của ảnh đã hạ độ phân giải: khối nào có chữ thì khối
  // đó thuộc tầng "text". Hộp chữ là toạ độ ảnh GỐC nên chia cho `factor` trước khi
  // đối chiếu với ảnh đã hạ.
  const factor = Math.max(1, Math.round(text.factor ?? 1));
  const mask = new Uint8Array(total);
  let masked = 0;
  for (const rect of text.rects) {
    const x0 = Math.max(0, Math.floor(rect[0] / factor));
    const y0 = Math.max(0, Math.floor(rect[1] / factor));
    const x1 = Math.min(width, Math.ceil(rect[2] / factor));
    const y1 = Math.min(height, Math.ceil(rect[3] / factor));
    for (let y = y0; y < y1; y += 1) {
      const row = y * width;
      for (let x = x0; x < x1; x += 1) {
        if (mask[row + x] === 0) {
          mask[row + x] = 1;
          masked += 1;
        }
      }
    }
  }

  // Tích luỹ tổng màu của từng khối để so trung bình ở vùng chữ.
  const block = Math.max(1, Math.round(text.block));
  const columns = Math.ceil(width / block);
  const blockCount = columns * Math.ceil(height / block);
  const sumWanted = new Float64Array(blockCount * 3);
  const sumGiven = new Float64Array(blockCount * 3);
  const count = new Int32Array(blockCount);
  const maskedInBlock = new Int32Array(blockCount);
  // Khoảng sáng/tối của từng khối, cho từng ảnh: ngưỡng "mực" lấy theo trung điểm của
  // chính khối đó, nên nó đúng cho cả chữ sẫm trên nền sáng lẫn chữ sáng trên nền sẫm.
  const minLumWanted = new Float64Array(blockCount).fill(Number.POSITIVE_INFINITY);
  const maxLumWanted = new Float64Array(blockCount).fill(Number.NEGATIVE_INFINITY);
  const minLumGiven = new Float64Array(blockCount).fill(Number.POSITIVE_INFINITY);
  const maxLumGiven = new Float64Array(blockCount).fill(Number.NEGATIVE_INFINITY);
  const luminance = (data, offset) => 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];

  let imageDiff = 0;
  let maxDelta = 0;
  const spots = [];
  for (let offset = 0; offset < wanted.length; offset += 4) {
    const index = offset / 4;
    const x = index % width;
    const y = (index - x) / width;
    const blockIndex = Math.floor(y / block) * columns + Math.floor(x / block);
    sumWanted[blockIndex * 3] += wanted[offset];
    sumWanted[blockIndex * 3 + 1] += wanted[offset + 1];
    sumWanted[blockIndex * 3 + 2] += wanted[offset + 2];
    sumGiven[blockIndex * 3] += given[offset];
    sumGiven[blockIndex * 3 + 1] += given[offset + 1];
    sumGiven[blockIndex * 3 + 2] += given[offset + 2];
    count[blockIndex] += 1;
    const lumWanted = luminance(wanted, offset);
    const lumGiven = luminance(given, offset);
    if (lumWanted < minLumWanted[blockIndex]) minLumWanted[blockIndex] = lumWanted;
    if (lumWanted > maxLumWanted[blockIndex]) maxLumWanted[blockIndex] = lumWanted;
    if (lumGiven < minLumGiven[blockIndex]) minLumGiven[blockIndex] = lumGiven;
    if (lumGiven > maxLumGiven[blockIndex]) maxLumGiven[blockIndex] = lumGiven;

    if (mask[index] === 1) {
      maskedInBlock[blockIndex] += 1;
      continue;
    }
    const delta = Math.max(
      Math.abs(wanted[offset] - given[offset]),
      Math.abs(wanted[offset + 1] - given[offset + 1]),
      Math.abs(wanted[offset + 2] - given[offset + 2]),
      Math.abs(wanted[offset + 3] - given[offset + 3]),
    );
    if (delta > tolerance) {
      imageDiff += 1;
      if (delta > maxDelta) maxDelta = delta;
      if (spots.length < 4) {
        spots.push({
          // Toạ độ báo ra theo ẢNH GỐC (nhân lại `factor`) để đọc là đối chiếu được
          // với ảnh so sánh, thay vì phải tự quy đổi độ phân giải.
          x: x * factor,
          y: y * factor,
          delta,
          where: 'image',
          before: [wanted[offset], wanted[offset + 1], wanted[offset + 2]],
          after: [given[offset], given[offset + 1], given[offset + 2]],
        });
      }
    }
  }

  // ── Tầng chữ, thước đo thứ hai: MÀU MỰC ──────────────────────────────────
  // Trung bình khối bị pha loãng bởi nền (mực thường chỉ chiếm ~20% khối), nên một
  // thay đổi màu chữ 60/255 chỉ còn ~12 ở trung bình khối — đúng bằng ngưỡng. Màu mực
  // lấy trung bình các pixel ĐẬM HƠN TRUNG ĐIỂM của khối (tức gần như chỉ pixel lõi của
  // nét chữ) nên giữ được gần đủ độ lớn của thay đổi, đồng thời loại phần lớn pixel rìa
  // — chính chỗ hai renderer vẽ khác nhau.
  const inkSumWanted = new Float64Array(blockCount * 3);
  const inkSumGiven = new Float64Array(blockCount * 3);
  const inkCountWanted = new Int32Array(blockCount);
  const inkCountGiven = new Int32Array(blockCount);
  if (masked > 0) {
    for (let offset = 0; offset < wanted.length; offset += 4) {
      const index = offset / 4;
      const x = index % width;
      const y = (index - x) / width;
      const blockIndex = Math.floor(y / block) * columns + Math.floor(x / block);
      if (maskedInBlock[blockIndex] === 0) continue;
      // Ngưỡng mực lấy từ ảnh CHUẨN và dùng cho cả hai ảnh — xem khối SHOTS_TEXT_INK_LEVEL.
      const level = text.inkLevel ?? 0.5;
      const threshold = minLumWanted[blockIndex] + (maxLumWanted[blockIndex] - minLumWanted[blockIndex]) * level;
      if (luminance(wanted, offset) <= threshold) {
        inkSumWanted[blockIndex * 3] += wanted[offset];
        inkSumWanted[blockIndex * 3 + 1] += wanted[offset + 1];
        inkSumWanted[blockIndex * 3 + 2] += wanted[offset + 2];
        inkCountWanted[blockIndex] += 1;
      }
      if (luminance(given, offset) <= threshold) {
        inkSumGiven[blockIndex * 3] += given[offset];
        inkSumGiven[blockIndex * 3 + 1] += given[offset + 1];
        inkSumGiven[blockIndex * 3 + 2] += given[offset + 2];
        inkCountGiven[blockIndex] += 1;
      }
    }
  }

  // Khối nào có chữ thì đánh giá theo TRUNG BÌNH khối, theo MÀU MỰC và theo ĐỘ LỆCH SẮC
  // của mực, không theo từng pixel: khối bị coi là lệch khi một trong ba thước đo vượt
  // ngưỡng của nó.
  let textDiff = 0;
  let maxTextDelta = 0;
  let maxInkDelta = 0;
  let maxInkChroma = 0;
  let blocksOver = 0;
  let blocksInkOver = 0;
  let blocksInkChromaOver = 0;
  let inkBlocks = 0;
  const blockSpots = [];
  const inkSpots = [];
  const chromaSpots = [];
  const overBlocks = [];
  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    if (maskedInBlock[blockIndex] === 0 || count[blockIndex] === 0) continue;
    const meanDelta =
      Math.max(
        Math.abs(sumWanted[blockIndex * 3] - sumGiven[blockIndex * 3]),
        Math.abs(sumWanted[blockIndex * 3 + 1] - sumGiven[blockIndex * 3 + 1]),
        Math.abs(sumWanted[blockIndex * 3 + 2] - sumGiven[blockIndex * 3 + 2]),
      ) / count[blockIndex];
    let inkDelta = 0;
    let inkChroma = 0;
    if (inkCountWanted[blockIndex] > 0 && inkCountGiven[blockIndex] > 0) {
      inkBlocks += 1;
      // Từng kênh một: hiệu của trung bình mực giữa hai ảnh (có dấu), rồi lấy hai con số
      // từ đó — độ lớn lớn nhất (thước đo thứ hai) và khoảng cách giữa kênh lệch nhiều
      // nhất với kênh lệch ít nhất (thước đo thứ ba, xem khối SHOTS_TEXT_INK_CHROMA).
      const dr = inkSumWanted[blockIndex * 3] / inkCountWanted[blockIndex] - inkSumGiven[blockIndex * 3] / inkCountGiven[blockIndex];
      const dg = inkSumWanted[blockIndex * 3 + 1] / inkCountWanted[blockIndex] - inkSumGiven[blockIndex * 3 + 1] / inkCountGiven[blockIndex];
      const db = inkSumWanted[blockIndex * 3 + 2] / inkCountWanted[blockIndex] - inkSumGiven[blockIndex * 3 + 2] / inkCountGiven[blockIndex];
      inkDelta = Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db));
      inkChroma = Math.max(dr, dg, db) - Math.min(dr, dg, db);
      // Hai cực đại được ghi VÔ ĐIỀU KIỆN, không chỉ khi khối đã vượt ngưỡng: đây là số
      // để đọc lại mà chọn ngưỡng ("nhiễu renderer lên tới bao nhiêu, thay đổi thật lên
      // tới bao nhiêu"), nên nếu nó chỉ ghi phần đã vượt ngưỡng thì nó luôn trả về 0 khi
      // ngưỡng đang đúng — đọc thành "không có khác biệt nào" trong khi thực ra là "không
      // có khối nào vượt ngưỡng".
      if (inkDelta > maxInkDelta) maxInkDelta = inkDelta;
      if (inkChroma > maxInkChroma) maxInkChroma = inkChroma;
    }
    const meanOver = meanDelta > text.tolerance;
    const inkOver = inkDelta > (text.inkTolerance ?? text.tolerance);
    // `inkChroma` đến từ `captureTextRegions` — không đọc được hằng số module ở trong
    // trang, nên ngưỡng phải đi theo đối tượng `text`. Bên gọi nào không truyền (chỉ có
    // đường kiểm tra codec, vốn không có vùng chữ) thì thước đo này im lặng, còn hai
    // thước đo kia vẫn chạy.
    const chromaOver = text.inkChroma !== undefined && inkChroma > text.inkChroma;
    if (!meanOver && !inkOver && !chromaOver) continue;
    blocksOver += 1;
    overBlocks.push(blockIndex);
    textDiff += maskedInBlock[blockIndex];
    if (meanOver) {
      if (meanDelta > maxTextDelta) maxTextDelta = meanDelta;
      if (blockSpots.length < 3) {
        blockSpots.push({
          x: (blockIndex % columns) * block * factor,
          y: Math.floor(blockIndex / columns) * block * factor,
          delta: Math.round(meanDelta),
          where: 'text',
          before: [Math.round(sumWanted[blockIndex * 3] / count[blockIndex]), Math.round(sumWanted[blockIndex * 3 + 1] / count[blockIndex]), Math.round(sumWanted[blockIndex * 3 + 2] / count[blockIndex])],
          after: [Math.round(sumGiven[blockIndex * 3] / count[blockIndex]), Math.round(sumGiven[blockIndex * 3 + 1] / count[blockIndex]), Math.round(sumGiven[blockIndex * 3 + 2] / count[blockIndex])],
        });
      }
    }
    if (chromaOver) {
      blocksInkChromaOver += 1;
      if (chromaSpots.length < 3) {
        chromaSpots.push({
          x: (blockIndex % columns) * block * factor,
          y: Math.floor(blockIndex / columns) * block * factor,
          delta: Math.round(inkChroma),
          where: 'ink-chroma',
          before: [Math.round(inkSumWanted[blockIndex * 3] / inkCountWanted[blockIndex]), Math.round(inkSumWanted[blockIndex * 3 + 1] / inkCountWanted[blockIndex]), Math.round(inkSumWanted[blockIndex * 3 + 2] / inkCountWanted[blockIndex])],
          after: [Math.round(inkSumGiven[blockIndex * 3] / inkCountGiven[blockIndex]), Math.round(inkSumGiven[blockIndex * 3 + 1] / inkCountGiven[blockIndex]), Math.round(inkSumGiven[blockIndex * 3 + 2] / inkCountGiven[blockIndex])],
        });
      }
    }
    if (inkOver) {
      blocksInkOver += 1;
      if (inkSpots.length < 3) {
        inkSpots.push({
          x: (blockIndex % columns) * block * factor,
          y: Math.floor(blockIndex / columns) * block * factor,
          delta: Math.round(inkDelta),
          where: 'ink',
          before: [Math.round(inkSumWanted[blockIndex * 3] / inkCountWanted[blockIndex]), Math.round(inkSumWanted[blockIndex * 3 + 1] / inkCountWanted[blockIndex]), Math.round(inkSumWanted[blockIndex * 3 + 2] / inkCountWanted[blockIndex])],
          after: [Math.round(inkSumGiven[blockIndex * 3] / inkCountGiven[blockIndex]), Math.round(inkSumGiven[blockIndex * 3 + 1] / inkCountGiven[blockIndex]), Math.round(inkSumGiven[blockIndex * 3 + 2] / inkCountGiven[blockIndex])],
        });
      }
    }
  }

  return {
    total,
    masked,
    imageDiff,
    textDiff,
    maxDelta,
    maxTextDelta: Math.round(maxTextDelta),
    maxInkDelta: Math.round(maxInkDelta),
    maxInkChroma: Math.round(maxInkChroma),
    blocksOver,
    blocksInkOver,
    blocksInkChromaOver,
    inkBlocks,
    textTolerance: text.tolerance,
    textInkTolerance: text.inkTolerance ?? text.tolerance,
    textInkChroma: text.inkChroma ?? null,
    textBlock: block,
    spots,
    blockSpots,
    inkSpots,
    chromaSpots,
    // Chỉ số các khối chữ lệch, để bước vẽ ảnh so sánh dùng đúng kết luận này.
    overBlocks: overBlocks,
  };
}

/**
 * Ảnh hiện tại với chỗ lệch được tô màu — mở ra là thấy ngay vùng khác màu.
 *
 * Hai màu để đọc được nguyên nhân ngay trên ảnh: **magenta** là pixel ngoài vùng chữ
 * lệch quá ngưỡng (đổi màu/nền/biểu tượng thật), **xanh dương** là vùng chữ thuộc
 * khối có trung bình lệch quá ngưỡng (chữ đổi màu, hoặc khác biệt phông/phiên bản).
 */
async function renderShotDiffInPage(expectedBase64, actualBase64, tolerance, text, mime, fullResBase64, overBlockIndexes) {
  const decode = (base64) =>
    new Promise((resolve, reject) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`không giải mã được ảnh ${mime}`));
      };
      image.src = url;
    });

  const [expected, actual, full] = await Promise.all([
    decode(expectedBase64),
    decode(actualBase64),
    decode(fullResBase64),
  ]);
  // `width`/`height` là độ phân giải SO SÁNH (đã hạ); ảnh nền để vẽ là ảnh GỐC, nên
  // chỗ lệch hiện ra trên giao diện thật chứ không phải trên ảnh đã hạ.
  const width = actual.naturalWidth;
  const height = actual.naturalHeight;
  const factor = Math.max(1, Math.round(text.factor ?? 1));
  const canvas = document.createElement('canvas');
  canvas.width = full.naturalWidth;
  canvas.height = full.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(full, 0, 0);
  const shown = context.getImageData(0, 0, full.naturalWidth, full.naturalHeight);

  const wanted = document.createElement('canvas');
  wanted.width = width;
  wanted.height = height;
  const wantedContext = wanted.getContext('2d', { willReadFrequently: true });
  wantedContext.drawImage(expected, 0, 0);
  const before = wantedContext.getImageData(0, 0, width, height).data;

  const mask = new Uint8Array(width * height);
  for (const rect of text.rects) {
    const x0 = Math.max(0, Math.floor(rect[0] / factor));
    const y0 = Math.max(0, Math.floor(rect[1] / factor));
    const x1 = Math.min(width, Math.ceil(rect[2] / factor));
    const y1 = Math.min(height, Math.ceil(rect[3] / factor));
    for (let y = y0; y < y1; y += 1) {
      const row = y * width;
      for (let x = x0; x < x1; x += 1) mask[row + x] = 1;
    }
  }

  const block = Math.max(1, Math.round(text.block));
  const columns = Math.ceil(width / block);
  const pixelOver = new Uint8Array(width * height);
  // Danh sách khối chữ bị coi là lệch được TRUYỀN VÀO từ bước so ảnh, không tính lại ở
  // đây: cùng một quyết định (trung bình khối + màu mực + ngân sách) không được có hai
  // bản cài đặt để rồi lệch nhau.
  const overBlock = new Set(overBlockIndexes ?? []);

  for (let offset = 0; offset < before.length; offset += 4) {
    const index = offset / 4;
    if (mask[index] === 1) continue;
    const delta = Math.max(
      Math.abs(before[offset] - shown.data[offset]),
      Math.abs(before[offset + 1] - shown.data[offset + 1]),
      Math.abs(before[offset + 2] - shown.data[offset + 2]),
    );
    if (delta > tolerance) pixelOver[index] = 1;
  }

  // Tô màu trên ảnh GỐC: mỗi điểm của ảnh so sánh ứng với một ô `factor`×`factor` của
  // ảnh gốc, nên một chỗ lệch hiện ra thành đúng vùng trên giao diện thật.
  const shownWidth = full.naturalWidth;
  for (let y = 0; y < full.naturalHeight; y += 1) {
    const compareY = Math.min(height - 1, Math.floor(y / factor));
    for (let x = 0; x < shownWidth; x += 1) {
      const compareX = Math.min(width - 1, Math.floor(x / factor));
      const compareIndex = compareY * width + compareX;
      const textBlock = Math.floor(compareY / block) * columns + Math.floor(compareX / block);
      const isText = mask[compareIndex] === 1 && overBlock.has(textBlock);
      const isImage = mask[compareIndex] !== 1 && pixelOver[compareIndex] === 1;
      if (!isText && !isImage) continue;
      const offset = (y * shownWidth + x) * 4;
      shown.data[offset] = isText ? 0 : 255;
      shown.data[offset + 1] = isText ? 160 : 0;
      shown.data[offset + 2] = 255;
      shown.data[offset + 3] = 255;
    }
  }

  context.putImageData(shown, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Ảnh chụp hình học của một trạng thái màn hình — chạy TRONG trang.
 *
 * Ghi toạ độ/kích thước của bộ xương bố cục chứ KHÔNG ghi chữ: chữ đổi nội dung là
 * chuyện bình thường (số liệu, số thẻ), còn khối xê dịch mới là lỗi.
 *
 * Khoá gồm cả dấu vân tay (`child[1] section.card`) để khi một khối bị thay bằng
 * khối khác, log nói ra được điều đó thay vì chỉ báo "lệch".
 */
function captureGeometryInPage() {
  const box = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  };

  const fingerprint = (element) => {
    const tag = element.tagName.toLowerCase();
    const classes = typeof element.className === 'string' ? element.className.trim().split(/\s+/)[0] : '';
    return classes === '' ? tag : tag + '.' + classes;
  };

  const snapshot = {};
  const screen = document.querySelector('main.screen');
  if (screen !== null) {
    snapshot['main.screen'] = box(screen);
    let index = 0;
    for (const child of screen.children) {
      snapshot['child[' + index + '] ' + fingerprint(child)] = box(child);
      index += 1;
    }
  }

  const nav = document.querySelector('nav[aria-label="Điều hướng chính"]');
  if (nav !== null) snapshot['nav'] = box(nav);

  // Khối có ý nghĩa bố cục, chỉ có ở một số trạng thái. Xuất hiện rồi biến mất cũng
  // là lệch — đó chính là cách bắt "state này lẽ ra phải có hai cột".
  for (const selector of [
    '.study-body',
    '.stage',
    '.study-controls',
    '.ratings',
    '.answer-form',
    '.section-picker',
    '.segmented',
    '.dropzone',
    '.grid-stats',
  ]) {
    const element = document.querySelector(selector);
    if (element !== null) snapshot['landmark ' + selector] = box(element);
  }

  const page = document.documentElement;
  snapshot['page'] = { top: 0, left: 0, width: page.scrollWidth, height: page.scrollHeight };
  return snapshot;
}

function collect(report, position) {
  const found = [];
  const add = (check, detail) => found.push({ check, position, detail });

  if (report.overflowX > 1) add('overflow-x', `scrollWidth ${report.scrollWidth} > ${report.viewport.width}`);
  for (const item of report.clipped) add('clipped-text', `${item.el} (${item.axis} +${item.over}px)`);
  for (const item of report.cardScroll) add('card-internal-scroll', `${item.el} (+${item.over}px)`);
  for (const item of report.smallTargets) add('small-target', `${item.el} ${item.w}x${item.h}`);
  for (const item of report.navClipped) add('nav-label-clipped', item);
  // Hai phép kiểm "chạm tới được" và "nằm sau thanh điều hướng" chỉ có nghĩa khi đã
  // cuộn tới đáy: ở đầu trang, một nút nằm dưới màn hình (hoặc ngay dưới thanh điều
  // hướng) là chuyện bình thường — người dùng còn cuộn thêm được. Lỗi thật là khi
  // CUỘN HẾT CỠ mà vẫn không với tới.
  if (position === 'bottom') {
    for (const item of report.covered) add('unreachable', `${item.el} covered by ${item.hit}`);
    for (const item of report.behindNav) add('behind-nav', `${item.el} ${item.top}…${item.bottom} vs nav ${item.navTop}`);
  }
  return found;
}

// ── Tiện ích ──────────────────────────────────────────────────────────────

function selectById(all, filter, label) {
  if (filter === undefined || filter === '') return all;
  const wanted = new Set(
    filter
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value !== ''),
  );
  requireKnownIds(label, wanted, all);
  const chosen = all.filter((item) => wanted.has(item.id));
  if (chosen.length === 0) throw new Error(`Không có mục nào khớp: ${filter}`);
  return chosen;
}

/**
 * Từ chối id không tồn tại thay vì lặng lẽ bỏ qua.
 *
 * Bỏ qua im lặng là kiểu hỏng tệ nhất ở đây: một tên viết sai thì lệnh vẫn chạy tới
 * cùng, không so gì cả, và pipeline vẫn xanh — phép kiểm biến mất mà không ai biết.
 * Lỗi kèm danh sách id hợp lệ để sửa được ngay.
 */
function requireKnownIds(label, ids, all) {
  const known = new Set(all.map((item) => item.id));
  const unknown = [...ids].filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(`${label}: không có mục nào tên ${unknown.join(', ')} — id hợp lệ: ${[...known].join(', ')}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
