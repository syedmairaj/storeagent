import type {
  ProviderBinding,
  ProviderResourceType,
} from "@/lib/commerce-domain/types";

import {
  normalizeExternalId,
} from "./external-identity";

import type {
  ProviderBindingIdentity,
  ProviderBindingReplayResult,
} from "./types";

// -----------------------------------------------------------------------------
// Legacy frozen provider-binding contract
// -----------------------------------------------------------------------------
//
// These helpers pre-date M0.7 and are already depended upon by tenancy,
// cross-org threat-model, and provider-binding tests.
//
// Do not remove or silently change their semantics.
// -----------------------------------------------------------------------------

export interface ProviderResourceIdentity {
  integrationId: string;
  resourceType: ProviderResourceType;
  externalId: string;
}

export function providerBindingKey(
  identity: ProviderResourceIdentity,
): string {
  return [
    identity.integrationId,
    identity.resourceType,
    identity.externalId,
  ].join(":");
}

export function bindingMatchesIdentity(
  binding: Pick<
    ProviderBinding,
    "integrationId" | "resourceType" | "externalId"
  >,
  identity: ProviderResourceIdentity,
): boolean {
  return (
    binding.integrationId === identity.integrationId &&
    binding.resourceType === identity.resourceType &&
    binding.externalId === identity.externalId
  );
}

export function hasAmbiguousBindings(
  bindings: Array<
    Pick<
      ProviderBinding,
      | "integrationId"
      | "resourceType"
      | "externalId"
      | "canonicalEntityId"
    >
  >,
): boolean {
  const seen = new Map<string, string>();

  for (const binding of bindings) {
    const key =
      providerBindingKey(binding);

    const existingCanonicalId =
      seen.get(key);

    if (
      existingCanonicalId !== undefined &&
      existingCanonicalId !==
        binding.canonicalEntityId
    ) {
      return true;
    }

    seen.set(
      key,
      binding.canonicalEntityId,
    );
  }

  return false;
}

// -----------------------------------------------------------------------------
// M0.7.8 durable binding + replay contract
// -----------------------------------------------------------------------------

function requireCanonicalScopeId(
  value: string,
  field: string,
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(
      `${field} must not be empty.`,
    );
  }

  return normalized;
}

/**
 * Normalizes the complete durable external identity namespace used
 * by the M0.7 persistence/idempotency contract.
 *
 * This is intentionally stronger than the legacy ProviderResourceIdentity.
 */
export function normalizeProviderBindingIdentity(
  identity: ProviderBindingIdentity,
): ProviderBindingIdentity {
  return {
    organizationId:
      requireCanonicalScopeId(
        identity.organizationId,
        "organizationId",
      ),

    integrationId:
      requireCanonicalScopeId(
        identity.integrationId,
        "integrationId",
      ),

    provider:
      identity.provider,

    resourceType:
      identity.resourceType,

    externalId:
      normalizeExternalId(
        identity.externalId,
      ),
  };
}

/**
 * Durable M0.7 binding identity key.
 *
 * JSON-array serialization avoids delimiter collisions while
 * preserving external-ID case.
 *
 * externalParentId is deliberately excluded.
 */
export function buildProviderBindingKey(
  identity: ProviderBindingIdentity,
): string {
  const normalized =
    normalizeProviderBindingIdentity(
      identity,
    );

  return JSON.stringify([
    normalized.organizationId,
    normalized.integrationId,
    normalized.provider,
    normalized.resourceType,
    normalized.externalId,
  ]);
}

function identityFromBinding(
  binding: ProviderBinding,
): ProviderBindingIdentity {
  return {
    organizationId:
      binding.organizationId,

    integrationId:
      binding.integrationId,

    provider:
      binding.provider,

    resourceType:
      binding.resourceType,

    externalId:
      binding.externalId,
  };
}

/**
 * Pure replay/conflict classifier.
 *
 * Persistence owns transactional enforcement.
 *
 * create:
 *   no binding exists
 *
 * idempotent:
 *   the same external identity already maps to the same canonical entity
 *
 * conflict:
 *   the same external identity already maps to a different canonical entity
 */
export function assessProviderBindingReplay(
  existing: ProviderBinding | null,
  incoming:
    ProviderBindingIdentity & {
      canonicalEntityId: string;
    },
): ProviderBindingReplayResult {
  const bindingKey =
    buildProviderBindingKey(
      incoming,
    );

  if (existing === null) {
    return {
      disposition: "create",
      bindingKey,
    };
  }

  const existingKey =
    buildProviderBindingKey(
      identityFromBinding(
        existing,
      ),
    );

  if (existingKey !== bindingKey) {
    throw new Error(
      "Existing provider binding does not match the incoming binding identity.",
    );
  }

  if (
    existing.canonicalEntityId ===
    incoming.canonicalEntityId
  ) {
    return {
      disposition: "idempotent",
      bindingKey,
    };
  }

  return {
    disposition: "conflict",
    bindingKey,
  };
}
