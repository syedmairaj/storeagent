import type {
  ProviderNormalizationAccepted,
  ProviderNormalizationResult,
} from "@/lib/providers/types";

import { discoverCsvRow, finalizeCsvRow } from "./accounting";

import type {
  CsvImportAccountingState,
  CsvRowTerminalDisposition,
} from "./accounting";

import type { CsvInventoryObservationResult } from "./inventory-normalization";

import {
  buildCsvInventoryQuarantineEnvelope,
  buildCsvQuarantineEnvelope,
  buildCsvSupplierProductQuarantineEnvelope,
} from "./quarantine";

import type { CsvQuarantineEnvelope } from "./quarantine";

import type { CsvResourceOrchestrationResult } from "./resource-orchestration";

import type { CsvSupplierProductResult } from "./supplier-normalization";

type CsvInventoryAccepted = Extract<
  CsvInventoryObservationResult,
  {
    disposition: "accepted";
  }
>;

type CsvSupplierProductAccepted = Extract<
  CsvSupplierProductResult,
  {
    disposition: "accepted";
  }
>;

export interface CsvExecutedRow {
  rowNumber: number;

  disposition: CsvRowTerminalDisposition;

  accounting: CsvImportAccountingState;

  quarantine: CsvQuarantineEnvelope | null;

  errorCode: string | null;

  canonicalEntityId: string | null;
}

function terminalResult(
  state: CsvImportAccountingState,
  rowNumber: number,
  disposition: CsvRowTerminalDisposition,
  input?: {
    quarantine?: CsvQuarantineEnvelope | null;

    errorCode?: string | null;

    canonicalEntityId?: string | null;
  },
): CsvExecutedRow {
  return {
    rowNumber,

    disposition,

    accounting: finalizeCsvRow(state, rowNumber, disposition),

    quarantine: input?.quarantine ?? null,

    errorCode: input?.errorCode ?? null,

    canonicalEntityId: input?.canonicalEntityId ?? null,
  };
}

function persistedDisposition(
  value: CsvResourceOrchestrationResult,
): value is Extract<
  CsvResourceOrchestrationResult,
  {
    disposition: "imported" | "updated" | "skipped";
  }
> {
  return (
    value.disposition === "imported" ||
    value.disposition === "updated" ||
    value.disposition === "skipped"
  );
}

async function executeAccepted(
  state: CsvImportAccountingState,
  rowNumber: number,
  orchestrate: () => Promise<CsvResourceOrchestrationResult>,
  quarantineForRelationship: (
    result: Extract<
      CsvResourceOrchestrationResult,
      {
        disposition: "quarantined";
      }
    >,
  ) => CsvQuarantineEnvelope,
): Promise<CsvExecutedRow> {
  const result = await orchestrate();

  if (persistedDisposition(result)) {
    return terminalResult(state, rowNumber, result.disposition, {
      canonicalEntityId: result.canonicalEntityId,
    });
  }

  if (result.disposition === "quarantined") {
    return terminalResult(state, rowNumber, "quarantined", {
      quarantine: quarantineForRelationship(result),
    });
  }

  return terminalResult(state, rowNumber, "failed", {
    errorCode: result.errorCode,
  });
}

export async function executeCsvResourceRow<TCanonical>(
  state: CsvImportAccountingState,
  rowNumber: number,
  result: ProviderNormalizationResult<TCanonical>,
  orchestrate: (
    accepted: ProviderNormalizationAccepted<TCanonical> & {
      provider: "csv";
    },
  ) => Promise<CsvResourceOrchestrationResult>,
): Promise<CsvExecutedRow> {
  if (result.provider !== "csv") {
    throw new Error(
      `CSV row execution received provider "${result.provider}".`,
    );
  }
  const discovered = discoverCsvRow(state, rowNumber);

  if (result.disposition === "skipped") {
    return terminalResult(discovered, rowNumber, "skipped");
  }

  if (result.disposition === "quarantined") {
    return terminalResult(discovered, rowNumber, "quarantined", {
      quarantine: buildCsvQuarantineEnvelope(rowNumber, {
        provider: result.provider,

        resourceType: result.resourceType,

        externalId: result.externalId,

        externalParentId: result.externalParentId,

        adapterVersion: result.adapterVersion,

        reasonCode: "NORMALIZATION_QUARANTINED",

        issues: result.issues,
      }),
    });
  }

  return executeAccepted(
    discovered,
    rowNumber,
    () =>
      orchestrate({
        ...result,
        provider: "csv",
      }),
    (failure) =>
      buildCsvQuarantineEnvelope(rowNumber, {
        provider: result.provider,

        resourceType: result.resourceType,

        externalId: result.externalId,

        externalParentId: result.externalParentId,

        adapterVersion: result.adapterVersion,

        reasonCode: failure.reasonCode,

        issues: failure.issues,
      }),
  );
}

export async function executeCsvInventoryRow(
  state: CsvImportAccountingState,
  rowNumber: number,
  result: CsvInventoryObservationResult,
  orchestrate: (
    accepted: CsvInventoryAccepted,
  ) => Promise<CsvResourceOrchestrationResult>,
): Promise<CsvExecutedRow> {
  const discovered = discoverCsvRow(state, rowNumber);

  if (result.disposition === "quarantined") {
    return terminalResult(discovered, rowNumber, "quarantined", {
      quarantine: buildCsvInventoryQuarantineEnvelope({
        rowNumber,

        adapterVersion: result.adapterVersion,

        variantExternalId: result.variantExternalId,

        locationExternalId: result.locationExternalId,

        reasonCode: "NORMALIZATION_QUARANTINED",

        issues: result.issues,
      }),
    });
  }

  return executeAccepted(
    discovered,
    rowNumber,
    () => orchestrate(result),
    (failure) =>
      buildCsvInventoryQuarantineEnvelope({
        rowNumber,

        adapterVersion: result.adapterVersion,

        variantExternalId: result.variantExternalId,

        locationExternalId: result.locationExternalId,

        reasonCode: failure.reasonCode,

        issues: failure.issues,
      }),
  );
}

export async function executeCsvSupplierProductRow(
  state: CsvImportAccountingState,
  rowNumber: number,
  result: CsvSupplierProductResult,
  orchestrate: (
    accepted: CsvSupplierProductAccepted,
  ) => Promise<CsvResourceOrchestrationResult>,
): Promise<CsvExecutedRow> {
  const discovered = discoverCsvRow(state, rowNumber);

  if (result.disposition === "quarantined") {
    return terminalResult(discovered, rowNumber, "quarantined", {
      quarantine: buildCsvSupplierProductQuarantineEnvelope({
        rowNumber,

        adapterVersion: result.adapterVersion,

        supplierExternalId: result.supplierExternalId,

        variantExternalId: result.variantExternalId,

        reasonCode: "NORMALIZATION_QUARANTINED",

        issues: result.issues,
      }),
    });
  }

  return executeAccepted(
    discovered,
    rowNumber,
    () => orchestrate(result),
    (failure) =>
      buildCsvSupplierProductQuarantineEnvelope({
        rowNumber,

        adapterVersion: result.adapterVersion,

        supplierExternalId: result.supplierExternalId,

        variantExternalId: result.variantExternalId,

        reasonCode: failure.reasonCode,

        issues: failure.issues,
      }),
  );
}
