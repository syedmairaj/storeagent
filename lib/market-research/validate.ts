/**
 * AI-MKT-1a — runtime validation at untrusted boundaries.
 * Types alone are insufficient; malformed / forged inputs fail closed.
 */

import {
  MARKET_RESEARCH_POLICY_PIN,
  MARKET_RESEARCH_REQUEST_VERSION,
  MARKET_RESEARCH_RESULT_VERSION,
  MARKET_SOURCE_POLICY_VERSION,
  type MarketSourcePolicy,
  type ResearchDepth,
  type ResearchEvidenceItem,
  type ResearchFailureCode,
  type ResearchIntentClass,
  type ResearchProvenance,
  type ResearchRequest,
  type ResearchResult,
  type SignalClass,
  type SourceRightsClass,
} from "@/lib/market-research/types";

const DEPTHS: ReadonlySet<string> = new Set([
  "quick_lookup",
  "standard",
  "deep",
]);

const INTENTS: ReadonlySet<string> = new Set([
  "market_opportunity",
  "zero_sales_diagnosis",
  "competitor_research",
]);

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

const RIGHTS_CLASSES: ReadonlySet<string> = new Set([
  "merchant_owned",
  "provider_output_owned",
  "display_only_no_cache",
  "licensed_dataset",
  "unknown_requires_legal",
  "explicitly_prohibited",
]);

const CLAIM_CLASSES: ReadonlySet<string> = new Set([
  "sourced_signal",
  "estimate",
  "hypothesis",
  "unknown",
]);

const MATCH_QUALITY: ReadonlySet<string> = new Set([
  "exact",
  "partial",
  "mismatch",
  "unknown",
]);

const FRESHNESS: ReadonlySet<string> = new Set(["current", "stale", "unknown"]);
const CONFIDENCE: ReadonlySet<string> = new Set(["low", "medium", "high"]);

export type ValidateOk<T> = { ok: true; value: T };
export type ValidateErr = {
  ok: false;
  code: ResearchFailureCode;
  detail: string;
};
export type ValidateResult<T> = ValidateOk<T> | ValidateErr;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      return null;
    }
    out.push(entry);
  }
  return out;
}

/**
 * Reject caller attempts to smuggle trusted policy / license fields into requests.
 */
function detectForgedAuthorityFields(
  value: Record<string, unknown>,
): ValidateErr | null {
  const forgedKeys = [
    "licenseOk",
    "policy",
    "sourcePolicy",
    "permissions",
    "approval",
    "adapterOverride",
    "forceLive",
    "rightsClass",
  ] as const;

  for (const key of forgedKeys) {
    if (value[key] !== undefined) {
      return {
        ok: false,
        code: "FORGED_POLICY_INPUT",
        detail: `Untrusted request must not include '${key}'`,
      };
    }
  }
  return null;
}

