<script module lang="ts">
  /**
   * Bộ biểu tượng SVG nội tuyến.
   *
   * # Vì sao không dùng thư viện biểu tượng
   *
   * Ứng dụng chỉ cần khoảng mười lăm hình, tất cả đều là nét đơn giản. Một thư
   * viện biểu tượng sẽ thêm một dependency, một bước build, và vài chục KB cho
   * những hình không dùng tới — trong khi đặc tả §5 yêu cầu chỉ thêm dependency
   * khi giá trị lớn hơn chi phí. Mười lăm đường dẫn SVG nội tuyến thì không có
   * chi phí nào.
   *
   * # Quy ước
   *
   * - `currentColor` cho cả nét và màu: biểu tượng tự khớp với chữ xung quanh, kể
   *   cả khi chữ đổi màu theo trạng thái (tab đang mở, nút bị vô hiệu).
   * - `stroke-linecap="round"` + `stroke-linejoin="round"`: nét tròn trông nhẹ hơn
   *   và hợp với bán kính lớn của giao diện.
   * - `aria-hidden="true"`: mọi biểu tượng đều đi kèm nhãn chữ hoặc nằm trong nút
   *   đã có `aria-label`. Để trình đọc màn hình đọc cả hai sẽ gây nhiễu.
   *
   * Dữ liệu đường dẫn nằm ở phạm vi MODULE, không phải phạm vi instance: nó là
   * hằng số, và đặt ở đây thì mọi biểu tượng dùng chung một bảng thay vì dựng lại
   * sau mỗi lần render.
   */

  export type IconName =
    | 'home'
    | 'study'
    | 'transfer'
    | 'settings'
    | 'chevron'
    | 'check'
    | 'close'
    | 'shuffle'
    | 'refresh'
    | 'alert'
    | 'download'
    | 'upload'
    | 'trash'
    | 'layers'
    | 'sparkle'
    | 'search'
    | 'chart'
    | 'edit';

  /**
   * Mỗi biểu tượng là danh sách các đường dẫn trong khung 24×24.
   *
   * Dùng mảng thay vì một chuỗi `d` duy nhất vì vài hình cần nhiều nét rời (ví dụ
   * `alert` cần cả tam giác lẫn dấu chấm than). Không dùng `{@html}` ở đâu cả —
   * mọi giá trị ở đây là hằng số trong mã nguồn.
   */
  const PATHS: Record<IconName, string[]> = {
    home: ['M3.5 10 12 3.5 20.5 10', 'M5.5 9.4V19.5h13V9.4', 'M9.8 19.5V14h4.4v5.5'],
    study: [
      'M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v12a1.6 1.6 0 0 0-1.6-1.6H4z',
      'M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v12a1.6 1.6 0 0 1 1.6-1.6H20z',
    ],
    transfer: ['M4 8.5h11', 'M12 5.5 15 8.5 12 11.5', 'M20 15.5H9', 'M12 12.5 9 15.5 12 18.5'],
    // Thanh trượt: hai rãnh, mỗi rãnh một núm. Núm là một đoạn thẳng ngắn với
    // `stroke-linecap="round"`, nên nó tròn mà không cần thêm hình.
    settings: [
      'M3.5 7.5h7',
      'M14.5 5.5v4',
      'M17.5 7.5h3',
      'M3.5 16.5h5',
      'M12 14.5v4',
      'M15 16.5h5.5',
    ],
    chevron: ['M8 10.5 12 14.5 16 10.5'],
    check: ['M5 12.5 9.5 17 19 7.5'],
    close: ['M7 7 17 17', 'M17 7 7 17'],
    shuffle: [
      'M16 3.5h4.5V8',
      'M20.5 3.5 4 20',
      'M20.5 15.5v5H16',
      'M15 14.5l5.5 6',
      'M4 3.5 9 8.5',
    ],
    refresh: ['M20.5 4v6h-6', 'M20.2 15a9 9 0 1 1-2-9.4L20.5 10'],
    alert: [
      'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
      'M12 9v4.5',
      'M12 17h.01',
    ],
    download: ['M12 3.5v11', 'M7.5 10 12 14.5 16.5 10', 'M4.5 20.5h15'],
    upload: ['M12 20.5v-11', 'M7.5 14 12 9.5 16.5 14', 'M4.5 3.5h15'],
    trash: [
      'M4 6.5h16',
      'M9.5 6.5V4.6h5v1.9',
      'M6.5 6.5 7.7 20a1 1 0 0 0 1 .9h6.6a1 1 0 0 0 1-.9l1.2-13.5',
    ],
    layers: [
      'M12 2.5 2.5 7.5 12 12.5l9.5-5z',
      'M2.5 16.5 12 21.5l9.5-5',
      'M2.5 12 12 17l9.5-5',
    ],
    sparkle: ['M12 3.5 13.9 9.6 20 11.5l-6.1 1.9L12 19.5l-1.9-6.1L4 11.5l6.1-1.9z'],
    search: ['M10.8 4.4a6.4 6.4 0 1 0 0 12.8 6.4 6.4 0 1 0 0-12.8z', 'M15.6 15.6 20.5 20.5'],
    // Biểu đồ cột có trục ngang ở chân: ba cột cao thấp khác nhau là đủ để nhận
    // ra "thống kê" ở cỡ 17px, nên không cần nét nào thêm.
    chart: ['M3.5 20.5h17', 'M7 20.5v-6', 'M12 20.5v-11', 'M17 20.5v-3.5'],
    // Bút chì: thân là một hình thoi hở, đầu nhọn chính là góc dưới bên trái sau
    // khi tô bằng nét; thêm một nét ngắn làm ranh giới thân và ngòi.
    edit: [
      'M4.5 19.5h3.6L19.2 8.4a2.2 2.2 0 0 0-3.1-3.1L4.5 16.4z',
      'M14.6 6.9l2.5 2.5',
    ],
  };

  export function iconPaths(name: IconName): string[] {
    return PATHS[name];
  }
</script>

<script lang="ts">
  interface Props {
    name: IconName;
    /** Cạnh của hình vuông chứa biểu tượng, tính bằng px. */
    size?: number;
    /** Độ dày nét. Tăng khi biểu tượng hiển thị rất nhỏ. */
    width?: number;
  }

  let { name, size = 20, width = 1.8 }: Props = $props();
</script>

<svg
  viewBox="0 0 24 24"
  width={size}
  height={size}
  fill="none"
  stroke="currentColor"
  stroke-width={width}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#each iconPaths(name) as d (d)}
    <path {d} />
  {/each}
</svg>
