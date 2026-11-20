/**
 * AI-INV-1.1 — allowlisted contextual questions with situation ranking.
 */

import {
  INVENTORY_EXPLAINER_QUESTION_IDS,
  type InventoryExplainerEvidence,
  type InventoryExplainerQuestion,
  type InventoryExplainerQuestionId,
} from "@/lib/inventory-explainer/types";

export const INVENTORY_EXPLAINER_QUESTIONS: readonly InventoryExplainerQuestion[] =
  [
    {
      id: "why_flagged",
      label: "Why is this SKU flagged?",
      hint: "What the evidence means for review — not a buy action.",
    },
    {
      id: "sales_rate_meaning",
      label: "What does this sales rate mean?",
      hint: "Observed 30-day history — not a forecast.",
    },
    {
      id: "cover_unavailable",
      label: "Why is stock cover unavailable?",
      hint: "When days-of-stock cannot be trusted yet.",
    },
    {
      id: "missing_data",
      label: "What data is missing?",
      hint: "Gaps that block confident guidance.",
    },
    {
      id: "verify_before_replenishing",
      label: "What should I verify before replenishing?",
      hint: "Prioritized checks — no automatic purchase.",
    },
  ] as const;

const QUESTION_SET = new Set<string>(INVENTORY_EXPLAINER_QUESTION_IDS);

export function isInventoryExplainerQuestionId(
  value: string,
): value is InventoryExplainerQuestionId {
  return QUESTION_SET.has(value);
}

export function getInventoryExplainerQuestion(
  id: InventoryExplainerQuestionId,
): InventoryExplainerQuestion {
  const found = INVENTORY_EXPLAINER_QUESTIONS.find((q) => q.id === id);
  if (!found) {
    throw new Error(`Unknown inventory explainer question: ${id}`);
  }
  return found;
}

/**
 * Rank questions for this SKU using server evidence situation order.
 * Falls back to default catalog order when ranking is absent.
 */
export function rankInventoryExplainerQuestions(
  evidence?: Pick<InventoryExplainerEvidence, "rankedQuestionIds"> | null,
): readonly InventoryExplainerQuestion[] {
  const rankedIds = evidence?.rankedQuestionIds;
  if (!rankedIds || rankedIds.length === 0) {
    return INVENTORY_EXPLAINER_QUESTIONS;
  }

  const byId = new Map(
    INVENTORY_EXPLAINER_QUESTIONS.map((q) => [q.id, q] as const),
  );
  const ordered: InventoryExplainerQuestion[] = [];
  for (const id of rankedIds) {
    const q = byId.get(id);
    if (q) {
      ordered.push(q);
      byId.delete(id);
    }
  }
  for (const q of INVENTORY_EXPLAINER_QUESTIONS) {
    if (byId.has(q.id)) {
      ordered.push(q);
    }
  }
  return ordered;
}
