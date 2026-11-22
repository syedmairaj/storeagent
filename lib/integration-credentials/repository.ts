import "server-only";

/**
 * SHOPIFY-CONN-1c-α/β + CONN-1d-C — server-only tenant-scoped credential
 * persistence. Encrypt/decrypt via CONN-1b; sealed bytes only over SECURITY
 * DEFINER RPCs. β adds acquire/rotate/release; 1d-C adds disconnect/revoke.
 * No OAuth or KEK wiring.
 */

import {
  decryptCredentialSet,
  encryptCredentialSet,
  toIntegrationCredentialByteaColumns,
} from "@/lib/integration-credentials/envelope";
import {
  isCredentialCryptoError,
  type CredentialCryptoError,
} from "@/lib/integration-credentials/errors";
import {
  type KekResolver,
} from "@/lib/integration-credentials/kek";
import {
  AUTH_TAG_BYTE_LENGTH,
  NONCE_BYTE_LENGTH,
  type CredentialTokenKind,
  type DecryptedCredentialSet,
  type PlaintextCredentialSet,
  type SealedCredentialEnvelope,
  type SealedField,
} from "@/lib/integration-credentials/types";
import {
  assertServiceOperationScope,
  type TrustedServiceTenantScope,
} from "@/lib/tenancy/service-role-policy";
import type {
  TenantContext,
} from "@/lib/tenancy/types";

/** Brand: only resolveIntegrationOwnershipForTenant may mint ownership. */
const RESOLVED_INTEGRATION_OWNERSHIP_BRAND: unique symbol = Symbol(
  "ResolvedIntegrationOwnership",
);

/** Brand: only buildTrustedCredentialScope may mint vault scopes. */
const TRUSTED_CREDENTIAL_SCOPE_BRAND: unique symbol = Symbol(
  "TrustedCredentialScope",
);

/**
 * CONN-1c-α does not ship a live DB ownership resolver or route wiring.
 * Structural TenantContext + lookup boundary exists; end-to-end production
 * binding authorization remains NOT_YET_VERIFIED until a trusted lookup is
 * authorized in a later slice.
 */
export const CREDENTIAL_BINDING_AUTHORIZATION_STATUS =
  "NOT_YET_VERIFIED" as const;

/**
 * Record returned by an independently org-scoped ownership lookup.
 * Must not be treated as authorization by itself.
 */
export type IntegrationOwnershipRecord = {
  readonly id: string;
  readonly organizationId: string;
  readonly storeId: string | null;
  readonly provider: string;
};

/**
 * Independently resolved ownership under a trusted TenantContext.
 * Not forgeable as a plain object — brand required.
 */
export type ResolvedIntegrationOwnership = {
  readonly [RESOLVED_INTEGRATION_OWNERSHIP_BRAND]: true;
  readonly integrationId: string;
  readonly organizationId: string;
  readonly storeId: string | null;
  readonly provider: string;
};

/**
 * Org-scoped lookup port. Implementations MUST filter by organizationId
 * before returning a row. CONN-1c-α ships no production implementation.
 */
export type IntegrationOwnershipLookup = {
  findByOrganizationAndId(input: {
    organizationId: string;
    integrationId: string;
  }): PromiseLike<IntegrationOwnershipRecord | null>;
};

export type TrustedCredentialScope = {
  readonly [TRUSTED_CREDENTIAL_SCOPE_BRAND]: true;
  readonly organizationId: string;
  readonly integrationId: string;
  readonly provider: string;
  readonly storeId: string | null;
  readonly source: "integration_binding";
};

export type CredentialPersistOutcome =
  | "inserted"
  | "replaced"
  | "conflict"
  | "not_found"
  | "fenced";

export type CredentialClearOutcome =
  | "cleared"
  | "fenced"
  | "not_found";

export type CredentialRotateUnderLeaseOutcome =
  | "rotated"
  | "fenced"
  | "not_found";

export type CredentialReleaseOutcome =
  | "released"
  | "fenced"
  | "not_found";

export type CredentialDisconnectReasonClass =
  | "merchant_disconnect"
  | "uninstall"
  | "hard_auth_failure";

export type CredentialDisconnectTerminalStatus =
  | "disconnected"
  | "revoked";

export type CredentialDisconnectOutcome =
  | "completed"
  | "lease_held"
  | "already_terminal"
  | "conflict"
  | "not_found";

export type DisconnectOrRevokeResult = {
  outcome: CredentialDisconnectOutcome;
  integrationStatus: string | null;
  credentialGeneration: number | null;
  vaultPresent: boolean;
  refreshLockExpiresAt: string | null;
  externalAccountReleased: boolean;
  /** True only for completed / already_terminal — never lease_held. */
  credentialsDestroyed: boolean;
};

export type CredentialPersistenceErrorCode =
  | "invalid_scope"
  | "scope_mismatch"
  | "integration_not_found"
  | "rpc_failed"
  | "malformed_rpc_response"
  | "malformed_bytea"
  | "unexpected_outcome"
  | "invalid_generation"
  | "invalid_lease_seconds"
  | "invalid_owner_id";

/** Lease owner id shape — mirrors β SQL allowlist. */
const REFRESH_LOCK_OWNER_ID_RE = /^[A-Za-z0-9_.:-]{1,200}$/;

export const REFRESH_LOCK_LEASE_SECONDS_MIN = 30 as const;
export const REFRESH_LOCK_LEASE_SECONDS_MAX = 300 as const;
export const REFRESH_LOCK_LEASE_SECONDS_DEFAULT = 60 as const;

export class CredentialPersistenceError extends Error {
  readonly code: CredentialPersistenceErrorCode;

  constructor(code: CredentialPersistenceErrorCode) {
    super(code);
    this.name = "CredentialPersistenceError";
    this.code = code;
  }
}

