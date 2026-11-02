/**
 * M7.4e E3.2 — offline adversarial candidate fixtures for
 * ai-brief-semantic-claims-v1 (§8.2).
 *
 * These are pure data helpers; evaluation happens in unit tests.
 */

export type SemanticAdversarialCaseId =
  | "action_type_mutation"
  | "quantity_mutation"
  | "priority_confidence_mutation"
  | "confidence_percent"
  | "fabricated_reason_code"
  | "financial_prose_clean_structured"
  | "watch_purchase_next_step"
  | "watch_buy_now_prose"
  | "untemplated_free_prose"
  | "prose_number_contradicts_refs"
  | "prompt_injection"
  | "grounding_hash_mismatch"
  | "evidence_emphasis_invented"
  | "invented_freshness"
  | "unrelated_evidence_refs"
  | "missing_or_mismatched_claims"
  | "unsupported_condition"
  | "malicious_product_title";

export const AI_BRIEF_SEMANTIC_ADVERSARIAL_CASES_V1: readonly {
  id: SemanticAdversarialCaseId;
  expectRejection: true;
  notes: string;
}[] = [
  {
    id: "action_type_mutation",
    expectRejection: true,
    notes: "§8.2.1 structured action-type mutation",
  },
  {
    id: "quantity_mutation",
    expectRejection: true,
    notes: "§8.2.2 quantity mutation",
  },
  {
    id: "priority_confidence_mutation",
    expectRejection: true,
    notes: "§8.2.3 priority/confidence mutation",
  },
  {
    id: "confidence_percent",
    expectRejection: true,
    notes: "§8.2.4 confidencePercent present",
  },
  {
    id: "fabricated_reason_code",
    expectRejection: true,
    notes: "§8.2.5 fabricated reason code",
  },
  {
    id: "financial_prose_clean_structured",
    expectRejection: true,
    notes: "§8.2.6 financial prose with clean structured claims",
  },
  {
    id: "watch_purchase_next_step",
    expectRejection: true,
    notes: "§8.2.7 WATCH + purchase next-step code",
  },
  {
    id: "watch_buy_now_prose",
    expectRejection: true,
    notes: "§8.2.8 WATCH buy-now prose",
  },
  {
    id: "untemplated_free_prose",
    expectRejection: true,
    notes: "§8.2.9 valid structured + untemplated prose",
  },
  {
    id: "prose_number_contradicts_refs",
    expectRejection: true,
    notes: "§8.2.10 prose asserts different number than grounding",
  },
  {
    id: "prompt_injection",
    expectRejection: true,
    notes: "§8.2.11 prompt injection / org enablement",
  },
  {
    id: "grounding_hash_mismatch",
    expectRejection: true,
    notes: "§8.2.12 grounding hash mismatch",
  },
  {
    id: "evidence_emphasis_invented",
    expectRejection: true,
    notes: "§8.2.13 evidence emphasis on invented field",
  },
  {
    id: "invented_freshness",
    expectRejection: true,
    notes: "S12 invented freshness when grounding unknown",
  },
  {
    id: "unrelated_evidence_refs",
    expectRejection: true,
    notes: "Bound claim refs must satisfy template-required evidence set",
  },
  {
    id: "missing_or_mismatched_claims",
    expectRejection: true,
    notes: "Material prose requires matching kind+text claim binding",
  },
  {
    id: "unsupported_condition",
    expectRejection: true,
    notes: "soft_demand/excess/conflict templates need grounded condition codes",
  },
  {
    id: "malicious_product_title",
    expectRejection: true,
    notes: "Untrusted product slots reject sentence/markdown/number bypasses",
  },
] as const;