export function parseResearchRequest(
  raw: unknown,
): ValidateResult<ResearchRequest> {
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "ResearchRequest must be an object",
    };
  }

  const forged = detectForgedAuthorityFields(raw);
  if (forged) {
    return forged;
  }

  if (raw.schemaVersion !== MARKET_RESEARCH_REQUEST_VERSION) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: `Expected schemaVersion '${MARKET_RESEARCH_REQUEST_VERSION}'`,
    };
  }

  const clientRequestId = asNonEmptyString(raw.clientRequestId);
  const organizationId = asNonEmptyString(raw.organizationId);
  const countryCode = asNonEmptyString(raw.countryCode);
  const question = asNonEmptyString(raw.question);
  const sourcePolicyVersion = asNonEmptyString(raw.sourcePolicyVersion);
  const depth = asNonEmptyString(raw.depth);
  const intentClass = asNonEmptyString(raw.intentClass);
  const allowAdapters = asStringArray(raw.allowAdapters);

  if (
    !clientRequestId ||
    !organizationId ||
    !countryCode ||
    !question ||
    !sourcePolicyVersion ||
    !depth ||
    !intentClass ||
    !allowAdapters
  ) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "ResearchRequest missing required string / array fields",
    };
  }

  if (!DEPTHS.has(depth)) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: `Invalid depth '${depth}'`,
    };
  }
  if (!INTENTS.has(intentClass)) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: `Invalid intentClass '${intentClass}'`,
    };
  }

  if (sourcePolicyVersion !== MARKET_RESEARCH_POLICY_PIN) {
    return {
      ok: false,
      code: "POLICY_VERSION_MISMATCH",
      detail: `sourcePolicyVersion '${sourcePolicyVersion}' does not match pin '${MARKET_RESEARCH_POLICY_PIN}'`,
    };
  }

  let maxCredits: number | undefined;
  if (raw.maxCredits !== undefined) {
    if (typeof raw.maxCredits !== "number" || !Number.isFinite(raw.maxCredits)) {
      return {
        ok: false,
        code: "MALFORMED_REQUEST",
        detail: "maxCredits must be a finite number when present",
      };
    }
    maxCredits = raw.maxCredits;
  }

  const request: ResearchRequest = {
    schemaVersion: MARKET_RESEARCH_REQUEST_VERSION,
    clientRequestId,
    organizationId,
    countryCode: countryCode.toUpperCase(),
    depth: depth as ResearchDepth,
    intentClass: intentClass as ResearchIntentClass,
    question,
    sourcePolicyVersion,
    allowAdapters,
  };

  const storeId = asNonEmptyString(raw.storeId);
  const variantId = asNonEmptyString(raw.variantId);
  const sku = asNonEmptyString(raw.sku);
  const currencyCode = asNonEmptyString(raw.currencyCode);
  const categoryHint = asNonEmptyString(raw.categoryHint);
  if (storeId) request.storeId = storeId;
  if (variantId) request.variantId = variantId;
  if (sku) request.sku = sku;
  if (currencyCode) request.currencyCode = currencyCode.toUpperCase();
  if (categoryHint) request.categoryHint = categoryHint;
  if (maxCredits !== undefined) request.maxCredits = maxCredits;

  return { ok: true, value: request };
}

