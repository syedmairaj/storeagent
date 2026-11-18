export {
  isAuthorizedActivationPlace,
  resolveMerchantActivationScope,
  type ActivationPlace,
  type ActivationScopeResolution,
} from "@/lib/inventory-readiness/activation-scope";
export { countGrainAlignedKnownDemand } from "@/lib/inventory-readiness/align";
export { assessMerchantDecisionReadiness } from "@/lib/inventory-readiness/assess";
export {
  resolveDemandFreshnessGuidance,
  type DemandFreshnessGuidance,
  type DemandFreshnessInput,
  type DemandFreshnessKind,
} from "@/lib/inventory-readiness/demand-freshness";
export {
  summarizeGrainInventoryFreshness,
  type GrainFreshnessSummary,
  type GrainObservation,
  type GrainPlaceFreshness,
} from "@/lib/inventory-readiness/grain-freshness";
export {
  inventoryEvidenceSourceDetail,
  inventoryEvidenceSourceLabel,
  type InventoryEvidenceSourceKind,
} from "@/lib/inventory-readiness/inventory-source";
export { loadMerchantDecisionReadiness } from "@/lib/inventory-readiness/load";
export type {
  DecisionCapability,
  DecisionCapabilityStatus,
  DecisionEvidenceInputKey,
  EvidenceInputStatus,
  EvidencePresence,
  EvidenceSufficiency,
  MerchantDecisionReadiness,
  PlanningEvidencePresence,
  TrustedIncomingEvidencePresence,
} from "@/lib/inventory-readiness/types";
