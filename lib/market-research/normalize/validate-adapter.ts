/**
 * AI-MKT-1c — runtime schema validation for admitted adapter envelopes.
 * Never trust caller-supplied licenseOk or scope fields on the payload.
 */

import {
  MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
  type MarketResearchAdapterFailure,
  type MarketResearchAdapterSuccess,
} from "@/lib/market-research/adapters/types";
import { validateCitationList } from "@/lib/market-research/normalize/citations";
import type { EvidenceRejectCode } from "@/lib/market-research/normalize/types";
import {
  MARKET_RESEARCH_POLICY_PIN,
  type ResearchEvidenceClaimClass,
  type SignalClass,
} from "@/lib/market-research/types";

const SIGNAL_CLASSES: ReadonlySet<string> = new Set([
  "search_interest",
  "public_listing",
  "public_review",
  "public_price",
  "editorial",
  "rank_proxy",
  "other_sourced",
  "merchant_internal",
]);

const CLAIM_CLASSES: ReadonlySet<string> = new Set([
  "sourced_signal",
  "estimate",
  "hypothesis",
  "unknown",
]);

export type AdapterEnvelopeValidation =
  | { ok: true; success: MarketResearchAdapterSuccess }
  | {
      ok: false;
      code: EvidenceRejectCode;
      detail: string;
      failure?: MarketResearchAdapterFailure;
    };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validate adapter result shape for normalization intake.
 */
export function validateAdapterEnvelopeForNormalize(
  result: unknown,
  expected: {
    organizationId: string;
    clientRequestId: string;
    sourcePolicyVersion?: string;
  },
): AdapterEnvelopeValidation {
  if (!result || typeof result !== "object") {
    return {
      ok: false,
      code: "MALFORMED_ADAPTER_RESPONSE",
      detail: "Adapter result must be an object",
    };
  }

  const raw = result as Record<string, unknown>;

  if (raw.schemaVersion !== MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION) {
    return {
      ok: false,
      code: "MALFORMED_ADAPTER_RESPONSE",
      detail: `Unsupported adapter schemaVersion '${String(raw.schemaVersion)}'`,
    };
  }

  if (raw.originClass !== "synthetic_fixture") {
    return {
      ok: false,
      code: "ORIGIN_NOT_SYNTHETIC",
      detail: "AI-MKT-1c only admits synthetic_fixture adapter envelopes",
    };
  }

  // Never trust payload licenseOk / scope forgeries.
  if ("licenseOk" in raw) {
    return {
      ok: false,
      code: "FORGED_POLICY_INPUT",
      detail: "Adapter envelope must not supply licenseOk",
    };
  }
  for (const key of [
    "policy",
    "permissions",
    "approval",
    "rightsClass",
    "forceOrganizationId",
  ] as const) {
    if (key in raw) {
      return {
        ok: false,
        code: "FORGED_POLICY_INPUT",
        detail: `Adapter envelope must not supply '${key}'`,
      };
    }
  }

  if (raw.ok === false) {
    return {
      ok: false,
      code: "ADAPTER_FAILURE",
      detail:
        typeof raw.detail === "string"
          ? raw.detail
          : "Adapter returned failure envelope",
      failure: raw as unknown as MarketResearchAdapterFailure,
    };
  }

  if (raw.ok !== true) {
    return {
      ok: false,
      code: "MALFORMED_ADAPTER_RESPONSE",
      detail: "Adapter result.ok must be boolean",
    };
  }

  if (!isNonEmptyString(raw.sourceId) || !isNonEmptyString(raw.adapterId)) {
    return {
      ok: false,
      code: "MALFORMED_ADAPTER_RESPONSE",
      detail: "Adapter success missing sourceId/adapterId",
    };
  }

  if (!isNonEmptyString(raw.organizationId) || !isNonEmptyString(raw.clientRequestId)) {
    return {
      ok: false,
      code: "MALFORMED_ADAPTER_RESPONSE",
      detail: "Adapter success missing organizationId/clientRequestId",
    };
  }

  if (raw.organizationId.trim() !== expected.organizationId) {
    return {
      ok: false,
      code: "TENANT_SCOPE_MISMATCH",
      detail: "Adapter organizationId does not match trusted tenant",
    };
  }

  if (raw.clientRequestId.trim() !== expected.clientRequestId) {
    return {
      ok: false,
      code: "TENANT_SCOPE_MISMATCH",
      detail: "Adapter clientRequestId does not match trusted request",
    };
  }

  const policyPin =
    expected.sourcePolicyVersion ?? MARKET_RESEARCH_POLICY_PIN;
  if (
    !isNonEmptyString(raw.sourcePolicyVersion) ||
    raw.sourcePolicyVersion.trim() !== policyPin
  ) {
    return {
      ok: false,
      code: "POLICY_VERSION_MISMATCH",
      detail: `Adapter sourcePolicyVersion must equal '${policyPin}'`,
    };
  }

  if (!isNonEmptyString(raw.retrievedAt)) {
    return {
      ok: false,
      code: "MALFORMED_ADAPTER_RESPONSE",
      detail: "Adapter success missing retrievedAt",
    };
  }

  if (!Array.isArray(raw.snippets) || !Array.isArray(raw.citations)) {
    return {
      ok: false,
      code: "MALFORMED_ADAPTER_RESPONSE",
      detail: "Adapter success requires snippets and citations arrays",
    };
  }

  const citationCheck = validateCitationList(
    raw.citations as MarketResearchAdapterSuccess["citations"],
  );
  if (!citationCheck.ok) {
    return {
      ok: false,
      code: "CITATION_INVALID",
      detail: citationCheck.detail,
    };
  }

  for (const snippet of raw.snippets as unknown[]) {
    if (!snippet || typeof snippet !== "object") {
      return {
        ok: false,
        code: "MALFORMED_ADAPTER_RESPONSE",
        detail: "Snippet entry malformed",
      };
    }
    const s = snippet as Record<string, unknown>;
    if (!isNonEmptyString(s.snippetId) || !isNonEmptyString(s.text)) {
      return {
        ok: false,
        code: "MALFORMED_ADAPTER_RESPONSE",
        detail: "Snippet requires snippetId and text",
      };
    }
    if (!SIGNAL_CLASSES.has(String(s.signalClass))) {
      return {
        ok: false,
        code: "MALFORMED_ADAPTER_RESPONSE",
        detail: `Unknown signalClass '${String(s.signalClass)}'`,
      };
    }
    if (!CLAIM_CLASSES.has(String(s.claimClass))) {
      return {
        ok: false,
        code: "MALFORMED_ADAPTER_RESPONSE",
        detail: `Unknown claimClass '${String(s.claimClass)}'`,
      };
    }
    if (s.isRealMerchantOrMarketFact !== false) {
      return {
        ok: false,
        code: "HONESTY_VIOLATION",
        detail: "Snippet must set isRealMerchantOrMarketFact=false",
      };
    }
    // Silence unused type narrowing helpers
    void (s.signalClass as SignalClass);
    void (s.claimClass as ResearchEvidenceClaimClass);
  }

  return { ok: true, success: raw as unknown as MarketResearchAdapterSuccess };
}