export function parseMarketSourcePolicy(
  raw: unknown,
): ValidateResult<MarketSourcePolicy> {
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "MarketSourcePolicy must be an object",
    };
  }

  if (raw.schemaVersion !== MARKET_SOURCE_POLICY_VERSION) {
    return {
      ok: false,
      code: "POLICY_VERSION_MISMATCH",
      detail: `Expected schemaVersion '${MARKET_SOURCE_POLICY_VERSION}'`,
    };
  }

  const policyVersion = asNonEmptyString(raw.policyVersion);
  const sourceId = asNonEmptyString(raw.sourceId);
  const adapterId = asNonEmptyString(raw.adapterId);
  const rightsClass = asNonEmptyString(raw.rightsClass);
  const notes = typeof raw.notes === "string" ? raw.notes : null;
  const allowedCountries = asStringArray(raw.allowedCountries);
  const allowedSignalClasses = asStringArray(raw.allowedSignalClasses);

  if (
    !policyVersion ||
    !sourceId ||
    !adapterId ||
    !rightsClass ||
    notes === null ||
    !allowedCountries ||
    !allowedSignalClasses
  ) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "MarketSourcePolicy missing required fields",
    };
  }

  if (!RIGHTS_CLASSES.has(rightsClass)) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: `Invalid rightsClass '${rightsClass}'`,
    };
  }

  for (const signal of allowedSignalClasses) {
    if (!SIGNAL_CLASSES.has(signal)) {
      return {
        ok: false,
        code: "MALFORMED_REQUEST",
        detail: `Invalid signalClass '${signal}'`,
      };
    }
  }

  if (raw.modelTrainingConsentImplied !== false) {
    return {
      ok: false,
      code: "LICENSE_DENIED",
      detail: "modelTrainingConsentImplied must be false — never implicit",
    };
  }

  if (typeof raw.attributionRequired !== "boolean") {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "attributionRequired must be boolean",
    };
  }
  if (typeof raw.durableCacheEligible !== "boolean") {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "durableCacheEligible must be boolean",
    };
  }
  if (typeof raw.revoked !== "boolean") {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "revoked must be boolean",
    };
  }

  if (
    raw.maxRetentionDays !== null &&
    (typeof raw.maxRetentionDays !== "number" ||
      !Number.isFinite(raw.maxRetentionDays))
  ) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "maxRetentionDays must be number | null",
    };
  }

  if (
    raw.expiresAt !== null &&
    (typeof raw.expiresAt !== "string" || !raw.expiresAt.trim())
  ) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "expiresAt must be ISO string | null",
    };
  }

  if (
    raw.revocationAction !== "purge_tenant_cache" &&
    raw.revocationAction !== "block_adapter" &&
    raw.revocationAction !== "both"
  ) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "Invalid revocationAction",
    };
  }

  if (!isPlainObject(raw.operationPermissions)) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "operationPermissions must be an object",
    };
  }

  const ops = [
    "retrieve",
    "display",
    "normalize",
    "analyze",
    "model_process",
    "cache",
    "retain",
    "redistribute",
  ] as const;
  const operationPermissionsMutable: {
    -readonly [K in keyof MarketSourcePolicy["operationPermissions"]]: MarketSourcePolicy["operationPermissions"][K];
  } = {
    retrieve: "deny",
    display: "deny",
    normalize: "deny",
    analyze: "deny",
    model_process: "deny",
    cache: "deny",
    retain: "deny",
    redistribute: "deny",
  };
  for (const op of ops) {
    const decision = raw.operationPermissions[op];
    if (
      decision !== "allow" &&
      decision !== "deny" &&
      decision !== "conditional"
    ) {
      return {
        ok: false,
        code: "MALFORMED_REQUEST",
        detail: `Invalid permission for '${op}'`,
      };
    }
    operationPermissionsMutable[op] = decision;
  }
  const operationPermissions: MarketSourcePolicy["operationPermissions"] =
    operationPermissionsMutable;

  return {
    ok: true,
    value: {
      schemaVersion: MARKET_SOURCE_POLICY_VERSION,
      policyVersion,
      sourceId,
      adapterId,
      rightsClass: rightsClass as SourceRightsClass,
      allowedCountries,
      allowedSignalClasses: allowedSignalClasses as SignalClass[],
      operationPermissions,
      conditionalRequirements: isPlainObject(raw.conditionalRequirements)
        ? (raw.conditionalRequirements as MarketSourcePolicy["conditionalRequirements"])
        : {},
      attributionRequired: raw.attributionRequired,
      durableCacheEligible: raw.durableCacheEligible,
      maxRetentionDays: raw.maxRetentionDays as number | null,
      modelTrainingConsentImplied: false,
      revoked: raw.revoked,
      expiresAt: raw.expiresAt as string | null,
      notes,
      revocationAction: raw.revocationAction,
    },
  };
}

export function parseResearchProvenance(
  raw: unknown,
): ValidateResult<ResearchProvenance> {
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "ResearchProvenance must be an object",
    };
  }

  const sourceId = asNonEmptyString(raw.sourceId);
  const adapterId = asNonEmptyString(raw.adapterId);
  const retrievedAt = asNonEmptyString(raw.retrievedAt);
  const sourcePolicyVersion = asNonEmptyString(raw.sourcePolicyVersion);
  const rightsClass = asNonEmptyString(raw.rightsClass);
  const sourceUrls = asStringArray(raw.sourceUrls);

  if (
    !sourceId ||
    !adapterId ||
    !retrievedAt ||
    !sourcePolicyVersion ||
    !rightsClass ||
    !sourceUrls
  ) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "ResearchProvenance missing required fields",
    };
  }

  if (!RIGHTS_CLASSES.has(rightsClass)) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: `Invalid rightsClass '${rightsClass}'`,
    };
  }

  if (typeof raw.licenseOk !== "boolean") {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "licenseOk must be boolean (server-set only)",
    };
  }

  // Untrusted true licenseOk is rejected — only false may appear on untrusted parse.
  // Server derivation happens via deriveServerLicenseOk / rights engine.
  if (raw.licenseOk === true) {
    return {
      ok: false,
      code: "FORGED_POLICY_INPUT",
      detail:
        "Untrusted provenance must not assert licenseOk=true; server derives license",
    };
  }

  if (Number.isNaN(Date.parse(retrievedAt))) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "retrievedAt must be a valid ISO timestamp",
    };
  }

  const provenance: ResearchProvenance = {
    sourceId,
    adapterId,
    sourceUrls,
    retrievedAt,
    licenseOk: false,
    rightsClass: rightsClass as SourceRightsClass,
    sourcePolicyVersion,
  };

  const providerRequestId = asNonEmptyString(raw.providerRequestId);
  const observationPeriodStart = asNonEmptyString(raw.observationPeriodStart);
  const observationPeriodEnd = asNonEmptyString(raw.observationPeriodEnd);
  const attributionText = asNonEmptyString(raw.attributionText);
  const searchSuggestionsRef = asNonEmptyString(raw.searchSuggestionsRef);
  if (providerRequestId) provenance.providerRequestId = providerRequestId;
  if (observationPeriodStart)
    provenance.observationPeriodStart = observationPeriodStart;
  if (observationPeriodEnd)
    provenance.observationPeriodEnd = observationPeriodEnd;
  if (attributionText) provenance.attributionText = attributionText;
  if (searchSuggestionsRef)
    provenance.searchSuggestionsRef = searchSuggestionsRef;

  return { ok: true, value: provenance };
}

