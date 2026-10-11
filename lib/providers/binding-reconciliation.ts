import type {
  JsonValue,
  ProviderBinding,
  ProviderResourceType,
  ProviderType,
} from "@/lib/commerce-domain/types";

import {
  assessProviderBindingReplay,
  normalizeProviderBindingIdentity,
} from "@/lib/providers/bindings";

import {
  normalizeOptionalExternalId,
} from "@/lib/providers/external-identity";

export interface ProviderBindingReconciliationInput {
  organizationId: string;
  integrationId: string;

  provider: ProviderType;
  resourceType: ProviderResourceType;

  externalId: string;
  externalParentId: string | null;

  canonicalEntityId: string;

  sourceMetadata: JsonValue | null;
}

export type ProviderBindingReconciliationPlan =
  | {
      disposition: "create";
      bindingKey: string;

      identity: {
        organizationId: string;
        integrationId: string;
        provider: ProviderType;
        resourceType: ProviderResourceType;
        externalId: string;
      };

      canonicalEntityId: string;

      mutableMetadata: {
        externalParentId: string | null;
        sourceMetadata: JsonValue | null;
      };
    }
  | {
      disposition: "idempotent";
      bindingKey: string;

      canonicalEntityId: string;

      metadataChanged: boolean;

      mutableMetadata: {
        externalParentId: string | null;
        sourceMetadata: JsonValue | null;
      };
    }
  | {
      disposition: "conflict";
      bindingKey: string;

      existingCanonicalEntityId: string;
      incomingCanonicalEntityId: string;
    };

function requireCanonicalEntityId(
  value: string,
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(
      "canonicalEntityId must not be empty.",
    );
  }

  return normalized;
}

function stableJson(
  value: JsonValue | null,
): string {
  return JSON.stringify(
    value,
  );
}

export function planProviderBindingReconciliation(
  existing: ProviderBinding | null,
  incoming: ProviderBindingReconciliationInput,
): ProviderBindingReconciliationPlan {
  const identity =
    normalizeProviderBindingIdentity({
      organizationId:
        incoming.organizationId,

      integrationId:
        incoming.integrationId,

      provider:
        incoming.provider,

      resourceType:
        incoming.resourceType,

      externalId:
        incoming.externalId,
    });

  const canonicalEntityId =
    requireCanonicalEntityId(
      incoming.canonicalEntityId,
    );

  const externalParentId =
    normalizeOptionalExternalId(
      incoming.externalParentId,
    );

  const replay =
    assessProviderBindingReplay(
      existing,
      {
        ...identity,
        canonicalEntityId,
      },
    );

  if (
    replay.disposition ===
    "create"
  ) {
    return {
      disposition:
        "create",

      bindingKey:
        replay.bindingKey,

      identity,

      canonicalEntityId,

      mutableMetadata: {
        externalParentId,
        sourceMetadata:
          incoming.sourceMetadata,
      },
    };
  }

  if (
    replay.disposition ===
    "conflict"
  ) {
    if (existing === null) {
      throw new Error(
        "Binding conflict requires an existing provider binding.",
      );
    }

    return {
      disposition:
        "conflict",

      bindingKey:
        replay.bindingKey,

      existingCanonicalEntityId:
        existing.canonicalEntityId,

      incomingCanonicalEntityId:
        canonicalEntityId,
    };
  }

  if (existing === null) {
    throw new Error(
      "Idempotent binding replay requires an existing provider binding.",
    );
  }

  const metadataChanged =
    existing.externalParentId !==
      externalParentId ||
    stableJson(
      existing.sourceMetadata,
    ) !==
      stableJson(
        incoming.sourceMetadata,
      );

  return {
    disposition:
      "idempotent",

    bindingKey:
      replay.bindingKey,

    canonicalEntityId,

    metadataChanged,

    mutableMetadata: {
      externalParentId,
      sourceMetadata:
        incoming.sourceMetadata,
    },
  };
}
