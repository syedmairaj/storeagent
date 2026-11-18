/**
 * Fail-closed resolution of the merchant Activate demand metrics scope.
 * Never picks an arbitrary first prioritized row when multiple places exist.
 */

export type ActivationPlace = {
  storeId: string;
  locationId: string;
  storeName?: string;
  locationName?: string;
};

export type ActivationScopeResolution =
  | {
      status: "resolved";
      scope: ActivationPlace;
      reason: "unique_inventory_place" | "unique_organization_place";
    }
  | {
      status: "ambiguous";
      places: readonly ActivationPlace[];
      message: string;
    }
  | {
      status: "missing";
      message: string;
    };

function placeKey(place: ActivationPlace): string {
  return `${place.storeId}:${place.locationId}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function dedupePlaces(
  places: readonly ActivationPlace[],
): ActivationPlace[] {
  const byKey = new Map<string, ActivationPlace>();
  for (const place of places) {
    if (!isUuid(place.storeId) || !isUuid(place.locationId)) {
      continue;
    }
    const key = placeKey(place);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        storeId: place.storeId,
        locationId: place.locationId,
        storeName: place.storeName,
        locationName: place.locationName,
      });
      continue;
    }
    byKey.set(key, {
      ...existing,
      storeName: existing.storeName ?? place.storeName,
      locationName: existing.locationName ?? place.locationName,
    });
  }
  return [...byKey.values()];
}

/**
 * Resolve an explicit store/location for activation.
 *
 * - Exactly one inventory place → resolved
 * - Multiple inventory places → ambiguous (fail closed)
 * - No inventory places → exactly one org place may bootstrap; else missing
 */
export function resolveMerchantActivationScope(input: {
  inventoryPlaces: readonly ActivationPlace[];
  organizationPlaces?: readonly ActivationPlace[];
}): ActivationScopeResolution {
  const inventoryPlaces = dedupePlaces(input.inventoryPlaces);

  if (inventoryPlaces.length === 1) {
    return {
      status: "resolved",
      scope: inventoryPlaces[0]!,
      reason: "unique_inventory_place",
    };
  }

  if (inventoryPlaces.length > 1) {
    return {
      status: "ambiguous",
      places: inventoryPlaces,
      message:
        "Multiple stores or locations have inventory. Choose one store and location in Import inventory / Import sales before activating demand metrics — StoreAgent will not guess which place to authorize.",
    };
  }

  const organizationPlaces = dedupePlaces(input.organizationPlaces ?? []);
  if (organizationPlaces.length === 1) {
    return {
      status: "resolved",
      scope: organizationPlaces[0]!,
      reason: "unique_organization_place",
    };
  }

  if (organizationPlaces.length > 1) {
    return {
      status: "ambiguous",
      places: organizationPlaces,
      message:
        "Multiple stores or locations exist in this organization. Select an explicit store and location before activating demand metrics.",
    };
  }

  return {
    status: "missing",
    message:
      "No authorized store and location is available for demand metrics activation.",
  };
}

/**
 * True only when the candidate place is present in the authorized place set.
 * Unauthorized / unknown locations fail closed.
 */
export function isAuthorizedActivationPlace(input: {
  candidate: ActivationPlace | null | undefined;
  authorizedPlaces: readonly ActivationPlace[];
}): boolean {
  if (!input.candidate) {
    return false;
  }
  if (
    !isUuid(input.candidate.storeId) ||
    !isUuid(input.candidate.locationId)
  ) {
    return false;
  }
  const key = placeKey(input.candidate);
  return dedupePlaces(input.authorizedPlaces).some(
    (place) => placeKey(place) === key,
  );
}
