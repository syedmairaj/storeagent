import { describe, expect, it } from "vitest";

import {
  clearedFileFields,
  clearedPreviewFields,
  fileValidationLabel,
  formatFileSizeBytes,
  groupImportFieldErrors,
  hasUnconfirmedDraft,
  isStepReachable,
  isStaleAsyncGeneration,
  nextStepAfterPreview,
  resolveFileValidationState,
  shouldEnableConfirmImport,
  shouldEnableContinueToConfirm,
} from "@/lib/inventory-import/wizard-state";

describe("inventory import wizard state", () => {
  it("formats file sizes for the selected-file card", () => {
    expect(formatFileSizeBytes(0)).toBe("0 B");
    expect(formatFileSizeBytes(512)).toBe("512 B");
    expect(formatFileSizeBytes(1536)).toBe("1.5 KB");
    expect(formatFileSizeBytes(12_800)).toBe("13 KB");
    expect(formatFileSizeBytes(1_500_000)).toBe("1.43 MB");
  });

  it("resolves validation labels across remove/preview/reject paths", () => {
    expect(
      resolveFileValidationState({
        file: null,
        csvText: "",
        previewFresh: false,
        readyCount: 0,
        rejectedCount: 0,
        hasPreviewRows: false,
      }),
    ).toBe("empty");

    expect(
      resolveFileValidationState({
        file: { name: "a.csv", sizeBytes: 10 },
        csvText: "sku,product_name,available_quantity\nA,Alpha,1",
        previewFresh: false,
        readyCount: 0,
        rejectedCount: 0,
        hasPreviewRows: false,
      }),
    ).toBe("selected");

    expect(
      resolveFileValidationState({
        file: { name: "a.csv", sizeBytes: 10 },
        csvText: "x",
        previewFresh: false,
        readyCount: 1,
        rejectedCount: 0,
        hasPreviewRows: true,
      }),
    ).toBe("preview_stale");

    expect(
      resolveFileValidationState({
        file: { name: "a.csv", sizeBytes: 10 },
        csvText: "x",
        previewFresh: true,
        readyCount: 2,
        rejectedCount: 0,
        hasPreviewRows: true,
      }),
    ).toBe("preview_ready");

    expect(
      resolveFileValidationState({
        file: { name: "a.csv", sizeBytes: 10 },
        csvText: "x",
        previewFresh: true,
        readyCount: 0,
        rejectedCount: 1,
        hasPreviewRows: true,
      }),
    ).toBe("preview_rejected");

    expect(fileValidationLabel("preview_stale")).toContain("outdated");
  });

  it("clears file and preview fields for remove / discard / start over", () => {
    const preview = clearedPreviewFields();
    expect(preview.contentHash).toBe("");
    expect(preview.confirmationToken).toBe("");
    expect(preview.readyCount).toBe(0);
    expect(preview.rejectedCount).toBe(0);
    expect(preview.previewFresh).toBe(false);
    expect(preview.headers).toEqual([]);
    expect(preview.rows).toEqual([]);

    const file = clearedFileFields();
    expect(file.file).toBeNull();
    expect(file.csvText).toBe("");
    expect(file.mappingOverride).toEqual({});
    expect(file.resultSummary).toBeNull();
    expect(file.error).toBeNull();
    expect(file.step).toBe("upload");
    expect(file.confirmationToken).toBe("");
  });

  it("treats unconfirmed drafts differently from committed imports", () => {
    expect(
      hasUnconfirmedDraft({
        hasFile: true,
        hasPreview: false,
        hasConfirmationToken: false,
        hasCommittedResult: false,
      }),
    ).toBe(true);

    expect(
      hasUnconfirmedDraft({
        hasFile: true,
        hasPreview: true,
        hasConfirmationToken: true,
        hasCommittedResult: true,
      }),
    ).toBe(false);
  });

  it("disables continue/confirm until preview is fresh and valid", () => {
    expect(
      shouldEnableContinueToConfirm({
        step: "preview",
        previewFresh: true,
        readyCount: 3,
        rejectedCount: 0,
        pending: false,
      }),
    ).toBe(true);

    expect(
      shouldEnableContinueToConfirm({
        step: "preview",
        previewFresh: false,
        readyCount: 3,
        rejectedCount: 0,
        pending: false,
      }),
    ).toBe(false);

    expect(
      shouldEnableConfirmImport({
        step: "confirm",
        confirmationToken: "tok",
        previewFresh: true,
        readyCount: 2,
        rejectedCount: 0,
        pending: false,
        confirmLocked: false,
      }),
    ).toBe(true);

    expect(
      shouldEnableConfirmImport({
        step: "confirm",
        confirmationToken: "tok",
        previewFresh: false,
        readyCount: 2,
        rejectedCount: 0,
        pending: false,
        confirmLocked: false,
      }),
    ).toBe(false);

    expect(
      shouldEnableConfirmImport({
        step: "confirm",
        confirmationToken: "",
        previewFresh: true,
        readyCount: 2,
        rejectedCount: 0,
        pending: false,
        confirmLocked: false,
      }),
    ).toBe(false);

    expect(
      shouldEnableConfirmImport({
        step: "confirm",
        confirmationToken: "tok",
        previewFresh: true,
        readyCount: 2,
        rejectedCount: 0,
        pending: false,
        confirmLocked: true,
      }),
    ).toBe(false);
  });

  it("routes preview into map when rejected or mapping incomplete", () => {
    expect(
      nextStepAfterPreview({ rejectedCount: 1, mappingComplete: true }),
    ).toBe("map");
    expect(
      nextStepAfterPreview({ rejectedCount: 0, mappingComplete: false }),
    ).toBe("map");
    expect(
      nextStepAfterPreview({ rejectedCount: 0, mappingComplete: true }),
    ).toBe("preview");
  });

  it("gates step navigation for back actions and pending drafts", () => {
    expect(
      isStepReachable({
        target: "upload",
        current: "confirm",
        hasFile: true,
        hasPreview: true,
        previewFresh: true,
        hasConfirmationToken: true,
        hasCommittedResult: false,
      }),
    ).toBe(true);

    expect(
      isStepReachable({
        target: "preview",
        current: "confirm",
        hasFile: true,
        hasPreview: true,
        previewFresh: false,
        hasConfirmationToken: true,
        hasCommittedResult: false,
      }),
    ).toBe(false);

    expect(
      isStepReachable({
        target: "result",
        current: "confirm",
        hasFile: true,
        hasPreview: true,
        previewFresh: true,
        hasConfirmationToken: true,
        hasCommittedResult: false,
      }),
    ).toBe(false);

    expect(
      isStepReachable({
        target: "result",
        current: "result",
        hasFile: true,
        hasPreview: true,
        previewFresh: true,
        hasConfirmationToken: true,
        hasCommittedResult: true,
      }),
    ).toBe(true);
  });

  it("ignores stale async generations after replace/remove/reset", () => {
    expect(isStaleAsyncGeneration(1, 2)).toBe(true);
    expect(isStaleAsyncGeneration(4, 4)).toBe(false);
  });

  it("groups repeated field errors with expandable row detail", () => {
    const grouped = groupImportFieldErrors([
      {
        rowNumber: 2,
        code: "INVALID_QUANTITY",
        message: "on_hand_quantity must be a whole non-negative number.",
        field: "on_hand_quantity",
      },
      {
        rowNumber: 3,
        code: "INVALID_QUANTITY",
        message: "on_hand_quantity must be a whole non-negative number.",
        field: "on_hand_quantity",
      },
      {
        rowNumber: 2,
        code: "INVALID_QUANTITY",
        message: "incoming_quantity must be a whole non-negative number.",
        field: "incoming_quantity",
      },
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped[0]?.field).toBe("on_hand_quantity");
    expect(grouped[0]?.count).toBe(2);
    expect(grouped[0]?.rowNumbers).toEqual([2, 3]);
    expect(grouped[1]?.field).toBe("incoming_quantity");
    expect(grouped[1]?.count).toBe(1);
  });

  it("keeps confirm disabled when preview becomes stale after mapping change", () => {
    expect(
      shouldEnableConfirmImport({
        step: "confirm",
        confirmationToken: "tok",
        previewFresh: false,
        readyCount: 20,
        rejectedCount: 0,
        pending: false,
        confirmLocked: false,
      }),
    ).toBe(false);
    expect(
      shouldEnableContinueToConfirm({
        step: "preview",
        previewFresh: false,
        readyCount: 20,
        rejectedCount: 0,
        pending: false,
      }),
    ).toBe(false);
  });
});
