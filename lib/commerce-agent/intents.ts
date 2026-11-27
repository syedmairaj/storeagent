/**
 * AI-ARCH-1e — structured merchant intents (L1 only).
 * Labels are merchant-facing; IDs stay aligned with AgentIntentClass.
 */

import type { AgentIntentClass } from "@/lib/commerce-agent/types";
import { isOrchestratorSupportedIntent } from "@/lib/commerce-agent/orchestrator/plans";

export type CommerceAgentStructuredIntent =
  | "inventory_fact"
  | "zero_sales_diagnosis"
  | "data_gap"
  | "reorder_review";

export type CommerceAgentIntentOption = {
  id: CommerceAgentStructuredIntent;
  label: string;
  hint: string;
};

export const COMMERCE_AGENT_STRUCTURED_INTENTS: readonly CommerceAgentIntentOption[] =
  [
    {
      id: "inventory_fact",
      label: "Stock facts",
      hint: "Verified on-hand, cover, and velocity for this SKU.",
    },
    {
      id: "zero_sales_diagnosis",
      label: "Why no sales?",
      hint: "Evidence-backed gaps and labeled hypotheses — not proven causes.",
    },
    {
      id: "data_gap",
      label: "What's missing?",
      hint: "Missing, stale, or unknown evidence that blocks a safe answer.",
    },
    {
      id: "reorder_review",
      label: "Review reorder signals",
      hint: "Explain-only thresholds — no buy or create action.",
    },
  ] as const;

export function isCommerceAgentStructuredIntent(
  value: unknown,
): value is CommerceAgentStructuredIntent {
  return (
    typeof value === "string" &&
    isOrchestratorSupportedIntent(value as AgentIntentClass) &&
    (value === "inventory_fact" ||
      value === "zero_sales_diagnosis" ||
      value === "data_gap" ||
      value === "reorder_review")
  );
}

export function getCommerceAgentIntentOption(
  id: CommerceAgentStructuredIntent,
): CommerceAgentIntentOption {
  const match = COMMERCE_AGENT_STRUCTURED_INTENTS.find((item) => item.id === id);
  if (!match) {
    throw new Error("UNKNOWN_STRUCTURED_INTENT");
  }
  return match;
}
