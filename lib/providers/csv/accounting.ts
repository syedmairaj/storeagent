import type {
  SyncRunCounts,
} from "@/lib/commerce-domain/types";

export type CsvRowTerminalDisposition =
  | "imported"
  | "updated"
  | "skipped"
  | "quarantined"
  | "failed";

export interface CsvImportAccountingState {
  counts: SyncRunCounts;

  /**
   * Import-local diagnostic row numbers only.
   *
   * These values are never provider identity and are never
   * canonical commerce identity.
   */
  discoveredRows:
    ReadonlySet<number>;

  terminalRows:
    ReadonlyMap<
      number,
      CsvRowTerminalDisposition
    >;
}

function requireRowNumber(
  rowNumber: number,
): number {
  if (
    !Number.isSafeInteger(
      rowNumber,
    ) ||
    rowNumber <= 0
  ) {
    throw new Error(
      "CSV row number must be a positive safe integer.",
    );
  }

  return rowNumber;
}

function terminalCount(
  counts: SyncRunCounts,
): number {
  return (
    counts.imported +
    counts.updated +
    counts.skipped +
    counts.quarantined +
    counts.failed
  );
}

export function emptySyncRunCounts():
  SyncRunCounts {
  return {
    discovered: 0,
    imported: 0,
    updated: 0,
    skipped: 0,
    quarantined: 0,
    failed: 0,
  };
}

export function createCsvImportAccountingState():
  CsvImportAccountingState {
  return {
    counts:
      emptySyncRunCounts(),

    discoveredRows:
      new Set<number>(),

    terminalRows:
      new Map<
        number,
        CsvRowTerminalDisposition
      >(),
  };
}

export function assertSyncRunCountsValid(
  counts: SyncRunCounts,
): void {
  for (
    const [field, value]
    of Object.entries(counts)
  ) {
    if (
      !Number.isSafeInteger(
        value,
      ) ||
      value < 0
    ) {
      throw new Error(
        `SyncRun count "${field}" must be a non-negative safe integer.`,
      );
    }
  }

  const terminal =
    terminalCount(
      counts,
    );

  if (
    terminal >
    counts.discovered
  ) {
    throw new Error(
      "SyncRun terminal row count must not exceed discovered count.",
    );
  }
}

export function discoverCsvRow(
  state:
    CsvImportAccountingState,
  rowNumber: number,
): CsvImportAccountingState {
  const row =
    requireRowNumber(
      rowNumber,
    );

  if (
    state.discoveredRows.has(
      row,
    )
  ) {
    throw new Error(
      `CSV row ${row} has already been discovered.`,
    );
  }

  if (
    state.terminalRows.has(
      row,
    )
  ) {
    throw new Error(
      `CSV row ${row} already has a terminal disposition.`,
    );
  }

  const discoveredRows =
    new Set(
      state.discoveredRows,
    );

  discoveredRows.add(
    row,
  );

  const next: CsvImportAccountingState = {
    counts: {
      ...state.counts,

      discovered:
        state.counts.discovered +
        1,
    },

    discoveredRows,

    terminalRows:
      new Map(
        state.terminalRows,
      ),
  };

  assertSyncRunCountsValid(
    next.counts,
  );

  return next;
}

export function finalizeCsvRow(
  state:
    CsvImportAccountingState,
  rowNumber: number,
  disposition:
    CsvRowTerminalDisposition,
): CsvImportAccountingState {
  const row =
    requireRowNumber(
      rowNumber,
    );

  if (
    !state.discoveredRows.has(
      row,
    )
  ) {
    throw new Error(
      `CSV row ${row} must be discovered before terminal accounting.`,
    );
  }

  if (
    state.terminalRows.has(
      row,
    )
  ) {
    throw new Error(
      `CSV row ${row} already has a terminal disposition.`,
    );
  }

  const terminalRows =
    new Map(
      state.terminalRows,
    );

  terminalRows.set(
    row,
    disposition,
  );

  const counts: SyncRunCounts = {
    ...state.counts,

    [disposition]:
      state.counts[
        disposition
      ] + 1,
  };

  assertSyncRunCountsValid(
    counts,
  );

  return {
    counts,

    discoveredRows:
      new Set(
        state.discoveredRows,
      ),

    terminalRows,
  };
}

export function csvImportHasPendingRows(
  state:
    CsvImportAccountingState,
): boolean {
  return (
    state.terminalRows.size !==
    state.discoveredRows.size
  );
}

export function assertCsvImportAccountingComplete(
  state:
    CsvImportAccountingState,
): void {
  assertSyncRunCountsValid(
    state.counts,
  );

  if (
    csvImportHasPendingRows(
      state,
    )
  ) {
    throw new Error(
      "Every discovered CSV row must have exactly one terminal disposition.",
    );
  }

  if (
    terminalCount(
      state.counts,
    ) !==
    state.counts.discovered
  ) {
    throw new Error(
      "Completed CSV accounting must reconcile discovered and terminal row counts.",
    );
  }
}
