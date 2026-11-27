/**
 * AI-MKT-1a — executable rights policy (deny by default).
 *
 * Never trust caller-supplied licenseOk, policy blobs, permissions, or approval.
 * Server registry + explicit satisfied conditions only.
 */

import {
  getMarketSourcePolicy,
  resolveMarketSourcePolicy,
} from "@/lib/market-research/registry";
import {
  MARKET_RESEARCH_POLICY_PIN,
  MARKET_SOURCE_POLICY_VERSION,
  type MarketSourcePolicy,
  type ResearchFailureCode,
  type ResearchOperation,
  type ResearchPermissionDecision,
} from "@/lib/market-research/types";

export type RightsEvaluationInput = {
  sourceId: string;
  operation: ResearchOperation;
  /**
   * Explicit conditions the *server* has verified as satisfied.
   * Caller-asserted conditions without server verification must not be passed.
   */
  satisfiedConditions?: readonly string[];
  /** Optional as-of for expiry checks (ISO). Defaults to now. */
  asOf?: string;
  /**
   * Untrusted extras — if present, evaluation fails closed as forgery.
   * Includes caller-supplied policy, licenseOk, permissions, approval flags.
   */
  untrusted?: {
    licenseOk?: unknown;
    policy?: unknown;
    permissions?: unknown;
    approval?: unknown;
    policyVersion?: unknown;
    rightsClass?: unknown;
  };
};

export type RightsEvaluationResult =
  | {
      ok: true;
      decision: "allow";
      sourceId: string;
      operation: ResearchOperation;
      policyVersion: string;
      attributionRequired: boolean;
      durableCacheEligible: boolean;
      maxRetentionDays: number | null;
    }
  | {
      ok: false;
      decision: "deny";
      sourceId: string;
      operation: ResearchOperation;
      code: ResearchFailureCode;
      detail: string;
      policyVersion?: string;
      missingConditions?: readonly string[];
    };

function hasForgedUntrustedInput(
  untrusted: RightsEvaluationInput["untrusted"],
): boolean {
  if (!untrusted) {
    return false;
  }
  if (untrusted.licenseOk !== undefined) {
    return true;
  }
  if (untrusted.policy !== undefined) {
    return true;
  }
  if (untrusted.permissions !== undefined) {
    return true;
  }
  if (untrusted.approval !== undefined) {
    return true;
  }
  if (untrusted.policyVersion !== undefined) {
    return true;
  }
  if (untrusted.rightsClass !== undefined) {
    return true;
  }
  return false;
}

function isExpired(policy: MarketSourcePolicy, asOfIso: string): boolean {
  if (!policy.expiresAt) {
    return false;
  }
  const expires = Date.parse(policy.expiresAt);
  const asOf = Date.parse(asOfIso);
  if (Number.isNaN(expires) || Number.isNaN(asOf)) {
    // Malformed expiry → fail closed.
    return true;
  }
  return asOf >= expires;
}

function evaluatePermission(
  decision: ResearchPermissionDecision,
  required: readonly string[] | undefined,
  satisfied: ReadonlySet<string>,
): { allow: true } | { allow: false; missing: readonly string[] } {
  if (decision === "deny") {
    return { allow: false, missing: required ?? [] };
  }
  if (decision === "allow") {
    return { allow: true };
  }
  // conditional
  const needed = required ?? [];
  if (needed.length === 0) {
    // Conditional with no explicit conditions → deny (never implicit allow).
    return { allow: false, missing: ["explicit_conditions_required"] };
  }
  const missing = needed.filter((condition) => !satisfied.has(condition));
  if (missing.length > 0) {
    return { allow: false, missing };
  }
  return { allow: true };
}

/**
 * Evaluate rights against an already-resolved server policy object.
 * Used by registry lookups and offline tests for revoked/expired fixtures.
 * Caller-supplied policy blobs must not be passed here from untrusted input.
 */
