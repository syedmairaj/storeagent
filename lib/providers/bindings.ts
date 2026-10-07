import type {
  ProviderBinding,
  ProviderResourceType,
} from "@/lib/commerce-domain/types";

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
      "integrationId" | "resourceType" | "externalId" | "canonicalEntityId"
    >
  >,
): boolean {
  const seen = new Map<string, string>();

  for (const binding of bindings) {
    const key = providerBindingKey(binding);

    const existingCanonicalId = seen.get(key);

    if (
      existingCanonicalId !== undefined &&
      existingCanonicalId !== binding.canonicalEntityId
    ) {
      return true;
    }

    seen.set(key, binding.canonicalEntityId);
  }

  return false;
}
