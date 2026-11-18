/**
 * Deterministic duplicate/replay classification for Shopify-RO.1.
 *
 * Equivalent to CSV duplicate analysis: same identity + same fingerprint
 * is redundant (no double-count); conflicting fingerprints quarantine.
 */

export type ShopifyDuplicateDecision =
  | {
      disposition: "unique";
      index: number;
    }
  | {
      disposition: "representative";
      index: number;
    }
  | {
      disposition: "redundant";
      index: number;
      representativeIndex: number;
    }
  | {
      disposition: "conflict";
      index: number;
    };

export interface ShopifyDuplicateCandidate<TPayload> {
  index: number;
  identity: string;
  payload: TPayload;
}

function requireIndex(index: number): number {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new Error(
      "Shopify duplicate analysis index must be a non-negative safe integer.",
    );
  }

  return index;
}

function requireIdentity(identity: string): string {
  if (!identity.trim()) {
    throw new Error(
      "Shopify duplicate analysis identity must not be blank.",
    );
  }

  return identity;
}

function stableValue(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableValue).join(",")}]`;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();

    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableValue(record[key])}`)
      .join(",")}}`;
  }

  throw new Error(
    `Shopify duplicate analysis cannot fingerprint value of type "${typeof value}".`,
  );
}

export function stableShopifyDuplicateFingerprint(
  value: unknown,
): string {
  return stableValue(value);
}

export function analyzeShopifyDuplicates<TPayload>(
  candidates: readonly ShopifyDuplicateCandidate<TPayload>[],
): ReadonlyMap<number, ShopifyDuplicateDecision> {
  const indexes = new Set<number>();

  const groups = new Map<
    string,
    {
      index: number;
      fingerprint: string;
    }[]
  >();

  for (const candidate of candidates) {
    const index = requireIndex(candidate.index);

    if (indexes.has(index)) {
      throw new Error(
        `Shopify duplicate analysis received index ${index} more than once.`,
      );
    }

    indexes.add(index);

    const identity = requireIdentity(candidate.identity);
    const fingerprint = stableShopifyDuplicateFingerprint(
      candidate.payload,
    );

    const group = groups.get(identity) ?? [];

    group.push({
      index,
      fingerprint,
    });

    groups.set(identity, group);
  }

  const decisions = new Map<number, ShopifyDuplicateDecision>();

  for (const group of groups.values()) {
    if (group.length === 1) {
      const [entry] = group;

      decisions.set(entry.index, {
        disposition: "unique",
        index: entry.index,
      });

      continue;
    }

    const fingerprints = new Set(
      group.map((entry) => entry.fingerprint),
    );

    if (fingerprints.size > 1) {
      for (const entry of group) {
        decisions.set(entry.index, {
          disposition: "conflict",
          index: entry.index,
        });
      }

      continue;
    }

    const representativeIndex = Math.min(
      ...group.map((entry) => entry.index),
    );

    for (const entry of group) {
      if (entry.index === representativeIndex) {
        decisions.set(entry.index, {
          disposition: "representative",
          index: entry.index,
        });

        continue;
      }

      decisions.set(entry.index, {
        disposition: "redundant",
        index: entry.index,
        representativeIndex,
      });
    }
  }

  return decisions;
}

export function shopifyResourceDuplicateIdentity(input: {
  resourceType: string;
  externalId: string;
}): string {
  return stableShopifyDuplicateFingerprint([
    "resource",
    input.resourceType,
    input.externalId,
  ]);
}

export function shopifyInventoryDuplicateIdentity(input: {
  variantExternalId: string;
  locationExternalId: string;
  inventoryItemExternalId: string;
  observedAt: string;
}): string {
  return stableShopifyDuplicateFingerprint([
    "inventory_snapshot",
    input.variantExternalId,
    input.locationExternalId,
    input.inventoryItemExternalId,
    input.observedAt,
  ]);
}
