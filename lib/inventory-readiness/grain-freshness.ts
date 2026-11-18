/**
 * Store/location grain freshness for imported inventory observations.
 * Pure helper — does not invent demand or change velocity math.
 */

export type GrainObservation = {
  storeId: string;
  locationId: string;
  storeName?: string;
  locationName?: string;
  availableQuantity: number | null;
  /** Store-local YYYY-MM-DD of the observation, when known. */
  observedLocalDate: string | null;
  /** Store-local as-of YYYY-MM-DD for the store. */
  asOfMetricDate: string | null;
};

export type GrainPlaceFreshness = {
  storeId: string;
  locationId: string;
  storeName?: string;
  locationName?: string;
  status: "current" | "stale" | "unknown";
};

export type GrainFreshnessSummary = {
  kind: "empty" | "all_current" | "all_stale" | "mixed" | "unknown";
  places: readonly GrainPlaceFreshness[];
  currentPlaceCount: number;
  stalePlaceCount: number;
  unknownPlaceCount: number;
  /** True only when every known-available place is current on as-of. */
  allKnownPlacesCurrent: boolean;
};

function placeKey(storeId: string, locationId: string): string {
  return `${storeId}:${locationId}`;
}

/**
 * Aggregate latest known-available inventory places to current vs stale vs unknown.
 * Mixed fresh/stale locations fail closed for "current-day stock" guidance.
 */
export function summarizeGrainInventoryFreshness(
  observations: readonly GrainObservation[],
): GrainFreshnessSummary {
  const byPlace = new Map<
    string,
    {
      storeId: string;
      locationId: string;
      storeName?: string;
      locationName?: string;
      statuses: Set<"current" | "stale" | "unknown">;
    }
  >();

  for (const row of observations) {
    if (row.availableQuantity === null) {
      continue;
    }
    const key = placeKey(row.storeId, row.locationId);
    const existing = byPlace.get(key) ?? {
      storeId: row.storeId,
      locationId: row.locationId,
      storeName: row.storeName,
      locationName: row.locationName,
      statuses: new Set<"current" | "stale" | "unknown">(),
    };
    existing.storeName = existing.storeName ?? row.storeName;
    existing.locationName = existing.locationName ?? row.locationName;

    if (!row.asOfMetricDate || !row.observedLocalDate) {
      existing.statuses.add("unknown");
    } else if (row.observedLocalDate === row.asOfMetricDate) {
      existing.statuses.add("current");
    } else {
      existing.statuses.add("stale");
    }
    byPlace.set(key, existing);
  }

  const places: GrainPlaceFreshness[] = [];
  for (const entry of byPlace.values()) {
    let status: GrainPlaceFreshness["status"] = "unknown";
    if (entry.statuses.has("stale") || entry.statuses.has("unknown")) {
      // Any non-current SKU at the place fails the place closed.
      status = entry.statuses.has("stale") ? "stale" : "unknown";
    } else if (entry.statuses.has("current")) {
      status = "current";
    }
    places.push({
      storeId: entry.storeId,
      locationId: entry.locationId,
      storeName: entry.storeName,
      locationName: entry.locationName,
      status,
    });
  }

  const currentPlaceCount = places.filter((p) => p.status === "current").length;
  const stalePlaceCount = places.filter((p) => p.status === "stale").length;
  const unknownPlaceCount = places.filter((p) => p.status === "unknown").length;

  if (places.length === 0) {
    return {
      kind: "empty",
      places,
      currentPlaceCount: 0,
      stalePlaceCount: 0,
      unknownPlaceCount: 0,
      allKnownPlacesCurrent: false,
    };
  }

  if (stalePlaceCount === 0 && unknownPlaceCount === 0) {
    return {
      kind: "all_current",
      places,
      currentPlaceCount,
      stalePlaceCount,
      unknownPlaceCount,
      allKnownPlacesCurrent: true,
    };
  }

  if (currentPlaceCount === 0 && unknownPlaceCount === 0) {
    return {
      kind: "all_stale",
      places,
      currentPlaceCount,
      stalePlaceCount,
      unknownPlaceCount,
      allKnownPlacesCurrent: false,
    };
  }

  if (currentPlaceCount > 0 && (stalePlaceCount > 0 || unknownPlaceCount > 0)) {
    return {
      kind: "mixed",
      places,
      currentPlaceCount,
      stalePlaceCount,
      unknownPlaceCount,
      allKnownPlacesCurrent: false,
    };
  }

  return {
    kind: "unknown",
    places,
    currentPlaceCount,
    stalePlaceCount,
    unknownPlaceCount,
    allKnownPlacesCurrent: false,
  };
}
