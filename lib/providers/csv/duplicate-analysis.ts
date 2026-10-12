export type CsvDuplicateDecision =
  | {
      disposition: "unique";
      rowNumber: number;
    }
  | {
      disposition: "representative";
      rowNumber: number;
    }
  | {
      disposition: "redundant";
      rowNumber: number;
      representativeRowNumber: number;
    }
  | {
      disposition: "conflict";
      rowNumber: number;
    };

export interface CsvDuplicateCandidate<TPayload> {
  rowNumber: number;
  identity: string;
  payload: TPayload;
}

function requireRowNumber(rowNumber: number): number {
  if (!Number.isSafeInteger(rowNumber) || rowNumber <= 0) {
    throw new Error(
      "CSV duplicate analysis row number must be a positive safe integer.",
    );
  }

  return rowNumber;
}

function requireIdentity(identity: string): string {
  if (!identity.trim()) {
    throw new Error("CSV duplicate analysis identity must not be blank.");
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
    `CSV duplicate analysis cannot fingerprint value of type "${typeof value}".`,
  );
}

export function stableCsvDuplicateFingerprint(value: unknown): string {
  return stableValue(value);
}

export function analyzeCsvDuplicates<TPayload>(
  candidates: readonly CsvDuplicateCandidate<TPayload>[],
): ReadonlyMap<number, CsvDuplicateDecision> {
  const rowNumbers = new Set<number>();

  const groups = new Map<
    string,
    {
      rowNumber: number;
      fingerprint: string;
    }[]
  >();

  for (const candidate of candidates) {
    const rowNumber = requireRowNumber(candidate.rowNumber);

    if (rowNumbers.has(rowNumber)) {
      throw new Error(
        `CSV duplicate analysis received row ${rowNumber} more than once.`,
      );
    }

    rowNumbers.add(rowNumber);

    const identity = requireIdentity(candidate.identity);
    const fingerprint = stableCsvDuplicateFingerprint(candidate.payload);

    const group = groups.get(identity) ?? [];

    group.push({
      rowNumber,
      fingerprint,
    });

    groups.set(identity, group);
  }

  const decisions = new Map<number, CsvDuplicateDecision>();

  for (const group of groups.values()) {
    if (group.length === 1) {
      const [entry] = group;

      decisions.set(entry.rowNumber, {
        disposition: "unique",
        rowNumber: entry.rowNumber,
      });

      continue;
    }

    const fingerprints = new Set(group.map((entry) => entry.fingerprint));

    if (fingerprints.size > 1) {
      for (const entry of group) {
        decisions.set(entry.rowNumber, {
          disposition: "conflict",
          rowNumber: entry.rowNumber,
        });
      }

      continue;
    }

    const representativeRowNumber = Math.min(
      ...group.map((entry) => entry.rowNumber),
    );

    for (const entry of group) {
      if (entry.rowNumber === representativeRowNumber) {
        decisions.set(entry.rowNumber, {
          disposition: "representative",
          rowNumber: entry.rowNumber,
        });

        continue;
      }

      decisions.set(entry.rowNumber, {
        disposition: "redundant",
        rowNumber: entry.rowNumber,
        representativeRowNumber,
      });
    }
  }

  return decisions;
}

export function csvResourceDuplicateIdentity(input: {
  resourceType: string;
  externalId: string;
}): string {
  return stableCsvDuplicateFingerprint([
    "resource",
    input.resourceType,
    input.externalId,
  ]);
}

export function csvInventoryDuplicateIdentity(input: {
  variantExternalId: string;
  locationExternalId: string;
  observedAt: string;
}): string {
  return stableCsvDuplicateFingerprint([
    "inventory_snapshot",
    input.variantExternalId,
    input.locationExternalId,
    input.observedAt,
  ]);
}

export function csvSupplierProductDuplicateIdentity(input: {
  supplierExternalId: string;
  variantExternalId: string;
}): string {
  return stableCsvDuplicateFingerprint([
    "supplier_product",
    input.supplierExternalId,
    input.variantExternalId,
  ]);
}