export function evaluateResolvedPolicyRights(input: {
  policy: MarketSourcePolicy;
  operation: ResearchOperation;
  satisfiedConditions?: readonly string[];
  asOf?: string;
  /** When true, skip pin equality (still requires schemaVersion match). */
  allowAlternatePolicyPin?: boolean;
}): RightsEvaluationResult {
  const policy = input.policy;
  const sourceId = policy.sourceId;
  const operation = input.operation;

  if (policy.schemaVersion !== MARKET_SOURCE_POLICY_VERSION) {
    return {
      ok: false,
      decision: "deny",
      sourceId,
      operation,
      code: "POLICY_VERSION_MISMATCH",
      detail: `Unsupported policy schemaVersion '${policy.schemaVersion}'`,
      policyVersion: policy.policyVersion,
    };
  }

  if (
    !input.allowAlternatePolicyPin &&
    policy.policyVersion !== MARKET_RESEARCH_POLICY_PIN
  ) {
    return {
      ok: false,
      decision: "deny",
      sourceId,
      operation,
      code: "POLICY_VERSION_MISMATCH",
      detail: `Policy pin mismatch: expected '${MARKET_RESEARCH_POLICY_PIN}', got '${policy.policyVersion}'`,
      policyVersion: policy.policyVersion,
    };
  }

  if (policy.revoked) {
    return {
      ok: false,
      decision: "deny",
      sourceId,
      operation,
      code: "SOURCE_REVOKED",
      detail: `Source '${sourceId}' is revoked`,
      policyVersion: policy.policyVersion,
    };
  }

  const asOf = input.asOf ?? new Date().toISOString();
  if (isExpired(policy, asOf)) {
    return {
      ok: false,
      decision: "deny",
      sourceId,
      operation,
      code: "LICENSE_DENIED",
      detail: `Source '${sourceId}' policy expired at ${policy.expiresAt}`,
      policyVersion: policy.policyVersion,
    };
  }

  if (policy.rightsClass === "unknown_requires_legal") {
    return {
      ok: false,
      decision: "deny",
      sourceId,
      operation,
      code: "LICENSE_DENIED",
      detail: "UNKNOWN rights class requires legal review — fail closed",
      policyVersion: policy.policyVersion,
    };
  }

  if (policy.rightsClass === "explicitly_prohibited") {
    return {
      ok: false,
      decision: "deny",
      sourceId,
      operation,
      code: "LICENSE_DENIED",
      detail: `Source '${sourceId}' is explicitly prohibited`,
      policyVersion: policy.policyVersion,
    };
  }

  const decision = policy.operationPermissions[operation];
  if (!decision) {
    return {
      ok: false,
      decision: "deny",
      sourceId,
      operation,
      code: "LICENSE_DENIED",
      detail: `No permission recorded for operation '${operation}'`,
      policyVersion: policy.policyVersion,
    };
  }

  const satisfied = new Set(
    (input.satisfiedConditions ?? []).map((c) => c.trim()).filter(Boolean),
  );
  const required = policy.conditionalRequirements[operation];
  const outcome = evaluatePermission(decision, required, satisfied);

  if (!outcome.allow) {
    const code: ResearchFailureCode =
      decision === "deny" && operation === "cache"
        ? "CACHE_FORBIDDEN"
        : decision === "conditional"
          ? "RIGHTS_CONDITIONS_UNSATISFIED"
          : "LICENSE_DENIED";

    return {
      ok: false,
      decision: "deny",
      sourceId,
      operation,
      code,
      detail:
        decision === "conditional"
          ? `Conditional rights for '${operation}' require explicit satisfied conditions`
          : `Operation '${operation}' denied for source '${sourceId}'`,
      policyVersion: policy.policyVersion,
      missingConditions: outcome.missing,
    };
  }

  if (
    operation === "display" &&
    policy.attributionRequired &&
    policy.rightsClass !== "merchant_owned"
  ) {
    const attrKey =
      policy.rightsClass === "display_only_no_cache"
        ? "search_suggestions_rendered_with_results"
        : "inline_citations_rendered";
    if (!satisfied.has(attrKey)) {
      return {
        ok: false,
        decision: "deny",
        sourceId,
        operation,
        code: "ATTRIBUTION_REQUIRED",
        detail: `Attribution required for display of '${sourceId}'`,
        policyVersion: policy.policyVersion,
        missingConditions: [attrKey],
      };
    }
  }

  if (
    operation === "cache" &&
    policy.durableCacheEligible === false &&
    !satisfied.has("ephemeral_request_only_cache")
  ) {
    return {
      ok: false,
      decision: "deny",
      sourceId,
      operation,
      code: "CACHE_FORBIDDEN",
      detail: `Durable/shared cache forbidden for source '${sourceId}'`,
      policyVersion: policy.policyVersion,
    };
  }

  return {
    ok: true,
    decision: "allow",
    sourceId,
    operation,
    policyVersion: policy.policyVersion,
    attributionRequired: policy.attributionRequired,
    durableCacheEligible: policy.durableCacheEligible,
    maxRetentionDays: policy.maxRetentionDays,
  };
}

