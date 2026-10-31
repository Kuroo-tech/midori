/**
 * Kế hoạch phiên học: biến một lựa chọn của người học (phạm vi + chế độ + phạm vi
 * thẻ) thành đúng tập thẻ mà phiên sẽ chạy.
 *
 * # Vì sao tách ra module riêng
 *
 * Màn Collection hiển thị "sẽ học N thẻ" và danh sách xem trước; màn Session dựng
 * hàng đợi thật. Hai nơi PHẢI đọc ra cùng một tập thẻ — nếu mỗi nơi tự ghép bộ
 * lọc, chỉ cần một lần sửa lệch là con số trên nút bắt đầu khác hàng đợi thật, và
 * người học mất niềm tin vào mọi con số còn lại.
 *
 * Ở đây chỉ có phép ghép tham số; việc lọc thật do lõi Rust làm (`cardsFilter`),
 * và việc bốc ngẫu nhiên do `sessionShuffle` của lõi làm.
 */

import { isStudyCatalogDeck } from './content-sections.ts';
import type { CollectionScope } from './collection.ts';
import type { Card, CardFilter } from '../core/index.ts';
import type { StudyFocus, StudyMode } from '../storage/session.ts';

/** Một yêu cầu bắt đầu phiên học — đủ để dựng hàng đợi mà không cần hỏi thêm. */
export interface SessionRequest {
  scope: CollectionScope;
  mode: StudyMode;
  focus: StudyFocus;
}

/**
 * Bộ lọc thẻ của phiên, hoặc `null` khi phiên KHÔNG lọc được bằng bộ lọc.
 *
 * Phiên ngẫu nhiên (`focus === 'random'`) bốc thăm từ toàn danh mục chứ không lọc
 * theo tới hạn/chưa thuộc, nên nó không đi qua đường này — nơi gọi phải xử riêng.
 *
 * Phạm vi `all` cố ý KHÔNG truyền `deckIds`: "tất cả nội dung" nghĩa là toàn thư
 * viện, kể cả bộ do người học tự tạo. `newLimit` chỉ áp khi lọc theo tới hạn —
 * đúng hành vi giới hạn thẻ mới mỗi ngày của lõi.
 */
export function sessionFilter(
  request: SessionRequest,
  dailyNewLimit: number,
): CardFilter | null {
  if (request.focus === 'random') return null;
  const filter: CardFilter = {
    dueOnly: request.focus === 'due',
    weakOnly: request.focus === 'weak',
    newLimit: request.focus === 'due' ? dailyNewLimit : undefined,
  };
  if (request.scope.kind === 'deck') {
    filter.deckIds = [request.scope.deckId];
    // Một mẫu câu luôn thuộc đúng một trong 50 bài; phạm vi deck là tổng hợp.
  } else if (request.scope.kind === 'lesson') {
    filter.deckIds = [request.scope.deckId];
    filter.lesson = request.scope.lesson;
  }
  return filter;
}

/**
 * Thẻ thuộc "danh mục học" — ba chủ đề Từ vựng / Kanji / Mẫu câu.
 *
 * Phiên ngẫu nhiên chỉ bốc từ nhóm này: nó là phiên khám phá giáo trình, không
 * phải "ôn mọi thứ trong máy" — bộ do người học tự tạo không nằm trong ba chủ đề.
 */
export function catalogCards(cards: readonly Card[]): Card[] {
  return cards.filter((card) => isStudyCatalogDeck(card.deckId));
}
