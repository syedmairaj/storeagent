/**
 * AI-MKT-1c — gated EvidenceRecord mapping after authorization + scope proof.
 * Synthetic origin is preserved and must never promote into real L1 findings.
 */

import type { MerchantContext } from "@/lib/commerce-agent/types";
import { mapResearchEvidenceToEvidenceRecord } from "@/lib/market-research/evidence-map";
import type {
  EvidenceRecordPromotionResult,
  NormalizedEvidenceItem,
} from "@/lib/market-research/normalize/types";
import { resolveTrustedResearchScope } from "@/lib/market-research/scope";
import type { ResearchEvidenceItem } from "@/lib/market-research/types";
import { evaluateSourceOperationRights } from "@/lib/market-research/rights";

/**
 * Attempt to promote normalized synthetic evidence into L1 EvidenceRecord findings.
 * Always denied in AI-MKT-1c — synthetic fixtures cannot become real L1 findings.
 */
export function authorizeNormalizedEvidenceForL1Findings(input: {
  merchantContext: MerchantContext;
  item: NormalizedEvidenceItem;
  satisfiedNormalizeConditions?: readonly string[];
  nowIso?: string;
}): EvidenceRecordPromotionResult {
  const scope = resolveTrustedResearchScope({
    merchantContext: input.merchantContext,
    untrustedHints: {
      organizationId: input.item.organizationId,
    },
  });
  if (!scope.ok) {
    return { ok: false, code: scope.code, detail: scope.detail };
  }

  if (input.item.organizationId !== scope.scope.organizationId) {
    return {
      ok: false,
      code: "TENANT_SCOPE_MISMATCH",
      detail: "Normalized evidence organizationId does not match trusted scope",
    };
  }

  const rights = evaluateSourceOperationRights({
    sourceId: input.item.sourceId,
    operation: "normalize",
    satisfiedConditions: input.satisfiedNormalizeConditions,
    asOf: input.nowIso,
  });
  if (!rights.ok) {
    return { ok: false, code: rights.code, detail: rights.detail };
  }

  // Synthetic origin preserved → never promote into real L1 findings.
  if (
    input.item.originClass === "synthetic_fixture" ||
    input.item.syntheticOriginPreserved === true ||
    input.item.isRealMerchantOrMarketFact === false
  ) {
    return {
      ok: false,
      code: "SYNTHETIC_PROMOTION_FORBIDDEN",
      detail:
        "Synthetic fixture evidence cannot be promoted into real L1 findings",
    };
  }

  return {
    ok: false,
    code: "SYNTHETIC_PROMOTION_FORBIDDEN",
    detail: "AI-MKT-1c has no non-synthetic promotion path",
  };
}

/**
 * Map ResearchEvidenceItem → EvidenceRecord-compatible fields only after
 * tenant/scope proof. Still does not authorize L1 finding promotion when
 * the item originated from a synthetic fixture (caller must check origin).
 */
export function mapAuthorizedResearchEvidenceToEvidenceRecord(input: {
  merchantContext: MerchantContext;
  item: ResearchEvidenceItem;
  originClass: "synthetic_fixture";
  storeId?: string;
  variantId?: string;
  sku?: string;
}):
  | {
      ok: true;
      /** Compatible shape for offline inspection only — not an L1 finding. */
      record: ReturnType<typeof mapResearchEvidenceToEvidenceRecord>;
      syntheticOriginPreserved: true;
      promotableToL1Findings: false;
    }
  | { ok: false; code: string; detail: string } {
  // Organization authority comes only from MerchantContext — never provenance.
  const scope = resolveTrustedResearchScope({
    merchantContext: input.merchantContext,
  });
  if (!scope.ok) {
    return { ok: false, code: scope.code, detail: scope.detail };
  }

  if (input.originClass === "synthetic_fixture") {
    const record = mapResearchEvidenceToEvidenceRecord({
      item: input.item,
      organizationId: scope.scope.organizationId,
      storeId: input.storeId ?? scope.scope.storeId,
      variantId: input.variantId ?? scope.scope.variantId,
      sku: input.sku,
    });
    return {
      ok: true,
      record,
      syntheticOriginPreserved: true,
      promotableToL1Findings: false,
    };
  }

  return {
    ok: false,
    code: "ORIGIN_NOT_SYNTHETIC",
    detail: "Unexpected origin for AI-MKT-1c mapping path",
  };
}