export function parseResearchEvidenceItem(
  raw: unknown,
): ValidateResult<ResearchEvidenceItem> {
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "ResearchEvidenceItem must be an object",
    };
  }

  const evidenceId = asNonEmptyString(raw.evidenceId);
  const claimClass = asNonEmptyString(raw.claimClass);
  const signalClass = asNonEmptyString(raw.signalClass);
  const label = asNonEmptyString(raw.label);
  const value = asNonEmptyString(raw.value);
  const countryCode = asNonEmptyString(raw.countryCode);
  const matchQuality = asNonEmptyString(raw.matchQuality);
  const freshnessClass = asNonEmptyString(raw.freshnessClass);
  const confidenceClass = asNonEmptyString(raw.confidenceClass);
  const permittedFields = asStringArray(raw.permittedFields);

  if (
    !evidenceId ||
    !claimClass ||
    !signalClass ||
    !label ||
    !value ||
    !countryCode ||
    !matchQuality ||
    !freshnessClass ||
    !confidenceClass ||
    !permittedFields
  ) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "ResearchEvidenceItem missing required fields",
    };
  }

  if (!CLAIM_CLASSES.has(claimClass)) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: `Invalid claimClass '${claimClass}'`,
    };
  }
  if (!SIGNAL_CLASSES.has(signalClass)) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: `Invalid signalClass '${signalClass}'`,
    };
  }
  if (!MATCH_QUALITY.has(matchQuality)) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: `Invalid matchQuality '${matchQuality}'`,
    };
  }
  if (!FRESHNESS.has(freshnessClass)) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: `Invalid freshnessClass '${freshnessClass}'`,
    };
  }
  if (!CONFIDENCE.has(confidenceClass)) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: `Invalid confidenceClass '${confidenceClass}'`,
    };
  }

  const provenanceResult = parseResearchProvenance(raw.provenance);
  if (!provenanceResult.ok) {
    return provenanceResult;
  }

  const item: ResearchEvidenceItem = {
    evidenceId,
    claimClass: claimClass as ResearchEvidenceItem["claimClass"],
    signalClass: signalClass as SignalClass,
    label,
    value,
    countryCode: countryCode.toUpperCase(),
    matchQuality: matchQuality as ResearchEvidenceItem["matchQuality"],
    freshnessClass: freshnessClass as ResearchEvidenceItem["freshnessClass"],
    confidenceClass: confidenceClass as ResearchEvidenceItem["confidenceClass"],
    provenance: provenanceResult.value,
    permittedFields,
  };

  if (raw.unit !== undefined && raw.unit !== null) {
    if (typeof raw.unit !== "string") {
      return {
        ok: false,
        code: "MALFORMED_REQUEST",
        detail: "unit must be string | null",
      };
    }
    item.unit = raw.unit;
  } else if (raw.unit === null) {
    item.unit = null;
  }

  if (raw.currencyCode !== undefined && raw.currencyCode !== null) {
    const currency = asNonEmptyString(raw.currencyCode);
    if (!currency) {
      return {
        ok: false,
        code: "MALFORMED_REQUEST",
        detail: "currencyCode must be non-empty string | null",
      };
    }
    item.currencyCode = currency.toUpperCase();
  } else if (raw.currencyCode === null) {
    item.currencyCode = null;
  }

  return { ok: true, value: item };
}

