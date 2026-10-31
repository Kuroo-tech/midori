/**
 * Luật đọc và chọn dữ liệu của màn Nhập/xuất.
 *
 * # Vì sao tách khỏi component
 *
 * Ba việc dưới đây là *quy tắc*, không phải giao diện: gán bài cho nháp, chọn nhóm
 * Kanji nhận thẻ, và chọn đúng tập thẻ để xuất. Trước đây chúng nằm trong
 * `Transfer.svelte`, nên chỉ kiểm thử được bằng cách chạy trình duyệt và bấm — và
 * cũng chỉ có MỘT bản duy nhất nằm lẫn giữa phần dựng giao diện. Tách ra đây để
 * `tests/transfer.test.ts` gọi thẳng bằng `node --test` trên lõi WASM thật.
 *
 * Luật bỏ trùng, gán bài và ánh xạ trường dữ liệu KHÔNG nằm ở đây: chúng thuộc lõi
 * Rust (`crates/midori-core/src/import.rs`). Module này chỉ nói *chọn file nào, gán
 * phạm vi nào*, rồi để lõi quyết định thẻ nào vào thư viện.
 */

import { deckParse, type CardDraft, type Card, type Quiz } from '../core/index.ts';
import { KANJI_CATEGORIES } from './content-sections.ts';

/** Ba chủ đề của màn Nhập/xuất — trùng với ba chủ đề của "Danh mục học". */
export type TransferSection = 'vocabulary' | 'kanji' | 'patterns';

/**
 * Thứ tự trên thanh chọn chủ đề — dùng để biết hiệu ứng chuyển cảnh trượt theo
 * chiều nào. Nhảy từ "Từ vựng" sang "Mẫu câu" phải trượt cùng chiều như đi qua
 * "Kanji", nên chiều lấy từ VỊ TRÍ trong danh sách này, không từ thứ tự bấm.
 */
export const SECTION_ORDER: readonly TransferSection[] = ['vocabulary', 'kanji', 'patterns'];

/** Một mục Kanji, hoặc gói nhiều mục cùng lúc (`bundles`). */
export type KanjiScope = 'single' | 'package';

/** Phạm vi đang chọn — cùng một trạng thái cho cả Nhập và Xuất. */
export interface TransferScope {
  section: TransferSection;
  /** `'all'` hoặc số bài 1–50 dạng chuỗi (giá trị của ô chọn). */
  lesson: string;
  kanjiDeckId: string;
  kanjiScope: KanjiScope;
}

/** Phạm vi kèm hai hàm tra cứu do lớp gọi cấp (giữ module này thuần, dễ kiểm thử). */
export interface TransferContext extends TransferScope {
  /** Nơi lưu tên hiển thị của một bộ. */
  quizForDeck: (deckId: string) => Quiz;
  deckName: (deckId: string) => string;
}

/** Một nhóm thẻ đã đọc xong, sẵn sàng cho bước lập kế hoạch nhập. */
export interface ImportBatch {
  deckId: string;
  name: string;
  drafts: CardDraft[];
}

export interface ReadImportFile {
  batches: ImportBatch[];
  /**
   * Số BẢN GHI có trong file nhưng không đọc thành thẻ được (thiếu mặt thẻ/mặt
   * nghĩa, phần tử không phải đối tượng). Do lõi đếm — không suy diễn ở đây.
   */
  skippedRecords: number;
}

/**
 * Đọc nội dung file theo đúng phạm vi đang chọn.
 *
 * @throws {Error} khi file không đọc được, hoặc khi phạm vi không khớp với nội
 *   dung file (ví dụ chọn nhập gói nhiều nhóm Kanji mà file chỉ có một nhóm).
 */
export async function readImportFile(
  text: string,
  filename: string,
  context: TransferContext,
): Promise<ReadImportFile> {
  if (context.section === 'kanji') {
    const parsedPackage = await readKanjiPackage(text, context);
    if (parsedPackage !== null) return parsedPackage;
    if (context.kanjiScope === 'package') {
      throw new Error(
        'Để nhập nhiều nhóm Kanji, hãy chọn file JSON có cấu trúc bundles. File đơn chỉ nhập được vào một nhóm.',
      );
    }
    return readSingleDeck(text, filename, context.kanjiDeckId, context);
  }

  const deckId = context.section === 'vocabulary' ? 'vocabulary' : 'patterns';
  return readSingleDeck(text, filename, deckId, context);
}

