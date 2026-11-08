export {
  classifyInventoryCoverStatus,
  coverEvidenceLabel,
  coverPriorityRank,
} from "@/lib/inventory-intelligence/classify-cover";
export { loadMerchantInventoryIntelligence } from "@/lib/inventory-intelligence/load";
export {
  filterIntelligenceRows,
  prioritizeIntelligenceRows,
} from "@/lib/inventory-intelligence/prioritize";
export type {
  InventoryCoverStatus,
  InventoryIntelligenceFilter,
  MerchantInventoryIntelligenceResult,
  MerchantInventoryIntelligenceRow,
} from "@/lib/inventory-intelligence/types";
