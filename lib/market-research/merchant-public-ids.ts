/**
 * AI-MKT-1f-R1 — opaque, response-scoped merchant public IDs.
 *
 * Browser-facing DTOs must never expose internal evidence/finding/conflict IDs
 * that embed organizationId, clientRequestId, or snippetId.
 *
 * Mapping is:
 * - response-scoped (fresh HMAC key per DTO conversion)
 * - non-reversible without the in-memory key (key never leaves the mapper)
 * - stable within one response (citations ↔ findings referential integrity)
 * - non-correlatable across responses / tenants
 *
 * Internal orchestration IDs, evidence hashes, and claim validation are unchanged.
 */

import { createHmac, randomBytes } from "node:crypto";

const PUBLIC_PREFIX = {
  evidence: "mev_",
  finding: "mfd_",
  conflict: "mcf_",
} as const;

export type MerchantPublicIdKind = keyof typeof PUBLIC_PREFIX;

/** Internal ID shapes that must never appear in merchant-facing strings. */
export const INTERNAL_EVIDENCE_ID_RE = /\bmkt1c:[^\s"'`]+/gi;
export const INTERNAL_FINDING_ID_RE = /\bmkt1d-finding:[^\s"'`]+/gi;
export const INTERNAL_ID_PREFIX_RE = /^(mkt1c:|mkt1d-finding:)/i;

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

export type MerchantPublicIdMapper = {
  mapEvidenceId: (internalEvidenceId: string) => string;
  mapFindingId: (internalFindingId: string) => string;
  mapConflictId: (internalConflictId: string) => string;
  /** Replace known internal IDs; scrub residual mkt1c / mkt1d-finding tokens. */
  redactInternalIdentifiers: (text: string) => string;
  /** All public IDs issued in this response (for uniqueness checks). */
  issuedPublicIds: () => readonly string[];
};

function opaquePublicId(
  kind: MerchantPublicIdKind,
  responseKey: Buffer,
  internalId: string,
): string {
  const digest = createHmac("sha256", responseKey)
    .update(`${kind}\0${internalId}`, "utf8")
    .digest("hex")
    .slice(0, 24);
  return `${PUBLIC_PREFIX[kind]}${digest}`;
}

/**
 * Create a one-shot mapper for a single merchant DTO conversion.
 * `responseKeyMaterial` is for tests only — production callers omit it.
 */
export function createMerchantPublicIdMapper(
  responseKeyMaterial?: string | Buffer,
): MerchantPublicIdMapper {
  const responseKey =
    typeof responseKeyMaterial === "string"
      ? Buffer.from(responseKeyMaterial, "utf8")
      : responseKeyMaterial instanceof Buffer
        ? responseKeyMaterial
        : randomBytes(32);

  const evidence = new Map<string, string>();
  const finding = new Map<string, string>();
  const conflict = new Map<string, string>();
  const issued: string[] = [];

  function remember(
    cache: Map<string, string>,
    kind: MerchantPublicIdKind,
    internalId: string,
  ): string {
    const existing = cache.get(internalId);
    if (existing) {
      return existing;
    }
    const publicId = opaquePublicId(kind, responseKey, internalId);
    cache.set(internalId, publicId);
    issued.push(publicId);
    return publicId;
  }

  return {
    mapEvidenceId: (internalEvidenceId) =>
      remember(evidence, "evidence", internalEvidenceId),
    mapFindingId: (internalFindingId) =>
      remember(finding, "finding", internalFindingId),
    mapConflictId: (internalConflictId) =>
      remember(conflict, "conflict", internalConflictId),
    redactInternalIdentifiers(text) {
      let out = text;
      for (const [internal, publicId] of evidence) {
        if (out.includes(internal)) {
          out = out.split(internal).join(publicId);
        }
      }
      for (const [internal, publicId] of finding) {
        if (out.includes(internal)) {
          out = out.split(internal).join(publicId);
        }
      }
      for (const [internal, publicId] of conflict) {
        if (out.includes(internal)) {
          out = out.split(internal).join(publicId);
        }
      }
      out = out.replace(INTERNAL_EVIDENCE_ID_RE, "[redacted-evidence]");
      out = out.replace(INTERNAL_FINDING_ID_RE, "[redacted-finding]");
      return out;
    },
    issuedPublicIds: () => [...issued],
  };
}

export function isOpaqueMerchantPublicId(value: string): boolean {
  return /^(mev_|mfd_|mcf_)[a-f0-9]{24}$/.test(value);
}

export function looksLikeInternalMarketResearchId(value: string): boolean {
  if (INTERNAL_ID_PREFIX_RE.test(value)) {
    return true;
  }
  // conflict-${snippetId} residue sometimes embeds request/snippet tokens.
  if (/^conflict-.+:/.test(value) && UUID_RE.test(value)) {
    return true;
  }
  return false;
}

/**
 * Scan a merchant DTO blob for residual internal identifier leakage.
 * Returns empty array when clean.
 */
export function findInternalIdLeakage(
  value: unknown,
  knownTenantTokens: readonly string[] = [],
): readonly string[] {
  const leaks: string[] = [];
  const blob = JSON.stringify(value);
  if (INTERNAL_EVIDENCE_ID_RE.test(blob)) {
    leaks.push("mkt1c_internal_evidence_id");
  }
  // Reset lastIndex after global regex test.
  INTERNAL_EVIDENCE_ID_RE.lastIndex = 0;
  if (INTERNAL_FINDING_ID_RE.test(blob)) {
    leaks.push("mkt1d_internal_finding_id");
  }
  INTERNAL_FINDING_ID_RE.lastIndex = 0;
  for (const token of knownTenantTokens) {
    if (token.length >= 8 && blob.includes(token)) {
      leaks.push(`tenant_token:${token.slice(0, 8)}`);
    }
  }
  return leaks;
}