/** Đọc một file bộ thẻ vào đúng một bộ. */
async function readSingleDeck(
  text: string,
  filename: string,
  deckId: string,
  context: TransferContext,
): Promise<ReadImportFile> {
  const parsed = await deckParse(text, filename, context.quizForDeck(deckId));
  return {
    batches: [
      {
        deckId,
        name: batchName(deckId, context),
        drafts: applyScope(parsed.cards, context),
      },
    ],
    skippedRecords: parsed.skipped,
  };
}

/**
 * Tên hiển thị của một nhóm trong phần tóm tắt và xem trước.
 *
 * Nhóm Kanji lấy nhãn từ DANH MỤC (`KANJI_CATEGORIES`) chứ không từ nội dung xuất
 * bản: cùng tên đó cũng được dùng ở đường xuất, nên tên nhóm không đổi theo việc
 * nội dung đã được tải về hay chưa.
 */
function batchName(deckId: string, context: TransferContext): string {
  return deckId.startsWith('kanji-') ? kanjiLabel(deckId) : context.deckName(deckId);
}

/**
 * Đọc gói Kanji nhiều nhóm (`{ bundles: [{ deckId, cards }] }`), hoặc `null` nếu
 * file không phải gói — lúc đó nơi gọi quyết định dựa trên phạm vi đang chọn.
 */
async function readKanjiPackage(
  text: string,
  context: TransferContext,
): Promise<ReadImportFile | null> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || !('bundles' in value)) return null;

  const bundles = (value as { bundles?: unknown }).bundles;
  if (!Array.isArray(bundles) || bundles.length === 0) {
    throw new Error('Gói Kanji phải có mảng bundles chứa ít nhất một nhóm.');
  }

  const seen = new Set<string>();
  const batches: ImportBatch[] = [];
  let skippedRecords = 0;
  for (const entry of bundles) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error('Mỗi phần tử trong bundles phải là một nhóm Kanji hợp lệ.');
    }
    const bundle = entry as { deckId?: unknown; cards?: unknown };
    const deckId = bundle.deckId;
    const category = KANJI_CATEGORIES.find((item) => item.deckId === deckId);
    if (typeof deckId !== 'string' || category === undefined) {
      throw new Error(`Nhóm Kanji không được hỗ trợ: ${String(deckId)}.`);
    }
    if (seen.has(deckId)) {
      throw new Error(`Gói Kanji có nhóm bị lặp: ${deckId}.`);
    }
    if (!Array.isArray(bundle.cards)) {
      throw new Error(`Nhóm ${deckId} cần có mảng cards.`);
    }
    seen.add(deckId);

    const parsed = await deckParse(
      JSON.stringify({ cards: bundle.cards }),
      'kanji.json',
      context.quizForDeck(deckId),
    );
    skippedRecords += parsed.skipped;
    batches.push({
      deckId,
      name: category.label,
      drafts: applyScope(parsed.cards, { ...context, kanjiDeckId: deckId }),
    });  }

  if (context.kanjiScope === 'single') {
    const selected = batches.find((batch) => batch.deckId === context.kanjiDeckId);
    if (selected === undefined) {
      const label = kanjiLabel(context.kanjiDeckId);
      throw new Error(`Gói này không có mục ${label}.`);
    }
    return { batches: [selected], skippedRecords };
  }
  return { batches, skippedRecords };
}

/**
 * Áp phạm vi đang chọn lên nháp vừa đọc.
 *
 * - **Từ vựng, một bài:** mọi thẻ trong file vào đúng bài đó. Người dùng đã chọn
 *   bài cụ thể thì số bài trong file không còn ý nghĩa — nó bị ghi đè, không bị
 *   nhân đôi.
 * - **Từ vựng, toàn bộ:** giữ số bài trên từng thẻ, nên file PHẢI có bài 1–50 cho
 *   từng thẻ; thiếu thì từ chối cả file thay vì nhập vào một bài đoán mò.
 * - **Kanji:** bài Minna không áp dụng cho nhóm Kanji — bỏ hẳn trường đó.
 */
