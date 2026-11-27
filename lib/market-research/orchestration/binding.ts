/**
 * AI-MKT-1d — trusted run binding.
 * Tenant/store/variant/SKU, request, source/adapter, policy pin, and evidence
 * bind to the same run. Caller-supplied evidence/policy/approval are never authority.
 */

import { randomUUID } from "node:crypto";

import type { MerchantContext } from "@/lib/commerce-agent/types";
import { MARKET_RESEARCH_POLICY_PIN } from "@/lib/market-research/types";
import type { ResearchRequest } from "@/lib/market-research/types";
import { FORBIDDEN_SCOPE_OVERRIDE_KEYS } from "@/lib/market-research/scope";
import { hashTargetProductFingerprint } from "@/lib/market-research/orchestration/evidence-hash";
import type { TrustedResearchRunBinding } from "@/lib/market-research/orchestration/types";
import type { ProductMatchTarget } from "@/lib/market-research/normalize/types";

export type BindingAuthorityProbe = {
  /** Caller-supplied evidence rows — never authoritative. */
  evidence?: unknown;
  policy?: unknown;
  licenseOk?: unknown;
  fixtureApproval?: unknown;
  approvalOverride?: unknown;
  scopeOverride?: unknown;
  sourcePolicyVersion?: unknown;
  organizationId?: unknown;
  evidenceHash?: unknown;
};

/**
 * Fail closed if the caller attempts to inject authority via untrusted fields.
 */
export function detectForgedBindingAuthority(
  probe: BindingAuthorityProbe | null | undefined,
): { forged: false } | { forged: true; code: "FORGED_BINDING" | "FORGED_EVIDENCE_INPUT" | "FORGED_APPROVAL_INPUT" | "FORGED_POLICY_INPUT"; detail: string } {
  if (!probe) {
    return { forged: false };
  }

  if (probe.evidence !== undefined) {
    return {
      forged: true,
      code: "FORGED_EVIDENCE_INPUT",
      detail: "Caller-supplied evidence cannot authorize research findings",
    };
  }
  if (probe.licenseOk !== undefined) {
    return {
      forged: true,
      code: "FORGED_POLICY_INPUT",
      detail: "Caller-supplied licenseOk is never authority",
    };
  }
  if (probe.policy !== undefined || probe.sourcePolicyVersion !== undefined) {
    return {
      forged: true,
      code: "FORGED_POLICY_INPUT",
      detail: "Caller-supplied policy / policy pin is never authority",
    };
  }
  if (
    probe.fixtureApproval !== undefined ||
    probe.approvalOverride !== undefined
  ) {
    return {
      forged: true,
      code: "FORGED_APPROVAL_INPUT",
      detail: "Caller-supplied fixture approval / override is never authority",
    };
  }
  if (probe.scopeOverride !== undefined) {
    return {
      forged: true,
      code: "FORGED_BINDING",
      detail: "Caller-supplied scope override is never authority",
    };
  }
  if (probe.evidenceHash !== undefined) {
    return {
      forged: true,
      code: "FORGED_EVIDENCE_INPUT",
      detail: "Caller-supplied evidenceHash is never authority",
    };
  }
  if (
    probe.organizationId !== undefined &&
    typeof probe.organizationId === "string"
  ) {
    // organizationId in probe alone is not forged — checked against context later.
  }

  for (const key of FORBIDDEN_SCOPE_OVERRIDE_KEYS) {
    if (
      probe.scopeOverride &&
      typeof probe.scopeOverride === "object" &&
      probe.scopeOverride !== null &&
      key in (probe.scopeOverride as Record<string, unknown>)
    ) {
      return {
        forged: true,
        code: "FORGED_BINDING",
        detail: `Forbidden scope override key: ${key}`,
      };
    }
  }

  return { forged: false };
}

export function buildTrustedResearchRunBinding(input: {
  merchantContext: MerchantContext;
  request: ResearchRequest;
  sourceId: string;
  adapterId: string;
  targetProduct: ProductMatchTarget;
  licenseOk: boolean;
  runId?: string;
  evidenceHash?: string | null;
}):
  | { ok: true; binding: TrustedResearchRunBinding }
  | { ok: false; code: "TENANT_SCOPE_MISMATCH" | "POLICY_VERSION_MISMATCH" | "FORGED_BINDING"; detail: string } {
  const ctx = input.merchantContext;
  if (input.request.organizationId !== ctx.organizationId) {
    return {
      ok: false,
      code: "TENANT_SCOPE_MISMATCH",
      detail: "Request organizationId must match trusted MerchantContext",
    };
  }

  if (input.request.sourcePolicyVersion !== MARKET_RESEARCH_POLICY_PIN) {
    return {
      ok: false,
      code: "POLICY_VERSION_MISMATCH",
      detail: `sourcePolicyVersion must pin ${MARKET_RESEARCH_POLICY_PIN}`,
    };
  }

  if (
    input.request.storeId &&
    ctx.storeId &&
    input.request.storeId !== ctx.storeId
  ) {
    return {
      ok: false,
      code: "TENANT_SCOPE_MISMATCH",
      detail: "Request storeId does not match trusted MerchantContext storeId",
    };
  }

  if (
    input.request.variantId &&
    ctx.variantId &&
    input.request.variantId !== ctx.variantId
  ) {
    return {
      ok: false,
      code: "TENANT_SCOPE_MISMATCH",
      detail: "Request variantId does not match trusted MerchantContext variantId",
    };
  }

  return {
    ok: true,
    binding: {
      runId: input.runId ?? randomUUID(),
      organizationId: ctx.organizationId,
      storeId: ctx.storeId ?? input.request.storeId ?? null,
      variantId: ctx.variantId ?? input.request.variantId ?? null,
      sku: input.request.sku ?? null,
      clientRequestId: input.request.clientRequestId,
      sourceId: input.sourceId,
      adapterId: input.adapterId,
      sourcePolicyVersion: MARKET_RESEARCH_POLICY_PIN,
      countryCode: input.request.countryCode,
      currencyCode: input.request.currencyCode ?? ctx.currencyCode ?? null,
      targetProductFingerprint: hashTargetProductFingerprint(input.targetProduct),
      evidenceHash: input.evidenceHash ?? null,
      originClass: "synthetic_fixture",
      syntheticOriginPreserved: true,
      licenseOk: input.licenseOk === true,
    },
  };
}

export function sealBindingEvidenceHash(
  binding: TrustedResearchRunBinding,
  evidenceHash: string,
): TrustedResearchRunBinding {
  return {
    ...binding,
    evidenceHash,
  };
}
