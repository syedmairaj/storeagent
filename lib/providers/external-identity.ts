import type {
  CompositeExternalIdentityPart,
  NormalizedExternalIdentity,
} from "./types";

export function normalizeExternalId(
  value: string,
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(
      "External ID must not be empty.",
    );
  }

  return normalized;
}

export function normalizeOptionalExternalId(
  value: string | null,
): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim();

  return normalized
    ? normalized
    : null;
}

export function normalizeExternalIdentity(
  externalId: string,
  externalParentId: string | null,
): NormalizedExternalIdentity {
  return {
    externalId:
      normalizeExternalId(externalId),

    externalParentId:
      normalizeOptionalExternalId(
        externalParentId,
      ),
  };
}

/**
 * Deterministic composite identity.
 *
 * Component names and values are preserved after trimming.
 * No lowercasing or provider-specific coercion occurs here.
 */
export function buildCompositeExternalId(
  parts: readonly CompositeExternalIdentityPart[],
): string {
  if (parts.length === 0) {
    throw new Error(
      "Composite external ID requires at least one part.",
    );
  }

  return parts
    .map((part) => {
      const name =
        part.name.trim();

      const value =
        part.value.trim();

      if (!name) {
        throw new Error(
          "Composite external ID part name must not be empty.",
        );
      }

      if (!value) {
        throw new Error(
          `Composite external ID part "${name}" must not be empty.`,
        );
      }

      return `${name}=${value}`;
    })
    .join("|");
}