function applyScope(drafts: CardDraft[], context: TransferContext): CardDraft[] {
  const { section, lesson } = context;
  if (section === 'vocabulary' || section === 'patterns') {
    if (lesson !== 'all') {
      const target = Number(lesson);
      return drafts.map((draft) => ({ ...draft, lesson: target }));
    }
    const missing = drafts.some(
      (draft) =>
        draft.lesson === undefined ||
        !Number.isInteger(draft.lesson) ||
        draft.lesson < 1 ||
        draft.lesson > 50,
    );
    if (missing) {
      const deck = section === 'patterns' ? 'mẫu câu' : 'từ vựng';
      throw new Error(
        `Nhập toàn bộ ${deck} cần có bài từ 1 đến 50 cho từng thẻ. Hãy chọn một bài để gán chung hoặc bổ sung trường lesson trong file.`,
      );
    }
    return drafts;
  }
  if (section === 'kanji') {
    return drafts.map(({ lesson: _lesson, ...draft }) => draft);
  }
  return drafts;
}

/** Nhãn ngắn của phạm vi đang chọn — dùng cho nút, tóm tắt và thông báo. */
export function scopeLabel(scope: TransferScope): string {
  if (scope.section === 'vocabulary') {
    return scope.lesson === 'all' ? 'toàn bộ Từ vựng' : `Bài ${scope.lesson}`;
  }
  if (scope.section === 'patterns') {
    return scope.lesson === 'all' ? 'Tất cả mẫu câu' : `Mẫu câu bài ${scope.lesson}`;
  }
  return scope.kanjiScope === 'package' ? 'gói nhiều nhóm Kanji' : kanjiLabel(scope.kanjiDeckId);
}

function kanjiLabel(deckId: string): string {
  return (
    KANJI_CATEGORIES.find((category) => category.deckId === deckId)?.label ??
    deckId.replaceAll('-', ' ')
  );
}

/** Một nhóm thẻ để xuất: đúng phạm vi người dùng đã chọn. */
export interface ExportGroup {
  deckId: string;
  name: string;
  cards: Card[];
}

/**
 * Các nhóm thẻ sẽ được xuất, đọc từ THƯ VIỆN THẬT.
 *
 * Con số hiển thị trên nút xuất lấy từ chính kết quả này, nên không thể lệch với
 * thứ được ghi ra file.
 *
 * Cùng một phạm vi cho Nhập và Xuất là chủ ý: người dùng chọn "Bài 12" một lần và
 * cả hai việc đều hiểu đó là Bài 12.
 */
export function selectExportGroups(cards: Card[], scope: TransferScope, deckName: (deckId: string) => string): ExportGroup[] {
  if (scope.section === 'vocabulary') {
    const lesson = scope.lesson === 'all' ? null : Number(scope.lesson);
    const selected = cards.filter(
      (card) => card.deckId === 'vocabulary' && (lesson === null || card.lesson === lesson),
    );
    const name = lesson === null ? deckName('vocabulary') : `${deckName('vocabulary')} · Bài ${lesson}`;
    return [{ deckId: 'vocabulary', name, cards: selected }];
  }

  if (scope.section === 'patterns') {
    const lesson = scope.lesson === 'all' ? null : Number(scope.lesson);
    return [
      {
        deckId: 'patterns',
        name: lesson === null ? 'Tất cả mẫu câu' : `Mẫu câu bài ${lesson}`,
        cards: cards.filter(
          (card) => card.deckId === 'patterns' && (lesson === null || card.lesson === lesson),
        ),
      },
    ];
  }

  const categories =
    scope.kanjiScope === 'package'
      ? KANJI_CATEGORIES
      : KANJI_CATEGORIES.filter((category) => category.deckId === scope.kanjiDeckId);
  return categories
    .map((category) => ({
      deckId: category.deckId,
      name: category.label,
      cards: cards.filter((card) => card.deckId === category.deckId),
    }))
    .filter((group) => group.cards.length > 0);
}

/** Tổng số thẻ của một tập nhóm. */
export function countCards(groups: ExportGroup[]): number {
  return groups.reduce((sum, group) => sum + group.cards.length, 0);
}
