<script lang="ts">
  /**
   * Màn chọn mẫu câu theo bài — tầng 2 của chủ đề Mẫu câu.
   *
   * Dùng lại `Lessons.svelte` với `deckId="patterns"`: danh sách 50 bài, tìm
   * kiếm, bộ lọc và cách mở Collection giống hệt Từ vựng, chỉ khác bộ được đếm.
   * Tách component riêng vì `ScreenHost` dựng màn hình không kèm prop — mỗi màn
   * trong `SCREENS` cần một component mặc định.
   */
  import Lessons from './Lessons.svelte';
</script>

<Lessons deckId="patterns" />
