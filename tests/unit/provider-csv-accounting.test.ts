import {
  describe,
  expect,
  it,
} from "vitest";

import {
  assertCsvImportAccountingComplete,
  assertSyncRunCountsValid,
  createCsvImportAccountingState,
  csvImportHasPendingRows,
  discoverCsvRow,
  emptySyncRunCounts,
  finalizeCsvRow,
} from "@/lib/providers/csv/accounting";

describe(
  "CSV partial-failure accounting",
  () => {
    it(
      "starts with canonical zero counts",
      () => {
        expect(
          emptySyncRunCounts(),
        ).toEqual({
          discovered: 0,
          imported: 0,
          updated: 0,
          skipped: 0,
          quarantined: 0,
          failed: 0,
        });
      },
    );

    it(
      "increments discovered independently from terminal outcome",
      () => {
        const state =
          discoverCsvRow(
            createCsvImportAccountingState(),
            2,
          );

        expect(
          state.counts,
        ).toEqual({
          discovered: 1,
          imported: 0,
          updated: 0,
          skipped: 0,
          quarantined: 0,
          failed: 0,
        });

        expect(
          csvImportHasPendingRows(
            state,
          ),
        ).toBe(true);
      },
    );

    it.each([
      "imported",
      "updated",
      "skipped",
      "quarantined",
      "failed",
    ] as const)(
      "records exactly one %s terminal outcome",
      (
        disposition,
      ) => {
        let state =
          createCsvImportAccountingState();

        state =
          discoverCsvRow(
            state,
            2,
          );

        state =
          finalizeCsvRow(
            state,
            2,
            disposition,
          );

        expect(
          state.counts.discovered,
        ).toBe(1);

        expect(
          state.counts[
            disposition
          ],
        ).toBe(1);

        assertCsvImportAccountingComplete(
          state,
        );
      },
    );

    it(
      "rejects terminal accounting before discovery",
      () => {
        expect(() =>
          finalizeCsvRow(
            createCsvImportAccountingState(),
            2,
            "imported",
          ),
        ).toThrow(
          "CSV row 2 must be discovered before terminal accounting.",
        );
      },
    );

    it(
      "rejects duplicate discovery of same row",
      () => {
        const state =
          discoverCsvRow(
            createCsvImportAccountingState(),
            2,
          );

        expect(() =>
          discoverCsvRow(
            state,
            2,
          ),
        ).toThrow(
          "CSV row 2 has already been discovered.",
        );
      },
    );

    it(
      "rejects double terminal accounting of same row",
      () => {
        let state =
          createCsvImportAccountingState();

        state =
          discoverCsvRow(
            state,
            2,
          );

        state =
          finalizeCsvRow(
            state,
            2,
            "quarantined",
          );

        expect(() =>
          finalizeCsvRow(
            state,
            2,
            "failed",
          ),
        ).toThrow(
          "CSV row 2 already has a terminal disposition.",
        );
      },
    );

    it(
      "allows quarantined row while later independent row succeeds",
      () => {
        let state =
          createCsvImportAccountingState();

        state =
          discoverCsvRow(
            state,
            2,
          );

        state =
          finalizeCsvRow(
            state,
            2,
            "quarantined",
          );

        state =
          discoverCsvRow(
            state,
            3,
          );

        state =
          finalizeCsvRow(
            state,
            3,
            "imported",
          );

        expect(
          state.counts,
        ).toEqual({
          discovered: 2,
          imported: 1,
          updated: 0,
          skipped: 0,
          quarantined: 1,
          failed: 0,
        });

        assertCsvImportAccountingComplete(
          state,
        );
      },
    );

    it(
      "rejects completion while a discovered row has no terminal outcome",
      () => {
        const state =
          discoverCsvRow(
            createCsvImportAccountingState(),
            2,
          );

        expect(() =>
          assertCsvImportAccountingComplete(
            state,
          ),
        ).toThrow(
          "Every discovered CSV row must have exactly one terminal disposition.",
        );
      },
    );

    it(
      "rejects terminal totals greater than discovered",
      () => {
        expect(() =>
          assertSyncRunCountsValid({
            discovered: 1,
            imported: 1,
            updated: 0,
            skipped: 0,
            quarantined: 1,
            failed: 0,
          }),
        ).toThrow(
          "SyncRun terminal row count must not exceed discovered count.",
        );
      },
    );

    it(
      "rejects negative counts",
      () => {
        expect(() =>
          assertSyncRunCountsValid({
            discovered: 1,
            imported: -1,
            updated: 0,
            skipped: 0,
            quarantined: 0,
            failed: 0,
          }),
        ).toThrow();
      },
    );

    it(
      "rejects unsafe integer counts",
      () => {
        expect(() =>
          assertSyncRunCountsValid({
            discovered:
              Number.MAX_SAFE_INTEGER +
              1,
            imported: 0,
            updated: 0,
            skipped: 0,
            quarantined: 0,
            failed: 0,
          }),
        ).toThrow();
      },
    );

    it(
      "uses row number for transient accounting only",
      () => {
        let state =
          createCsvImportAccountingState();

        state =
          discoverCsvRow(
            state,
            99,
          );

        state =
          finalizeCsvRow(
            state,
            99,
            "skipped",
          );

        expect(
          state.terminalRows.get(
            99,
          ),
        ).toBe(
          "skipped",
        );
      },
    );
  },
);
