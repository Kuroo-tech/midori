import type { Card, CardDraft, ReconcileResult } from '../core/types.ts';
import type { ContentPreview, PreviewCard } from './types.ts';

export interface ReconciliationBundle {
  deckId: string;
  cards: CardDraft[];
  cardIds: string[];
}

export interface ReconciliationResult {
  cards: Card[];
  updated: number;
  added: number;
  orphaned: number;
}

/** Mọi thứ cần để tính trước thay đổi — chưa ghi gì. */
export interface ReconciliationOptions {
  library: Card[];
  bundles: ReconciliationBundle[];
  previousIdsByDeck: Record<string, string[]>;
  now: number;
  reconcile: (
    library: Card[],
    content: CardDraft[],
    previousIds: string[],
    deckId: string,
    now: number,
  ) => Promise<ReconcileResult>;
}

/** Kết quả lập kế hoạch: thư viện sẽ thành gì, và phần cần ghi xuống. */
export interface ReconciliationPlan {
  /** Thư viện sau khi áp nội dung — chỉ trong bộ nhớ. */
  cards: Card[];
  /** Thẻ thực sự đổi; đây là phần duy nhất cần ghi. */
  changed: Card[];
  cardIdsByDeck: Record<string, string[]>;
  updated: number;
  added: number;
  orphaned: number;
  /** Chi tiết để hiển thị ở bước xem trước. */
  updatedCards: Card[];
  addedCards: Card[];
  /** Thẻ mồ côi, tra từ thư viện hiện tại (lõi chỉ trả về id). */
  orphanedCards: Card[];
}

/**
 * Plan every bundle before writing cards and sync metadata in one commit.
 * If the commit fails, callers retain the original library and can retry.
 */
export async function planReconciliation(
  options: ReconciliationOptions,
): Promise<ReconciliationPlan> {
  const libraryById = new Map(options.library.map((card) => [card.id, card]));
  const planned = new Map(libraryById);
  const changed = new Map<string, Card>();
  const cardIdsByDeck: Record<string, string[]> = {};
  const updatedCards: Card[] = [];
  const addedCards: Card[] = [];
  const orphanedCards: Card[] = [];

  for (const bundle of options.bundles) {
    const result = await options.reconcile(
      [...planned.values()],
      bundle.cards,
      options.previousIdsByDeck[bundle.deckId] ?? [],
      bundle.deckId,
      options.now,
    );
    updatedCards.push(...result.updated);
    addedCards.push(...result.fresh);
    for (const id of result.orphaned) {
      // Lõi chỉ trả về id; thẻ vẫn nằm nguyên trong thư viện nên tra được.
      const card = planned.get(id) ?? libraryById.get(id);
      if (card !== undefined) orphanedCards.push(card);
    }
    for (const card of [...result.updated, ...result.fresh]) {
      planned.set(card.id, card);
      changed.set(card.id, card);
    }
    cardIdsByDeck[bundle.deckId] = [...bundle.cardIds];
  }

  return {
    cards: [...planned.values()],
    changed: [...changed.values()],
    cardIdsByDeck,
    updated: updatedCards.length,
    added: addedCards.length,
    orphaned: orphanedCards.length,
    updatedCards,
    addedCards,
    orphanedCards,
  };
}

/**
 * Đếm thay đổi mà việc kích hoạt sẽ gây ra, **không** ghi gì.
 *
 * Đây là con số hiển thị ở bước xem trước. Vì nó chạy đúng `reconcile` của lõi
 * trên đúng vùng đệm sắp kích hoạt, con số người dùng thấy chính là con số sẽ
 * xảy ra — không phải một ước lượng song song dễ lệch.
 */
export async function previewReconciliation(
  options: ReconciliationOptions,
): Promise<ContentPreview> {
  const plan = await planReconciliation(options);
  return {
    updated: plan.updated,
    added: plan.added,
    orphaned: plan.orphaned,
    updatedCards: plan.updatedCards.map(previewCard),
    addedCards: plan.addedCards.map(previewCard),
    orphanedCards: plan.orphanedCards.map(previewCard),
  };
}

/** Bỏ lịch SRS và mọi thứ khác mà bước xem trước không cần hiển thị. */
function previewCard(card: Card): PreviewCard {
  return { id: card.id, deckId: card.deckId, front: card.front, back: card.back };
}

/** Lập kế hoạch cho mọi gói rồi ghi một lần — đường dùng khi không cần xem trước. */
export async function reconcilePublishedContent(
  options: ReconciliationOptions & {
    contentVersion: string;
    commit: (
      changedCards: Card[],
      contentVersion: string,
      cardIdsByDeck: Record<string, string[]>,
    ) => Promise<void>;
  },
): Promise<ReconciliationResult> {
  const plan = await planReconciliation(options);
  await options.commit(plan.changed, options.contentVersion, plan.cardIdsByDeck);
  return {
    cards: plan.cards,
    updated: plan.updated,
    added: plan.added,
    orphaned: plan.orphaned,
  };
}
