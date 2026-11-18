/**
 * Pure client-state helpers for InventoryImportWizard UX.
 * Keeps remove/replace/reset/confirmation gating testable without DOM.
 */

export type InventoryImportStep =
  | "upload"
  | "map"
  | "preview"
  | "confirm"
  | "result";

export type SelectedFileMeta = {
  name: string;
  sizeBytes: number;
};

export type FileValidationState =
  | "empty"
  | "selected"
  | "preview_stale"
  | "preview_ready"
  | "preview_rejected";

export type InventoryImportDraftFlags = {
  hasFile: boolean;
  hasPreview: boolean;
  hasConfirmationToken: boolean;
  hasCommittedResult: boolean;
};

export function formatFileSizeBytes(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return "0 B";
  }
  if (sizeBytes < 1024) {
    return `${Math.round(sizeBytes)} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    const kb = sizeBytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  const mb = sizeBytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(2) : Math.round(mb)} MB`;
}

export function resolveFileValidationState(input: {
  file: SelectedFileMeta | null;
  csvText: string;
  previewFresh: boolean;
  readyCount: number;
  rejectedCount: number;
  hasPreviewRows: boolean;
}): FileValidationState {
  if (!input.file || !input.csvText.trim()) {
    return "empty";
  }
  if (!input.hasPreviewRows) {
    return "selected";
  }
  if (!input.previewFresh) {
    return "preview_stale";
  }
  if (input.rejectedCount > 0) {
    return "preview_rejected";
  }
  if (input.readyCount > 0) {
    return "preview_ready";
  }
  return "selected";
}

export function fileValidationLabel(state: FileValidationState): string {
  switch (state) {
    case "empty":
      return "No file selected";
    case "selected":
      return "Ready to preview";
    case "preview_stale":
      return "Preview outdated — revalidate";
    case "preview_ready":
      return "Validated · ready to import";
    case "preview_rejected":
      return "Validated · fix rejected rows";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function hasUnconfirmedDraft(flags: InventoryImportDraftFlags): boolean {
  if (flags.hasCommittedResult) {
    return false;
  }
  return flags.hasFile || flags.hasPreview || flags.hasConfirmationToken;
}

export function shouldEnableConfirmImport(input: {
  step: InventoryImportStep;
  confirmationToken: string;
  previewFresh: boolean;
  readyCount: number;
  rejectedCount: number;
  pending: boolean;
  confirmLocked: boolean;
}): boolean {
  if (input.step !== "confirm") {
    return false;
  }
  if (input.pending || input.confirmLocked) {
    return false;
  }
  if (!input.previewFresh) {
    return false;
  }
  if (!input.confirmationToken.trim()) {
    return false;
  }
  if (input.rejectedCount > 0 || input.readyCount <= 0) {
    return false;
  }
  return true;
}

export function shouldEnableContinueToConfirm(input: {
  step: InventoryImportStep;
  previewFresh: boolean;
  readyCount: number;
  rejectedCount: number;
  pending: boolean;
}): boolean {
  if (input.step !== "preview") {
    return false;
  }
  if (input.pending || !input.previewFresh) {
    return false;
  }
  return input.rejectedCount === 0 && input.readyCount > 0;
}

export function nextStepAfterPreview(input: {
  rejectedCount: number;
  mappingComplete: boolean;
}): InventoryImportStep {
  if (input.rejectedCount > 0 || !input.mappingComplete) {
    return "map";
  }
  return "preview";
}

export function isStepReachable(input: {
  target: InventoryImportStep;
  current: InventoryImportStep;
  hasFile: boolean;
  hasPreview: boolean;
  previewFresh: boolean;
  hasConfirmationToken: boolean;
  hasCommittedResult: boolean;
}): boolean {
  const order: InventoryImportStep[] = [
    "upload",
    "map",
    "preview",
    "confirm",
    "result",
  ];
  const targetIndex = order.indexOf(input.target);
  const currentIndex = order.indexOf(input.current);
  if (targetIndex < 0 || currentIndex < 0) {
    return false;
  }

  // Always allow going back to earlier non-result steps while drafting.
  if (targetIndex <= currentIndex && input.target !== "result") {
    if (input.target === "upload") {
      return true;
    }
    if (input.target === "map") {
      return input.hasFile && input.hasPreview;
    }
    if (input.target === "preview") {
      return input.hasFile && input.hasPreview && input.previewFresh;
    }
    if (input.target === "confirm") {
      return (
        input.hasFile &&
        input.hasPreview &&
        input.previewFresh &&
        input.hasConfirmationToken
      );
    }
  }

  if (input.target === "result") {
    return input.hasCommittedResult;
  }

  return false;
}

export function clearedPreviewFields() {
  return {
    headers: [] as readonly string[],
    rows: [] as readonly never[],
    contentHash: "",
    readyCount: 0,
    rejectedCount: 0,
    confirmationToken: "",
    previewFresh: false,
  };
}

export function clearedFileFields() {
  return {
    file: null as SelectedFileMeta | null,
    csvText: "",
    mappingOverride: {} as Record<string, string | undefined>,
    ...clearedPreviewFields(),
    error: null as string | null,
    resultSummary: null,
    step: "upload" as InventoryImportStep,
  };
}

export function isStaleAsyncGeneration(
  requestGeneration: number,
  latestGeneration: number,
): boolean {
  return requestGeneration !== latestGeneration;
}

export type GroupedImportFieldError = {
  field: string;
  code: string;
  message: string;
  count: number;
  rowNumbers: readonly number[];
};

/**
 * Groups repeated row-level field issues for merchant-friendly error UI.
 * Preserves first-seen message/code per field+code key; expands row detail.
 */
export function groupImportFieldErrors(
  errors: readonly {
    rowNumber: number;
    code: string;
    message: string;
    field?: string | null;
  }[],
): readonly GroupedImportFieldError[] {
  const groups = new Map<string, GroupedImportFieldError>();

  for (const error of errors) {
    const field = error.field?.trim() || "row";
    const key = `${field}::${error.code}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        field,
        code: error.code,
        message: error.message,
        count: 1,
        rowNumbers: [error.rowNumber],
      });
      continue;
    }

    groups.set(key, {
      ...existing,
      count: existing.count + 1,
      rowNumbers: [...existing.rowNumbers, error.rowNumber],
    });
  }

  return [...groups.values()].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    return left.field.localeCompare(right.field);
  });
}
