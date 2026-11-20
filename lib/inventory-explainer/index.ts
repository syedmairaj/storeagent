/**
 * AI-INV-1 — Grounded Inventory Explainer public surface.
 */

export {
  buildInventoryExplainerEvidence,
  type BuildInventoryExplainerEvidenceInput,
} from "@/lib/inventory-explainer/build-evidence";

export {
  INVENTORY_EXPLAINER_QUESTIONS,
  getInventoryExplainerQuestion,
  isInventoryExplainerQuestionId,
  rankInventoryExplainerQuestions,
} from "@/lib/inventory-explainer/questions";

export {
  classifyGuidanceSituation,
  GUIDANCE_SITUATION_VERSION,
} from "@/lib/inventory-explainer/guidance-situation";

export {
  explainInventorySkuFromEvidence,
  disabledInventoryExplainerOptions,
  testInjectedInventoryExplainerOptions,
  serverResolvedInventoryExplainerOptions,
  type ExplainInventorySkuOptions,
} from "@/lib/inventory-explainer/orchestrate";

export {
  resolveServerInventoryExplainerEnablement,
  readServerInventoryExplainerConfig,
  getDefaultServerInventoryExplainerConfig,
} from "@/lib/inventory-explainer/server-enablement";

export {
  createInventoryExplainerOfflineStubAdapter,
} from "@/lib/inventory-explainer/ai/offline-stub";

export {
  buildDeterministicInventoryExplainerAnswer,
} from "@/lib/inventory-explainer/deterministic-answer";

export {
  validateInventoryExplainerAiCandidate,
  detectForbiddenActionClaims,
  detectUnsupportedSemanticClaims,
  detectPromptInjection,
} from "@/lib/inventory-explainer/validate-answer";

export {
  resetInventoryExplainerBudgetForTests,
} from "@/lib/inventory-explainer/budget";

export type {
  InventoryExplainerAnswer,
  InventoryExplainerEvidence,
  InventoryExplainerQuestionId,
  InventoryExplainerQuestion,
  InventoryExplainerCitation,
  IncomingTrustClass,
} from "@/lib/inventory-explainer/types";

export {
  INVENTORY_EXPLAINER_ANSWER_VERSION,
  INVENTORY_EXPLAINER_EVIDENCE_VERSION,
  INVENTORY_EXPLAINER_QUESTION_IDS,
} from "@/lib/inventory-explainer/types";