/**
 * Evaluate a single source×operation permission against the server registry.
 * Deny by default for unknown, revoked, expired, mismatched, or conditional-unmet.
 */
export function evaluateSourceOperationRights(
  input: RightsEvaluationInput,
): RightsEvaluationResult {
  const sourceId = input.sourceId?.trim() ?? "";
  const operation = input.operation;

  if (!sourceId || !operation) {
    return {
      ok: false,
      decision: "deny",
      sourceId: sourceId || "unknown",
      operation: operation ?? "retrieve",
      code: "MALFORMED_REQUEST",
      detail: "sourceId and operation are required",
    };
  }

  if (hasForgedUntrustedInput(input.untrusted)) {
    return {
      ok: false,
      decision: "deny",
      sourceId,
      operation,
      code: "FORGED_POLICY_INPUT",
      detail:
        "Caller-supplied licenseOk, policy, permissions, approval, or rights metadata are never trusted",
    };
  }

  const registered = getMarketSourcePolicy(sourceId);
  if (!registered) {
    const unknown = resolveMarketSourcePolicy(sourceId);
    return {
      ok: false,
      decision: "deny",
      sourceId,
      operation,
      code: "SOURCE_UNKNOWN",
      detail: `Unregistered source '${sourceId}' — UNKNOWN rights fail closed`,
      policyVersion: unknown.policyVersion,
    };
  }

  return evaluateResolvedPolicyRights({
    policy: registered,
    operation,
    satisfiedConditions: input.satisfiedConditions,
    asOf: input.asOf,
  });
}

/**
 * Server-only licenseOk derivation.
 * Never copies a caller boolean. OpenAI Output ownership ≠ third-party license.
 */
export function deriveServerLicenseOk(input: {
  sourceId: string;
  operation: ResearchOperation;
  satisfiedConditions?: readonly string[];
  asOf?: string;
}): boolean {
  const result = evaluateSourceOperationRights({
    sourceId: input.sourceId,
    operation: input.operation,
    satisfiedConditions: input.satisfiedConditions,
    asOf: input.asOf,
  });
  return result.ok === true;
}

/**
 * Gemini automatic fallback is denied unless a separate explicit approval
 * condition is server-satisfied (not granted in AI-MKT-1a defaults).
 */
export function mayUseGeminiAsAutomaticFallback(input?: {
  satisfiedConditions?: readonly string[];
}): boolean {
  const satisfied = new Set(input?.satisfiedConditions ?? []);
  if (!satisfied.has("gemini_automatic_fallback_separately_approved")) {
    return false;
  }
  // Even with that flag, 1a still has no live path — callers must also pass enablement.
  return true;
}

/**
 * OpenAI conditional rights never become implicit live approval.
 */
export function openaiConditionalRightsImplyLiveApproval(): false {
  return false;
}