export function isCredentialPersistenceError(
  value: unknown,
): value is CredentialPersistenceError {
  return value instanceof CredentialPersistenceError;
}

export type LoadedCredentialRecord = {
  id: string;
  organizationId: string;
  integrationId: string;
  provider: string;
  tokenKind: CredentialTokenKind;
  envelope: SealedCredentialEnvelope;
  keyVersion: number;
  accessExpiresAt: string | null;
  refreshExpiresAt: string | null;
  scope: string | null;
  credentialGeneration: number;
  lastRotatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReplaceCredentialResult = {
  credentialId: string | null;
  credentialGeneration: number | null;
  outcome: CredentialPersistOutcome;
};

type RpcResult<T> = {
  data: T;
  error: { message?: string; code?: string } | null;
};

export type IntegrationCredentialRpcClient = {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<RpcResult<unknown>>;
};

type ReplaceRpcRow = {
  credential_id: string | null;
  credential_generation: number | string | bigint | null;
  outcome: string;
};

type LoadRpcRow = {
  id: string;
  organization_id: string;
  integration_id: string;
  provider: string;
  token_kind: string;
  access_ciphertext: string | Buffer;
  access_nonce: string | Buffer;
  access_auth_tag: string | Buffer;
  refresh_ciphertext: string | Buffer | null;
  refresh_nonce: string | Buffer | null;
  refresh_auth_tag: string | Buffer | null;
  dek_wrapped: string | Buffer;
  dek_wrap_nonce: string | Buffer;
  dek_wrap_auth_tag: string | Buffer;
  key_version: number;
  access_expires_at: string | null;
  refresh_expires_at: string | null;
  scope: string | null;
  credential_generation: number | string | bigint;
  last_rotated_at: string | null;
  created_at: string;
  updated_at: string;
};

type AcquireRpcRow = {
  acquired: boolean;
  refresh_lock_token: string | null;
  refresh_lock_expires_at: string | null;
  credential_generation: number | string | bigint | null;
  id: string | null;
  organization_id: string | null;
  integration_id: string | null;
  provider: string | null;
  token_kind: string | null;
  access_ciphertext: string | Buffer | null;
  access_nonce: string | Buffer | null;
  access_auth_tag: string | Buffer | null;
  refresh_ciphertext: string | Buffer | null;
  refresh_nonce: string | Buffer | null;
  refresh_auth_tag: string | Buffer | null;
  dek_wrapped: string | Buffer | null;
  dek_wrap_nonce: string | Buffer | null;
  dek_wrap_auth_tag: string | Buffer | null;
  key_version: number | null;
  access_expires_at: string | null;
  refresh_expires_at: string | null;
  scope: string | null;
  last_rotated_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AcquireRefreshLockDenied = {
  acquired: false;
};

export type AcquireRefreshLockGranted = {
  acquired: true;
  refreshLockToken: string;
  refreshLockExpiresAt: string;
  record: LoadedCredentialRecord;
};

export type AcquireRefreshLockResult =
  | AcquireRefreshLockDenied
  | AcquireRefreshLockGranted;

export type RotateUnderLeaseResult = {
  credentialId: string | null;
  credentialGeneration: number | null;
  outcome: CredentialRotateUnderLeaseOutcome;
};

function requiredTrimmed(value: string): string {
  if (typeof value !== "string") {
    throw new CredentialPersistenceError("invalid_scope");
  }
  const normalized = value.trim();
  // Reject blanks and surrounding whitespace (identity must already be trim).
  if (!normalized || value !== normalized) {
    throw new CredentialPersistenceError("invalid_scope");
  }
  return normalized;
}

function isBrandedTrustedScope(
  scope: unknown,
): scope is TrustedCredentialScope {
  return (
    typeof scope === "object"
    && scope !== null
    && (scope as { [TRUSTED_CREDENTIAL_SCOPE_BRAND]?: unknown })[
      TRUSTED_CREDENTIAL_SCOPE_BRAND
    ] === true
  );
}

function isBrandedOwnership(
  ownership: unknown,
): ownership is ResolvedIntegrationOwnership {
  return (
    typeof ownership === "object"
    && ownership !== null
    && (ownership as { [RESOLVED_INTEGRATION_OWNERSHIP_BRAND]?: unknown })[
      RESOLVED_INTEGRATION_OWNERSHIP_BRAND
    ] === true
  );
}

function assertTrustedTenantContext(tenant: TenantContext): void {
  if (
    tenant == null
    || typeof tenant !== "object"
  ) {
    throw new CredentialPersistenceError("invalid_scope");
  }

  const organizationId = requiredTrimmed(tenant.organizationId);
  requiredTrimmed(tenant.userId);
  requiredTrimmed(tenant.role);

  if (tenant.storeId !== null) {
    requiredTrimmed(tenant.storeId);
  }

  const tenantScope: TrustedServiceTenantScope = {
    organizationId,
    storeId: tenant.storeId,
    source: "resolved_tenant_context",
  };

  try {
    assertServiceOperationScope({
      operation: "integration_credentials.tenant_context",
      scope: tenantScope,
    });
  } catch {
    throw new CredentialPersistenceError("invalid_scope");
  }
}

/**
 * Resolve integration ownership under a trusted TenantContext via an
 * independently org-scoped lookup. Matching IDs alone are not enough:
 * ownership must be returned by the lookup for tenant.organizationId.
 *
 * Production DB lookup wiring is NOT shipped in CONN-1c-α
 * (`CREDENTIAL_BINDING_AUTHORIZATION_STATUS = NOT_YET_VERIFIED`).
 */
export async function resolveIntegrationOwnershipForTenant(input: {
  tenant: TenantContext;
  integrationId: string;
  lookup: IntegrationOwnershipLookup;
  expectedProvider?: string;
}): Promise<ResolvedIntegrationOwnership> {
  assertTrustedTenantContext(input.tenant);

  const organizationId = requiredTrimmed(input.tenant.organizationId);
  const integrationId = requiredTrimmed(input.integrationId);

  let record: IntegrationOwnershipRecord | null;
  try {
    record = await input.lookup.findByOrganizationAndId({
      organizationId,
      integrationId,
    });
  } catch {
    // Lookup failures must not leak driver/SQL details.
    throw new CredentialPersistenceError("rpc_failed");
  }

  if (record == null) {
    throw new CredentialPersistenceError("integration_not_found");
  }

  const recordOrg = requiredTrimmed(record.organizationId);
  const recordId = requiredTrimmed(record.id);
  const provider = requiredTrimmed(record.provider);

  if (recordOrg !== organizationId || recordId !== integrationId) {
    throw new CredentialPersistenceError("scope_mismatch");
  }

  if (record.storeId !== null) {
    requiredTrimmed(record.storeId);
  }

  // If tenant selected a store and ownership is store-scoped, they must match.
  if (
    input.tenant.storeId !== null
    && record.storeId !== null
    && input.tenant.storeId !== record.storeId
  ) {
    throw new CredentialPersistenceError("scope_mismatch");
  }

  if (
    input.expectedProvider !== undefined
    && requiredTrimmed(input.expectedProvider) !== provider
  ) {
    throw new CredentialPersistenceError("scope_mismatch");
  }

  return {
    [RESOLVED_INTEGRATION_OWNERSHIP_BRAND]: true,
    integrationId: recordId,
    organizationId: recordOrg,
    storeId: record.storeId,
    provider,
  };
}

/**
 * Mint vault scope from trusted TenantContext + independently resolved ownership.
 * Rejects fabricated (unbranded) ownership objects.
 */
export function buildTrustedCredentialScope(
  tenant: TenantContext,
  ownership: ResolvedIntegrationOwnership,
): TrustedCredentialScope {
  assertTrustedTenantContext(tenant);

  if (!isBrandedOwnership(ownership)) {
    throw new CredentialPersistenceError("invalid_scope");
  }

  const organizationId = requiredTrimmed(tenant.organizationId);

  if (ownership.organizationId !== organizationId) {
    throw new CredentialPersistenceError("scope_mismatch");
  }

  if (
    tenant.storeId !== null
    && ownership.storeId !== null
    && tenant.storeId !== ownership.storeId
  ) {
    throw new CredentialPersistenceError("scope_mismatch");
  }

  requiredTrimmed(ownership.integrationId);
  requiredTrimmed(ownership.provider);

  return {
    [TRUSTED_CREDENTIAL_SCOPE_BRAND]: true,
    organizationId,
    integrationId: ownership.integrationId,
    provider: ownership.provider,
    storeId: ownership.storeId,
    source: "integration_binding",
  };
}

/**
 * Defense-in-depth: reject missing, fabricated (unbranded), or blank scopes.
 */
export function assertTrustedCredentialScope(
  scope: TrustedCredentialScope | null | undefined,
  operation: string,
): asserts scope is TrustedCredentialScope {
  void operation;
  if (!isBrandedTrustedScope(scope)) {
    throw new CredentialPersistenceError("invalid_scope");
  }

  const tenantScope: TrustedServiceTenantScope = {
    organizationId: scope.organizationId,
    storeId: scope.storeId,
    source: scope.source,
  };

  try {
    assertServiceOperationScope({
      operation: "integration_credentials.assert_scope",
      scope: tenantScope,
    });
  } catch {
    throw new CredentialPersistenceError("invalid_scope");
  }

  if (scope.source !== "integration_binding") {
    throw new CredentialPersistenceError("invalid_scope");
  }

  requiredTrimmed(scope.organizationId);
  requiredTrimmed(scope.integrationId);
  requiredTrimmed(scope.provider);
}

/**
 * Parse positive credential generation from inputs/RPC (number|string|bigint).
 * Rejects unsafe integers, zero/negative, and overflow beyond MAX_SAFE_INTEGER.
 */
export function parsePositiveSafeGeneration(value: unknown): number {
  if (typeof value === "bigint") {
    if (value < BigInt(1) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new CredentialPersistenceError("invalid_generation");
    }
    return Number(value);
  }

  if (typeof value === "string") {
    if (!/^[1-9][0-9]*$/.test(value)) {
      throw new CredentialPersistenceError("invalid_generation");
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      throw new CredentialPersistenceError("invalid_generation");
    }
    return parsed;
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new CredentialPersistenceError("invalid_generation");
    }
    return value;
  }

  throw new CredentialPersistenceError("invalid_generation");
}

function toByteaParam(value: Buffer): string {
  return `\\x${value.toString("hex")}`;
}

const PG_HEX_BYTEA = /^\\x([0-9a-fA-F]*)$/;
const STANDARD_BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Strict bytea decode for RPC responses.
 * Accepts: Buffer, PostgreSQL \\x hex (even-length), canonical standard Base64.
 * Rejects: odd-length/truncated hex, URL-safe Base64, whitespace, non-canonical Base64.
 */
export function parseCredentialBytea(
  value: string | Buffer,
): Buffer {
  if (Buffer.isBuffer(value)) {
    return Buffer.from(value);
  }

  if (typeof value !== "string" || value.length === 0) {
    throw new CredentialPersistenceError("malformed_bytea");
  }

  // No trim: surrounding whitespace is malformed.
  if (value.startsWith("\\x")) {
    const match = PG_HEX_BYTEA.exec(value);
    if (!match) {
      throw new CredentialPersistenceError("malformed_bytea");
    }
    const hex = match[1] ?? "";
    if (hex.length % 2 !== 0) {
      throw new CredentialPersistenceError("malformed_bytea");
    }
    if (hex.length === 0) {
      throw new CredentialPersistenceError("malformed_bytea");
    }
    return Buffer.from(hex, "hex");
  }

  // Double-escaped hex from some serializers: \\x...
  if (value.startsWith("\\\\x")) {
    throw new CredentialPersistenceError("malformed_bytea");
  }

  if (!STANDARD_BASE64.test(value) || /\s/.test(value) || value.includes("-") || value.includes("_")) {
    throw new CredentialPersistenceError("malformed_bytea");
  }

  let decoded: Buffer;
  try {
    decoded = Buffer.from(value, "base64");
  } catch {
    throw new CredentialPersistenceError("malformed_bytea");
  }

  if (decoded.length === 0) {
    throw new CredentialPersistenceError("malformed_bytea");
  }

  // Canonical round-trip: Node may accept non-canonical forms; reject them.
  if (decoded.toString("base64") !== value) {
    throw new CredentialPersistenceError("malformed_bytea");
  }

  return decoded;
}

function assertSealedFieldShape(field: SealedField): void {
  if (
    !Buffer.isBuffer(field.ciphertext)
    || field.ciphertext.length === 0
    || !Buffer.isBuffer(field.nonce)
    || field.nonce.length !== NONCE_BYTE_LENGTH
    || !Buffer.isBuffer(field.authTag)
    || field.authTag.length !== AUTH_TAG_BYTE_LENGTH
  ) {
    throw new CredentialPersistenceError("malformed_bytea");
  }
}

function asTokenKind(value: string): CredentialTokenKind {
  if (value !== "offline_expiring") {
    throw new CredentialPersistenceError("malformed_rpc_response");
  }
  return value;
}

function mapLoadRow(row: LoadRpcRow): LoadedCredentialRecord {
  const tokenKind = asTokenKind(row.token_kind);
  const refreshCipher = row.refresh_ciphertext;
  const refreshNonce = row.refresh_nonce;
  const refreshTag = row.refresh_auth_tag;

  const refreshPresent =
    refreshCipher != null || refreshNonce != null || refreshTag != null;
  if (
    refreshPresent
    && (refreshCipher == null || refreshNonce == null || refreshTag == null)
  ) {
    throw new CredentialPersistenceError("malformed_bytea");
  }

  const refresh =
    refreshCipher != null && refreshNonce != null && refreshTag != null
      ? {
          ciphertext: parseCredentialBytea(refreshCipher),
          nonce: parseCredentialBytea(refreshNonce),
          authTag: parseCredentialBytea(refreshTag),
        }
      : null;

  if (refresh !== null) {
    assertSealedFieldShape(refresh);
  }

  const access: SealedField = {
    ciphertext: parseCredentialBytea(row.access_ciphertext),
    nonce: parseCredentialBytea(row.access_nonce),
    authTag: parseCredentialBytea(row.access_auth_tag),
  };
  assertSealedFieldShape(access);

  const dekWrap: SealedField = {
    ciphertext: parseCredentialBytea(row.dek_wrapped),
    nonce: parseCredentialBytea(row.dek_wrap_nonce),
    authTag: parseCredentialBytea(row.dek_wrap_auth_tag),
  };
  assertSealedFieldShape(dekWrap);

  if (
    tokenKind === "offline_expiring"
    && refresh === null
  ) {
    throw new CredentialPersistenceError("malformed_bytea");
  }

  if (
    typeof row.key_version !== "number"
    || !Number.isInteger(row.key_version)
    || row.key_version < 1
  ) {
    throw new CredentialPersistenceError("malformed_rpc_response");
  }

  let credentialGeneration: number;
  try {
    credentialGeneration = parsePositiveSafeGeneration(
      row.credential_generation,
    );
  } catch (error) {
    if (isCredentialPersistenceError(error)) {
      throw new CredentialPersistenceError("malformed_rpc_response");
    }
    throw error;
  }

  const envelope: SealedCredentialEnvelope = {
    organizationId: row.organization_id,
    integrationId: row.integration_id,
    provider: row.provider,
    tokenKind,
    keyVersion: row.key_version,
    access,
    refresh,
    dekWrap,
  };

  return {
    id: row.id,
    organizationId: row.organization_id,
    integrationId: row.integration_id,
    provider: row.provider,
    tokenKind,
    envelope,
    keyVersion: row.key_version,
    accessExpiresAt: row.access_expires_at,
    refreshExpiresAt: row.refresh_expires_at,
    scope: row.scope,
    credentialGeneration,
    lastRotatedAt: row.last_rotated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sealedArgsFromPlaintext(
  plaintext: PlaintextCredentialSet,
  kekResolver: KekResolver,
  metadata: {
    accessExpiresAt: string | null;
    refreshExpiresAt: string | null;
    scope: string | null;
  },
): Record<string, unknown> {
  const envelope = encryptCredentialSet(plaintext, kekResolver);
  const columns = toIntegrationCredentialByteaColumns(envelope);

  return {
    p_organization_id: plaintext.organizationId,
    p_integration_id: plaintext.integrationId,
    p_provider: plaintext.provider,
    p_token_kind: plaintext.tokenKind,
    p_access_ciphertext: toByteaParam(columns.access_ciphertext),
    p_access_nonce: toByteaParam(columns.access_nonce),
    p_access_auth_tag: toByteaParam(columns.access_auth_tag),
    p_refresh_ciphertext:
      columns.refresh_ciphertext != null
        ? toByteaParam(columns.refresh_ciphertext)
        : null,
    p_refresh_nonce:
      columns.refresh_nonce != null
        ? toByteaParam(columns.refresh_nonce)
        : null,
    p_refresh_auth_tag:
      columns.refresh_auth_tag != null
        ? toByteaParam(columns.refresh_auth_tag)
        : null,
    p_dek_wrapped: toByteaParam(columns.dek_wrapped),
    p_dek_wrap_nonce: toByteaParam(columns.dek_wrap_nonce),
    p_dek_wrap_auth_tag: toByteaParam(columns.dek_wrap_auth_tag),
    p_key_version: columns.key_version,
    p_access_expires_at: metadata.accessExpiresAt,
    p_refresh_expires_at: metadata.refreshExpiresAt,
    p_scope: metadata.scope,
  };
}

function assertScopeMatchesPlaintext(
  scope: TrustedCredentialScope,
  plaintext: PlaintextCredentialSet,
): void {
  if (
    plaintext.organizationId !== scope.organizationId
    || plaintext.integrationId !== scope.integrationId
    || plaintext.provider !== scope.provider
  ) {
    throw new CredentialPersistenceError("scope_mismatch");
  }
}

async function callRpc<T>(
  client: IntegrationCredentialRpcClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  let result: RpcResult<unknown>;
  try {
    result = await client.rpc(fn, args);
  } catch {
    // Normalize thrown driver/SQL exceptions — never expose raw messages.
    throw new CredentialPersistenceError("rpc_failed");
  }

  if (result.error) {
    // Never propagate raw SQL / PostgREST messages (may contain details).
    throw new CredentialPersistenceError("rpc_failed");
  }
  return result.data as T;
}

function parseReplaceOutcome(row: ReplaceRpcRow | undefined): ReplaceCredentialResult {
  if (!row || typeof row.outcome !== "string") {
    throw new CredentialPersistenceError("malformed_rpc_response");
  }

  if (
    row.outcome !== "inserted"
    && row.outcome !== "replaced"
    && row.outcome !== "conflict"
    && row.outcome !== "not_found"
    && row.outcome !== "fenced"
  ) {
    throw new CredentialPersistenceError("unexpected_outcome");
  }

  let credentialGeneration: number | null = null;
  if (row.credential_generation != null) {
    try {
      credentialGeneration = parsePositiveSafeGeneration(
        row.credential_generation,
      );
    } catch (error) {
      if (isCredentialPersistenceError(error)) {
        throw new CredentialPersistenceError("malformed_rpc_response");
      }
      throw error;
    }
  }

  return {
    credentialId: row.credential_id,
    credentialGeneration,
    outcome: row.outcome,
  };
}

/**
 * Create-only insert (p_expected_generation NULL). Never overwrites.
 */
export async function createIntegrationCredentials(input: {
  scope: TrustedCredentialScope;
  plaintext: PlaintextCredentialSet;
  kekResolver: KekResolver;
  accessExpiresAt?: string | null;
  refreshExpiresAt?: string | null;
  scopeGranted?: string | null;
  client: IntegrationCredentialRpcClient;
}): Promise<ReplaceCredentialResult> {
  assertTrustedCredentialScope(
    input.scope,
    "integration_credentials.create",
  );
  assertScopeMatchesPlaintext(input.scope, input.plaintext);

  const args = {
    ...sealedArgsFromPlaintext(input.plaintext, input.kekResolver, {
      accessExpiresAt: input.accessExpiresAt ?? null,
      refreshExpiresAt: input.refreshExpiresAt ?? null,
      scope: input.scopeGranted ?? null,
    }),
    p_expected_generation: null,
  };

  const rows = await callRpc<ReplaceRpcRow[] | ReplaceRpcRow>(
    input.client,
    "replace_integration_credential_set",
    args,
  );

  const row = Array.isArray(rows) ? rows[0] : rows;
  return parseReplaceOutcome(row);
}

/**
 * CAS replace requiring expected generation. Conflict on mismatch or
 * unexpired refresh lease (β foresight — ordinary α ops do not override).
 */
export async function replaceIntegrationCredentials(input: {
  scope: TrustedCredentialScope;
  plaintext: PlaintextCredentialSet;
  expectedGeneration: number;
  kekResolver: KekResolver;
  accessExpiresAt?: string | null;
  refreshExpiresAt?: string | null;
  scopeGranted?: string | null;
  client: IntegrationCredentialRpcClient;
}): Promise<ReplaceCredentialResult> {
  assertTrustedCredentialScope(
    input.scope,
    "integration_credentials.replace",
  );
  assertScopeMatchesPlaintext(input.scope, input.plaintext);

  const expectedGeneration = parsePositiveSafeGeneration(
    input.expectedGeneration,
  );

  const args = {
    ...sealedArgsFromPlaintext(input.plaintext, input.kekResolver, {
      accessExpiresAt: input.accessExpiresAt ?? null,
      refreshExpiresAt: input.refreshExpiresAt ?? null,
      scope: input.scopeGranted ?? null,
    }),
    p_expected_generation: expectedGeneration,
  };

  const rows = await callRpc<ReplaceRpcRow[] | ReplaceRpcRow>(
    input.client,
    "replace_integration_credential_set",
    args,
  );

  const row = Array.isArray(rows) ? rows[0] : rows;
  return parseReplaceOutcome(row);
}

/**
 * Load sealed envelope. Decrypt is separate so crypto failure never clears.
 */
export async function loadIntegrationCredentialEnvelope(input: {
  scope: TrustedCredentialScope;
  client: IntegrationCredentialRpcClient;
}): Promise<LoadedCredentialRecord | null> {
  assertTrustedCredentialScope(
    input.scope,
    "integration_credentials.load",
  );

  const rows = await callRpc<LoadRpcRow[] | LoadRpcRow | null>(
    input.client,
    "load_integration_credential_envelope",
    {
      p_organization_id: input.scope.organizationId,
      p_integration_id: input.scope.integrationId,
      p_provider: input.scope.provider,
    },
  );

  if (rows == null) {
    return null;
  }

  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) {
    return null;
  }

  const loaded = mapLoadRow(row);

  if (
    loaded.organizationId !== input.scope.organizationId
    || loaded.integrationId !== input.scope.integrationId
    || loaded.provider !== input.scope.provider
  ) {
    throw new CredentialPersistenceError("scope_mismatch");
  }

  return loaded;
}

/**
 * Load + decrypt. On CredentialCryptoError, does NOT clear stored credentials.
 */
export async function loadAndDecryptIntegrationCredentials(input: {
  scope: TrustedCredentialScope;
  kekResolver: KekResolver;
  client: IntegrationCredentialRpcClient;
}): Promise<{
  record: LoadedCredentialRecord;
  plaintext: DecryptedCredentialSet;
} | null> {
  const record = await loadIntegrationCredentialEnvelope({
    scope: input.scope,
    client: input.client,
  });

  if (record == null) {
    return null;
  }

  try {
    const plaintext = decryptCredentialSet(
      record.envelope,
      input.kekResolver,
    );
    return { record, plaintext };
  } catch (error) {
    if (isCredentialCryptoError(error)) {
      // Fail closed without vault mutation — recoverable ciphertext preserved.
      throw error;
    }
    throw error;
  }
}

/**
 * Generation-fenced clear. Stale generation or unexpired lease => fenced.
 * Never invoked automatically on decrypt/KEK failure.
 */
export async function clearIntegrationCredentials(input: {
  scope: TrustedCredentialScope;
  expectedGeneration: number;
  client: IntegrationCredentialRpcClient;
}): Promise<CredentialClearOutcome> {
  assertTrustedCredentialScope(
    input.scope,
    "integration_credentials.clear",
  );

  const expectedGeneration = parsePositiveSafeGeneration(
    input.expectedGeneration,
  );

  const outcome = await callRpc<string>(
    input.client,
    "clear_integration_credentials",
    {
      p_organization_id: input.scope.organizationId,
      p_integration_id: input.scope.integrationId,
      p_provider: input.scope.provider,
      p_expected_generation: expectedGeneration,
    },
  );

  if (
    outcome !== "cleared"
    && outcome !== "fenced"
    && outcome !== "not_found"
  ) {
    throw new CredentialPersistenceError("unexpected_outcome");
  }

  return outcome;
}

function parseRefreshLockOwnerId(value: unknown): string {
  if (typeof value !== "string") {
    throw new CredentialPersistenceError("invalid_owner_id");
  }
  const ownerId = value.trim();
  if (
    ownerId.length === 0
    || value !== ownerId
    || !REFRESH_LOCK_OWNER_ID_RE.test(ownerId)
  ) {
    throw new CredentialPersistenceError("invalid_owner_id");
  }
  return ownerId;
}

function parseLeaseSeconds(value: unknown): number {
  if (
    typeof value !== "number"
    || !Number.isInteger(value)
    || value < REFRESH_LOCK_LEASE_SECONDS_MIN
    || value > REFRESH_LOCK_LEASE_SECONDS_MAX
  ) {
    throw new CredentialPersistenceError("invalid_lease_seconds");
  }
  return value;
}

function parseClaimToken(value: unknown): string {
  if (typeof value !== "string") {
    throw new CredentialPersistenceError("malformed_rpc_response");
  }
  const token = value.trim();
  if (token.length === 0 || value !== token) {
    throw new CredentialPersistenceError("malformed_rpc_response");
  }
  return token;
}

function assertDeniedAcquireHasNoSecrets(row: AcquireRpcRow): void {
  if (
    row.refresh_lock_token != null
    || row.refresh_lock_expires_at != null
    || row.credential_generation != null
    || row.id != null
    || row.access_ciphertext != null
    || row.access_nonce != null
    || row.access_auth_tag != null
    || row.refresh_ciphertext != null
    || row.refresh_nonce != null
    || row.refresh_auth_tag != null
    || row.dek_wrapped != null
    || row.dek_wrap_nonce != null
    || row.dek_wrap_auth_tag != null
    || row.key_version != null
  ) {
    throw new CredentialPersistenceError("malformed_rpc_response");
  }
}

function parseAcquireRow(
  row: AcquireRpcRow | undefined,
  scope: TrustedCredentialScope,
): AcquireRefreshLockResult {
  if (!row || typeof row.acquired !== "boolean") {
    throw new CredentialPersistenceError("malformed_rpc_response");
  }

  if (!row.acquired) {
    assertDeniedAcquireHasNoSecrets(row);
    return { acquired: false };
  }

  if (
    row.refresh_lock_token == null
    || row.refresh_lock_expires_at == null
    || row.credential_generation == null
    || row.id == null
    || row.organization_id == null
    || row.integration_id == null
    || row.provider == null
    || row.token_kind == null
    || row.access_ciphertext == null
    || row.access_nonce == null
    || row.access_auth_tag == null
    || row.dek_wrapped == null
    || row.dek_wrap_nonce == null
    || row.dek_wrap_auth_tag == null
    || row.key_version == null
    || row.created_at == null
    || row.updated_at == null
  ) {
    throw new CredentialPersistenceError("malformed_rpc_response");
  }

  const refreshLockToken = parseClaimToken(row.refresh_lock_token);
  if (
    typeof row.refresh_lock_expires_at !== "string"
    || row.refresh_lock_expires_at.trim().length === 0
  ) {
    throw new CredentialPersistenceError("malformed_rpc_response");
  }

  const loadRow: LoadRpcRow = {
    id: row.id,
    organization_id: row.organization_id,
    integration_id: row.integration_id,
    provider: row.provider,
    token_kind: row.token_kind,
    access_ciphertext: row.access_ciphertext,
    access_nonce: row.access_nonce,
    access_auth_tag: row.access_auth_tag,
    refresh_ciphertext: row.refresh_ciphertext,
    refresh_nonce: row.refresh_nonce,
    refresh_auth_tag: row.refresh_auth_tag,
    dek_wrapped: row.dek_wrapped,
    dek_wrap_nonce: row.dek_wrap_nonce,
    dek_wrap_auth_tag: row.dek_wrap_auth_tag,
    key_version: row.key_version,
    access_expires_at: row.access_expires_at,
    refresh_expires_at: row.refresh_expires_at,
    scope: row.scope,
    credential_generation: row.credential_generation,
    last_rotated_at: row.last_rotated_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  const record = mapLoadRow(loadRow);

  if (
    record.organizationId !== scope.organizationId
    || record.integrationId !== scope.integrationId
    || record.provider !== scope.provider
  ) {
    throw new CredentialPersistenceError("scope_mismatch");
  }

  return {
    acquired: true,
    refreshLockToken,
    refreshLockExpiresAt: row.refresh_lock_expires_at,
    record,
  };
}

function parseRotateUnderLeaseOutcome(
  row: ReplaceRpcRow | undefined,
): RotateUnderLeaseResult {
  if (!row || typeof row.outcome !== "string") {
    throw new CredentialPersistenceError("malformed_rpc_response");
  }

  if (
    row.outcome !== "rotated"
    && row.outcome !== "fenced"
    && row.outcome !== "not_found"
  ) {
    throw new CredentialPersistenceError("unexpected_outcome");
  }

  let credentialGeneration: number | null = null;
  if (row.credential_generation != null) {
    try {
      credentialGeneration = parsePositiveSafeGeneration(
        row.credential_generation,
      );
    } catch (error) {
      if (isCredentialPersistenceError(error)) {
        throw new CredentialPersistenceError("malformed_rpc_response");
      }
      throw error;
    }
  }

  return {
    credentialId: row.credential_id,
    credentialGeneration,
    outcome: row.outcome,
  };
}

/**
 * Acquire single-flight refresh lease. Denied callers receive no secrets.
 */
export async function acquireIntegrationCredentialRefreshLock(input: {
  scope: TrustedCredentialScope;
  ownerId: string;
  leaseSeconds?: number;
  client: IntegrationCredentialRpcClient;
}): Promise<AcquireRefreshLockResult> {
  assertTrustedCredentialScope(
    input.scope,
    "integration_credentials.acquire_refresh_lock",
  );

  const ownerId = parseRefreshLockOwnerId(input.ownerId);
  const leaseSeconds = parseLeaseSeconds(
    input.leaseSeconds ?? REFRESH_LOCK_LEASE_SECONDS_DEFAULT,
  );

  const rows = await callRpc<AcquireRpcRow[] | AcquireRpcRow>(
    input.client,
    "acquire_integration_credential_refresh_lock",
    {
      p_organization_id: input.scope.organizationId,
      p_integration_id: input.scope.integrationId,
      p_provider: input.scope.provider,
      p_owner_id: ownerId,
      p_lease_seconds: leaseSeconds,
    },
  );

  const row = Array.isArray(rows) ? rows[0] : rows;
  return parseAcquireRow(row, input.scope);
}

/**
 * Acquire + decrypt. On CredentialCryptoError, releases own lease and
 * rethrows crypto error — never clears vault ciphertext.
 */
export async function acquireAndDecryptIntegrationCredentialRefreshLock(input: {
  scope: TrustedCredentialScope;
  ownerId: string;
  leaseSeconds?: number;
  kekResolver: KekResolver;
  client: IntegrationCredentialRpcClient;
}): Promise<
  | AcquireRefreshLockDenied
  | (AcquireRefreshLockGranted & {
      plaintext: DecryptedCredentialSet;
    })
> {
  const acquired = await acquireIntegrationCredentialRefreshLock({
    scope: input.scope,
    ownerId: input.ownerId,
    leaseSeconds: input.leaseSeconds,
    client: input.client,
  });

  if (!acquired.acquired) {
    return acquired;
  }

  try {
    const plaintext = decryptCredentialSet(
      acquired.record.envelope,
      input.kekResolver,
    );
    return { ...acquired, plaintext };
  } catch (error) {
    if (isCredentialCryptoError(error)) {
      try {
        await releaseIntegrationCredentialRefreshLock({
          scope: input.scope,
          ownerId: input.ownerId,
          claimToken: acquired.refreshLockToken,
          client: input.client,
        });
      } catch {
        // Release best-effort; preserve original crypto failure.
      }
      throw error;
    }
    throw error;
  }
}

/**
 * Atomic rotate under a live refresh lease (owner + claim token + generation).
 */
export async function rotateIntegrationCredentialsUnderLease(input: {
  scope: TrustedCredentialScope;
  plaintext: PlaintextCredentialSet;
  ownerId: string;
  claimToken: string;
  expectedGeneration: number;
  kekResolver: KekResolver;
  accessExpiresAt?: string | null;
  refreshExpiresAt?: string | null;
  scopeGranted?: string | null;
  client: IntegrationCredentialRpcClient;
}): Promise<RotateUnderLeaseResult> {
  assertTrustedCredentialScope(
    input.scope,
    "integration_credentials.rotate_under_lease",
  );
  assertScopeMatchesPlaintext(input.scope, input.plaintext);

  const ownerId = parseRefreshLockOwnerId(input.ownerId);
  const claimToken = parseClaimToken(input.claimToken);
  const expectedGeneration = parsePositiveSafeGeneration(
    input.expectedGeneration,
  );

  const args = {
    ...sealedArgsFromPlaintext(input.plaintext, input.kekResolver, {
      accessExpiresAt: input.accessExpiresAt ?? null,
      refreshExpiresAt: input.refreshExpiresAt ?? null,
      scope: input.scopeGranted ?? null,
    }),
    p_owner_id: ownerId,
    p_claim_token: claimToken,
    p_expected_generation: expectedGeneration,
  };

  const rows = await callRpc<ReplaceRpcRow[] | ReplaceRpcRow>(
    input.client,
    "rotate_integration_credential_set",
    args,
  );

  const row = Array.isArray(rows) ? rows[0] : rows;
  return parseRotateUnderLeaseOutcome(row);
}

/**
 * Release own refresh lease when owner+token still match.
 */
export async function releaseIntegrationCredentialRefreshLock(input: {
  scope: TrustedCredentialScope;
  ownerId: string;
  claimToken: string;
  client: IntegrationCredentialRpcClient;
}): Promise<CredentialReleaseOutcome> {
  assertTrustedCredentialScope(
    input.scope,
    "integration_credentials.release_refresh_lock",
  );

  const ownerId = parseRefreshLockOwnerId(input.ownerId);
  const claimToken = parseClaimToken(input.claimToken);

  const outcome = await callRpc<string>(
    input.client,
    "release_integration_credential_refresh_lock",
    {
      p_organization_id: input.scope.organizationId,
      p_integration_id: input.scope.integrationId,
      p_provider: input.scope.provider,
      p_owner_id: ownerId,
      p_claim_token: claimToken,
    },
  );

  if (
    outcome !== "released"
    && outcome !== "fenced"
    && outcome !== "not_found"
  ) {
    throw new CredentialPersistenceError("unexpected_outcome");
  }

  return outcome;
}

type DisconnectRpcRow = {
  outcome: string;
  integration_status: string | null;
  credential_generation: number | string | bigint | null;
  vault_present: boolean;
  refresh_lock_expires_at: string | null;
  external_account_released: boolean;
};

const DISCONNECT_REASON_TO_STATUS: Record<
  CredentialDisconnectReasonClass,
  CredentialDisconnectTerminalStatus
> = {
  merchant_disconnect: "disconnected",
  uninstall: "revoked",
  hard_auth_failure: "revoked",
};

function parseDisconnectReasonClass(
  value: unknown,
): CredentialDisconnectReasonClass {
  if (
    value !== "merchant_disconnect"
    && value !== "uninstall"
    && value !== "hard_auth_failure"
  ) {
    throw new CredentialPersistenceError("invalid_scope");
  }
  return value;
}

function parseOptionalGenerationOrNull(
  value: number | null | undefined,
): number | null {
  if (value == null) {
    return null;
  }
  return parsePositiveSafeGeneration(value);
}

function parseDisconnectRow(
  row: DisconnectRpcRow | undefined,
): DisconnectOrRevokeResult {
  if (!row || typeof row.outcome !== "string") {
    throw new CredentialPersistenceError("malformed_rpc_response");
  }

  if (
    row.outcome !== "completed"
    && row.outcome !== "lease_held"
    && row.outcome !== "already_terminal"
    && row.outcome !== "conflict"
    && row.outcome !== "not_found"
  ) {
    throw new CredentialPersistenceError("unexpected_outcome");
  }

  if (typeof row.vault_present !== "boolean") {
    throw new CredentialPersistenceError("malformed_rpc_response");
  }
  if (typeof row.external_account_released !== "boolean") {
    throw new CredentialPersistenceError("malformed_rpc_response");
  }

  let credentialGeneration: number | null = null;
  if (row.credential_generation != null) {
    try {
      credentialGeneration = parsePositiveSafeGeneration(
        row.credential_generation,
      );
    } catch (error) {
      if (isCredentialPersistenceError(error)) {
        throw new CredentialPersistenceError("malformed_rpc_response");
      }
      throw error;
    }
  }

  if (
    row.integration_status != null
    && typeof row.integration_status !== "string"
  ) {
    throw new CredentialPersistenceError("malformed_rpc_response");
  }

  if (
    row.refresh_lock_expires_at != null
    && typeof row.refresh_lock_expires_at !== "string"
  ) {
    throw new CredentialPersistenceError("malformed_rpc_response");
  }

  // Never map lease_held (or conflict/not_found) to credentials-cleared success.
  const credentialsDestroyed =
    row.outcome === "completed" || row.outcome === "already_terminal";

  return {
    outcome: row.outcome,
    integrationStatus: row.integration_status,
    credentialGeneration,
    vaultPresent: row.vault_present,
    refreshLockExpiresAt: row.refresh_lock_expires_at,
    externalAccountReleased: row.external_account_released,
    credentialsDestroyed,
  };
}

/**
 * CONN-1d-C disconnect/revoke. Requires branded TrustedCredentialScope.
 * lease_held means terminal status committed with vault retained — not cleared.
 * Production binding remains NOT_YET_VERIFIED.
 */
export async function disconnectOrRevokeIntegrationCredentials(input: {
  scope: TrustedCredentialScope;
  reasonClass: CredentialDisconnectReasonClass;
  terminalStatus: CredentialDisconnectTerminalStatus;
  expectedGeneration: number | null;
  client: IntegrationCredentialRpcClient;
}): Promise<DisconnectOrRevokeResult> {
  assertTrustedCredentialScope(
    input.scope,
    "integration_credentials.disconnect_or_revoke",
  );

  const reasonClass = parseDisconnectReasonClass(input.reasonClass);
  const mapped = DISCONNECT_REASON_TO_STATUS[reasonClass];
  if (input.terminalStatus !== mapped) {
    throw new CredentialPersistenceError("invalid_scope");
  }

  const expectedGeneration = parseOptionalGenerationOrNull(
    input.expectedGeneration,
  );

  const rows = await callRpc<DisconnectRpcRow[] | DisconnectRpcRow>(
    input.client,
    "disconnect_or_revoke_integration_credentials",
    {
      p_organization_id: input.scope.organizationId,
      p_integration_id: input.scope.integrationId,
      p_provider: input.scope.provider,
      p_expected_generation: expectedGeneration,
      p_terminal_status: input.terminalStatus,
      p_reason_class: reasonClass,
    },
  );

  const row = Array.isArray(rows) ? rows[0] : rows;
  return parseDisconnectRow(row);
}

export type { CredentialCryptoError };
