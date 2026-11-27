/**
 * AI-MKT-1a — pure offline research admission gate.
 *
 * Combines enablement, trusted scope, geo/category, and rights checks.
 * Never performs network I/O, persistence, or provider calls.
 * Live execution is always rejected.
 */

import type { MerchantContext } from "@/lib/commerce-agent/types";
import {
  assertLiveMarketResearchForbidden,
  mayRunMarketResearch,
  type MayRunMarketResearchResult,
} from "@/lib/market-research/enablement";
import {
  evaluateGeoCategoryPolicy,
  type GeoCategoryPolicyConfig,
} from "@/lib/market-research/geo-category";
import {
  evaluateSourceOperationRights,
  type RightsEvaluationResult,
} from "@/lib/market-research/rights";
import {
  resolveTrustedResearchScope,
  type TrustedResearchScope,
  type UntrustedResearchScopeHints,
} from "@/lib/market-research/scope";
import type {
  ResearchFailureCode,
  ResearchOperation,
  ResearchRequest,
} from "@/lib/market-research/types";
import { parseResearchRequest } from "@/lib/market-research/validate";

export type ResearchAdmissionInput = {
  merchantContext: MerchantContext;
  rawRequest: unknown;
  sourceId: string;
  operation: ResearchOperation;
  satisfiedConditions?: readonly string[];
  syntheticFixtureMode?: boolean;
  allowSyntheticFixtures?: boolean;
  requestLiveNetwork?: unknown;
  untrustedHints?: UntrustedResearchScopeHints | null;
  geoConfig?: GeoCategoryPolicyConfig;
};

export type ResearchAdmissionResult =
  | {
      ok: true;
      request: ResearchRequest;
      scope: TrustedResearchScope;
      enablement: MayRunMarketResearchResult;
      rights: Extract<RightsEvaluationResult, { ok: true }>;
      mode: "synthetic_fixture";
    }
  | {
      ok: false;
      code: ResearchFailureCode;
      detail: string;
    };

/**
 * Admit a research request for offline/synthetic evaluation only.
 * Always fails if live network is requested or enablement defaults apply
 * without explicit fixture injection.
 */
export function admitMarketResearchRequest(
  input: ResearchAdmissionInput,
): ResearchAdmissionResult {
  // Structural live ban — independent of flags / enablement.
  const live = assertLiveMarketResearchForbidden();
  if (live.allowed || input.requestLiveNetwork === true) {
    return {
      ok: false,
      code: "LIVE_EXECUTION_FORBIDDEN",
      detail: "AI-MKT-1a forbids live market research execution",
    };
  }

  const parsed = parseResearchRequest(input.rawRequest);
  if (!parsed.ok) {
    return parsed;
  }

  const scope = resolveTrustedResearchScope({
    merchantContext: input.merchantContext,
    untrustedHints: {
      ...(input.untrustedHints ?? {}),
      organizationId: parsed.value.organizationId,
      storeId: parsed.value.storeId,
      variantId: parsed.value.variantId,
    },
  });
  if (!scope.ok) {
    return scope;
  }

  if (parsed.value.organizationId !== scope.scope.organizationId) {
    return {
      ok: false,
      code: "TENANT_SCOPE_MISMATCH",
      detail: "Request organizationId must match trusted MerchantContext",
    };
  }

  const enablement = mayRunMarketResearch({
    organizationId: scope.scope.organizationId,
    allowSyntheticFixtures: input.allowSyntheticFixtures,
    requestLiveNetwork: input.requestLiveNetwork,
  });

  if (enablement.mayRunLive) {
    return {
      ok: false,
      code: "LIVE_EXECUTION_FORBIDDEN",
      detail: "Live execution must remain impossible in AI-MKT-1a",
    };
  }

  if (!enablement.mayRunSyntheticFixtures) {
    return {
      ok: false,
      code: "RESEARCH_DISABLED",
      detail:
        "Market research default OFF; synthetic fixtures require explicit injection",
    };
  }

  const geo = evaluateGeoCategoryPolicy({
    countryCode: parsed.value.countryCode,
    categoryHint: parsed.value.categoryHint,
    syntheticFixtureMode: input.syntheticFixtureMode === true,
    config: input.geoConfig,
  });
  if (!geo.ok) {
    return geo;
  }

  const rights = evaluateSourceOperationRights({
    sourceId: input.sourceId,
    operation: input.operation,
    satisfiedConditions: input.satisfiedConditions,
    asOf: scope.scope.asOf,
  });
  if (!rights.ok) {
    return {
      ok: false,
      code: rights.code,
      detail: rights.detail,
    };
  }

  return {
    ok: true,
    request: parsed.value,
    scope: scope.scope,
    enablement,
    rights,
    mode: "synthetic_fixture",
  };
}