export function parseResearchResult(
  raw: unknown,
): ValidateResult<ResearchResult> {
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "ResearchResult must be an object",
    };
  }

  if (raw.schemaVersion !== MARKET_RESEARCH_RESULT_VERSION) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: `Expected schemaVersion '${MARKET_RESEARCH_RESULT_VERSION}'`,
    };
  }

  if (raw.ok === false) {
    const code = asNonEmptyString(raw.code);
    const detail = asNonEmptyString(raw.detail);
    if (!code || !detail) {
      return {
        ok: false,
        code: "MALFORMED_REQUEST",
        detail: "Failure ResearchResult requires code and detail",
      };
    }
    return {
      ok: true,
      value: {
        ok: false,
        schemaVersion: MARKET_RESEARCH_RESULT_VERSION,
        code: code as ResearchFailureCode,
        detail,
        creditSettlement:
          raw.creditSettlement === "refunded" ||
          raw.creditSettlement === "not_applicable"
            ? raw.creditSettlement
            : undefined,
      },
    };
  }

  if (raw.ok !== true) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "ResearchResult.ok must be boolean",
    };
  }

  const requestId = asNonEmptyString(raw.requestId);
  const organizationId = asNonEmptyString(raw.organizationId);
  if (!requestId || !organizationId) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "Success ResearchResult requires requestId and organizationId",
    };
  }

  if (
    !Array.isArray(raw.evidence) ||
    !Array.isArray(raw.conflicts) ||
    !Array.isArray(raw.abstentions)
  ) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "evidence, conflicts, and abstentions must be arrays",
    };
  }

  const evidence: ResearchEvidenceItem[] = [];
  for (const entry of raw.evidence) {
    const parsed = parseResearchEvidenceItem(entry);
    if (!parsed.ok) {
      return parsed;
    }
    evidence.push(parsed.value);
  }

  const conflicts: {
    conflictId: string;
    evidenceIds: readonly string[];
    summary: string;
  }[] = [];
  for (const entry of raw.conflicts) {
    if (!isPlainObject(entry)) {
      return {
        ok: false,
        code: "MALFORMED_REQUEST",
        detail: "conflict entries must be objects",
      };
    }
    const conflictId = asNonEmptyString(entry.conflictId);
    const summary = asNonEmptyString(entry.summary);
    const evidenceIds = asStringArray(entry.evidenceIds);
    if (!conflictId || !summary || !evidenceIds) {
      return {
        ok: false,
        code: "MALFORMED_REQUEST",
        detail: "conflict missing conflictId, summary, or evidenceIds",
      };
    }
    conflicts.push({ conflictId, summary, evidenceIds });
  }

  const abstentions: { code: ResearchFailureCode; detail: string }[] = [];
  for (const entry of raw.abstentions) {
    if (!isPlainObject(entry)) {
      return {
        ok: false,
        code: "MALFORMED_REQUEST",
        detail: "abstention entries must be objects",
      };
    }
    const code = asNonEmptyString(entry.code);
    const detail = asNonEmptyString(entry.detail);
    if (!code || !detail) {
      return {
        ok: false,
        code: "MALFORMED_REQUEST",
        detail: "abstention missing code or detail",
      };
    }
    abstentions.push({ code: code as ResearchFailureCode, detail });
  }

  return {
    ok: true,
    value: {
      ok: true,
      schemaVersion: MARKET_RESEARCH_RESULT_VERSION,
      requestId,
      organizationId,
      evidence,
      conflicts,
      abstentions,
      creditSettlement:
        raw.creditSettlement === "reserved" ||
        raw.creditSettlement === "settled" ||
        raw.creditSettlement === "refunded" ||
        raw.creditSettlement === "not_applicable"
          ? raw.creditSettlement
          : undefined,
    },
  };
}
