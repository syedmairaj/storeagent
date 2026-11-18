"use client";

import {
  type ChangeEvent,
  type DragEvent,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  Replace,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import {
  confirmMerchantInventoryImportAction,
  createImportConfirmationTokenAction,
  getMerchantInventoryCsvTemplateAction,
  previewMerchantInventoryImportAction,
} from "@/lib/inventory-import/actions";
import type {
  MerchantColumnMapping,
  MerchantCsvField,
  MerchantImportPreviewRow,
} from "@/lib/inventory-import/contract";
import {
  MERCHANT_CSV_OPTIONAL_FIELDS,
  MERCHANT_CSV_REQUIRED_FIELDS,
} from "@/lib/inventory-import/contract";
import {
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
  type InventoryImportStep,
  type SelectedFileMeta,
} from "@/lib/inventory-import/wizard-state";

type StoreOption = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
};

type LocationOption = {
  id: string;
  storeId: string;
  name: string;
};

type ResultSummary = {
  syncRunId: string;
  disposition: string;
  readyCount: number;
  created: number;
  updated: number;
  skipped: number;
  quarantined: number;
  failed: number;
  storeName: string;
  locationName: string;
  rowErrors: readonly { rowNumber: number; code: string; message: string }[];
};

const FIELD_LABELS: Record<MerchantCsvField, string> = {
  sku: "SKU",
  product_name: "Product name",
  available_quantity: "Available quantity",
  barcode: "Barcode",
  on_hand_quantity: "On-hand quantity",
  committed_quantity: "Committed quantity",
  incoming_quantity: "Incoming quantity",
};

const STEPS: readonly { key: InventoryImportStep; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "map", label: "Map" },
  { key: "preview", label: "Preview" },
  { key: "confirm", label: "Confirm" },
  { key: "result", label: "Results" },
] as const;

export function InventoryImportWizard({
  organizationId,
  stores,
  locations,
  canImport,
}: {
  organizationId: string;
  stores: readonly StoreOption[];
  locations: readonly LocationOption[];
  canImport: boolean;
}) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const asyncGenerationRef = useRef(0);
  const confirmLockRef = useRef(false);

  const [step, setStep] = useState<InventoryImportStep>("upload");
  const initialStoreId = stores.length === 1 ? stores[0]!.id : "";
  const initialLocations = locations.filter(
    (location) => location.storeId === initialStoreId,
  );
  const [storeId, setStoreId] = useState(initialStoreId);
  const [locationId, setLocationId] = useState(
    initialLocations.length === 1 ? initialLocations[0]!.id : "",
  );
  const [selectedFile, setSelectedFile] = useState<SelectedFileMeta | null>(
    null,
  );
  const [csvText, setCsvText] = useState("");
  const [mappingOverride, setMappingOverride] = useState<MerchantColumnMapping>(
    {},
  );
  const [headers, setHeaders] = useState<readonly string[]>([]);
  const [rows, setRows] = useState<readonly MerchantImportPreviewRow[]>([]);
  const [contentHash, setContentHash] = useState("");
  const [readyCount, setReadyCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [confirmationToken, setConfirmationToken] = useState("");
  const [previewFresh, setPreviewFresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultSummary, setResultSummary] = useState<ResultSummary | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const [confirmLocked, setConfirmLocked] = useState(false);
  const [dragging, setDragging] = useState(false);

  const storeLocations = useMemo(
    () => locations.filter((location) => location.storeId === storeId),
    [locations, storeId],
  );

  const selectedStore = stores.find((store) => store.id === storeId) ?? null;
  const selectedLocation =
    storeLocations.find((location) => location.id === locationId) ?? null;

  const validationState = resolveFileValidationState({
    file: selectedFile,
    csvText,
    previewFresh,
    readyCount,
    rejectedCount,
    hasPreviewRows: rows.length > 0,
  });

  const draftUnconfirmed = hasUnconfirmedDraft({
    hasFile: Boolean(selectedFile && csvText.trim()),
    hasPreview: rows.length > 0,
    hasConfirmationToken: Boolean(confirmationToken),
    hasCommittedResult: Boolean(resultSummary),
  });

  const actionableRowErrors = useMemo(
    () =>
      rows
        .filter((row) => row.status !== "ready")
        .flatMap((row) =>
          row.errors.map((entry) => ({
            rowNumber: row.rowNumber,
            code: entry.code,
            message: entry.message,
            field: entry.field,
          })),
        ),
    [rows],
  );

  const groupedRowErrors = useMemo(
    () => groupImportFieldErrors(actionableRowErrors),
    [actionableRowErrors],
  );

  function bumpAsyncGeneration() {
    asyncGenerationRef.current += 1;
    return asyncGenerationRef.current;
  }

  function clearFileInputValue() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function invalidatePreview(options?: { keepStep?: InventoryImportStep }) {
    setHeaders([]);
    setRows([]);
    setContentHash("");
    setReadyCount(0);
    setRejectedCount(0);
    setConfirmationToken("");
    setPreviewFresh(false);
    confirmLockRef.current = false;
    setConfirmLocked(false);
    if (!resultSummary) {
      setResultSummary(null);
    }
    if (options?.keepStep) {
      setStep(options.keepStep);
    }
  }

  function removeSelectedFile() {
    bumpAsyncGeneration();
    clearFileInputValue();
    setSelectedFile(null);
    setCsvText("");
    setMappingOverride({});
    setError(null);
    setResultSummary(null);
    invalidatePreview({ keepStep: "upload" });
    setStep("upload");
  }

  function discardDraft() {
    if (resultSummary) {
      return;
    }
    removeSelectedFile();
  }

  function startOverAfterCommit() {
    bumpAsyncGeneration();
    clearFileInputValue();
    setSelectedFile(null);
    setCsvText("");
    setMappingOverride({});
    setError(null);
    setResultSummary(null);
    invalidatePreview({ keepStep: "upload" });
    setStep("upload");
  }

  function openFilePicker() {
    clearFileInputValue();
    fileInputRef.current?.click();
  }

  function replaceSelectedFile() {
    bumpAsyncGeneration();
    setError(null);
    setConfirmationToken("");
    setPreviewFresh(false);
    confirmLockRef.current = false;
    setConfirmLocked(false);
    openFilePicker();
  }

  function onStoreChange(nextStoreId: string) {
    bumpAsyncGeneration();
    setStoreId(nextStoreId);
    const nextLocations = locations.filter(
      (location) => location.storeId === nextStoreId,
    );
    setLocationId(
      nextLocations.length === 1 ? nextLocations[0]!.id : "",
    );
    setError(null);
    invalidatePreview({ keepStep: "upload" });
    setStep("upload");
  }

  function onLocationChange(nextLocationId: string) {
    bumpAsyncGeneration();
    setLocationId(nextLocationId);
    setError(null);
    invalidatePreview({ keepStep: "upload" });
    setStep("upload");
  }

  function onMappingChange(field: MerchantCsvField, value: string) {
    bumpAsyncGeneration();
    setMappingOverride((current) => ({
      ...current,
      [field]: value || undefined,
    }));
    setConfirmationToken("");
    setPreviewFresh(false);
    confirmLockRef.current = false;
    setConfirmLocked(false);
    setError(null);
    if (step === "confirm" || step === "preview") {
      setStep("map");
    }
  }

  async function ingestFile(file: File) {
    const generation = bumpAsyncGeneration();
    setError(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a .csv file.");
      clearFileInputValue();
      return;
    }
    if (file.size > 1_000_000) {
      setError("CSV must be 1 MB or smaller.");
      clearFileInputValue();
      return;
    }

    const text = await file.text();
    if (isStaleAsyncGeneration(generation, asyncGenerationRef.current)) {
      return;
    }

    setSelectedFile({ name: file.name, sizeBytes: file.size });
    setCsvText(text);
    setMappingOverride({});
    setResultSummary(null);
    invalidatePreview({ keepStep: "upload" });
    setStep("upload");
    clearFileInputValue();
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void ingestFile(file);
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void ingestFile(file);
    }
  }

  function mappingComplete(mapping: MerchantColumnMapping): boolean {
    return MERCHANT_CSV_REQUIRED_FIELDS.every((field) => Boolean(mapping[field]));
  }

  function runPreview() {
    setError(null);
    if (!storeId || !locationId) {
      setError("Choose a store and location before previewing.");
      return;
    }
    if (!csvText.trim() || !selectedFile) {
      setError("Upload a CSV file first.");
      return;
    }

    const generation = bumpAsyncGeneration();
    startTransition(async () => {
      const preview = await previewMerchantInventoryImportAction({
        organizationId,
        storeId,
        locationId,
        csvText,
        mappingOverride,
      });

      if (isStaleAsyncGeneration(generation, asyncGenerationRef.current)) {
        return;
      }

      if (!preview.ok) {
        setError(preview.error);
        setPreviewFresh(false);
        return;
      }

      setHeaders(preview.headers);
      setRows(preview.rows);
      setContentHash(preview.contentHash);
      setReadyCount(preview.readyCount);
      setRejectedCount(preview.rejectedCount);
      setMappingOverride(preview.mapping);
      setConfirmationToken("");
      setPreviewFresh(true);
      setResultSummary(null);
      setStep(
        nextStepAfterPreview({
          rejectedCount: preview.rejectedCount,
          mappingComplete: mappingComplete(preview.mapping),
        }),
      );
    });
  }

  function goConfirm() {
    setError(null);
    if (
      !shouldEnableContinueToConfirm({
        step,
        previewFresh,
        readyCount,
        rejectedCount,
        pending,
      })
    ) {
      setError(
        previewFresh
          ? "Fix rejected rows or revalidate before confirming."
          : "Preview is outdated. Validate the current file again.",
      );
      return;
    }

    const generation = bumpAsyncGeneration();
    startTransition(async () => {
      const token = await createImportConfirmationTokenAction();
      if (isStaleAsyncGeneration(generation, asyncGenerationRef.current)) {
        return;
      }
      setConfirmationToken(token);
      setStep("confirm");
    });
  }

  function runConfirm() {
    setError(null);
    if (
      !shouldEnableConfirmImport({
        step,
        confirmationToken,
        previewFresh,
        readyCount,
        rejectedCount,
        pending,
        confirmLocked,
      })
    ) {
      setError(
        "Confirmation is locked until the current preview is validated again.",
      );
      return;
    }
    if (confirmLockRef.current) {
      return;
    }

    confirmLockRef.current = true;
    setConfirmLocked(true);
    const generation = asyncGenerationRef.current;

    startTransition(async () => {
      const result = await confirmMerchantInventoryImportAction({
        organizationId,
        storeId,
        locationId,
        csvText,
        contentHash,
        confirmationToken,
        mappingOverride,
      });

      if (isStaleAsyncGeneration(generation, asyncGenerationRef.current)) {
        confirmLockRef.current = false;
        setConfirmLocked(false);
        return;
      }

      if (!result.ok) {
        confirmLockRef.current = false;
        setConfirmLocked(false);
        setError(result.error);
        return;
      }

      setResultSummary({
        syncRunId: result.syncRunId,
        disposition: result.disposition,
        readyCount: result.readyCount,
        created: result.skuCounts.created,
        updated: result.skuCounts.updated,
        skipped: result.skuCounts.skipped,
        quarantined: result.skuCounts.quarantined,
        failed: result.skuCounts.failed,
        storeName: result.storeName,
        locationName: result.locationName,
        rowErrors: result.rowErrors,
      });
      setConfirmationToken("");
      setStep("result");
      confirmLockRef.current = false;
      setConfirmLocked(false);
    });
  }

  async function downloadTemplate() {
    const template = await getMerchantInventoryCsvTemplateAction();
    const blob = new Blob([template.content], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = template.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function goToStep(target: InventoryImportStep) {
    if (
      !isStepReachable({
        target,
        current: step,
        hasFile: Boolean(selectedFile && csvText.trim()),
        hasPreview: rows.length > 0,
        previewFresh,
        hasConfirmationToken: Boolean(confirmationToken),
        hasCommittedResult: Boolean(resultSummary),
      })
    ) {
      return;
    }
    setError(null);
    setStep(target);
  }

  if (!canImport) {
    return (
      <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm sm:p-9">
        <h2 className="text-xl font-semibold tracking-[-0.025em]">
          Import requires an owner or admin
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-600">
          You can view inventory after it is imported, but CSV imports are limited
          to owners and admins for this organization.
        </p>
      </div>
    );
  }

  if (stores.length === 0) {
    return (
      <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm sm:p-9">
        <h2 className="text-xl font-semibold tracking-[-0.025em]">
          Create a store first
        </h2>
        <p className="mt-3 text-sm text-zinc-600">
          Inventory import needs an authorized store and location.
        </p>
        <Link
          href={`/app/onboarding/store?organizationId=${organizationId}`}
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white"
        >
          Create first store
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  const continueEnabled = shouldEnableContinueToConfirm({
    step,
    previewFresh,
    readyCount,
    rejectedCount,
    pending,
  });
  const confirmEnabled = shouldEnableConfirmImport({
    step,
    confirmationToken,
    previewFresh,
    readyCount,
    rejectedCount,
    pending,
    confirmLocked,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ol className="flex flex-wrap gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          {STEPS.map(({ key, label }) => {
            const active = step === key;
            const reachable = isStepReachable({
              target: key,
              current: step,
              hasFile: Boolean(selectedFile && csvText.trim()),
              hasPreview: rows.length > 0,
              previewFresh,
              hasConfirmationToken: Boolean(confirmationToken),
              hasCommittedResult: Boolean(resultSummary),
            });
            return (
              <li key={key}>
                <button
                  type="button"
                  disabled={!reachable || active}
                  onClick={() => goToStep(key)}
                  className={
                    active
                      ? "rounded-full border border-zinc-900 bg-zinc-950 px-3 py-1 text-white"
                      : reachable
                        ? "rounded-full border border-zinc-300 bg-white px-3 py-1 text-zinc-700 hover:border-zinc-400"
                        : "rounded-full border border-zinc-200 px-3 py-1 opacity-55"
                  }
                  aria-current={active ? "step" : undefined}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ol>

        {draftUnconfirmed ? (
          <button
            type="button"
            disabled={pending}
            onClick={discardDraft}
            className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-full border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:border-zinc-300 disabled:opacity-60"
          >
            <X className="size-4" aria-hidden="true" />
            Discard draft
          </button>
        ) : null}
      </div>

      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium text-zinc-900">
            Store
            <select
              className="mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm"
              value={storeId}
              onChange={(event) => onStoreChange(event.target.value)}
              required
              disabled={pending || confirmLocked || step === "result"}
            >
              <option value="">Select a store</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name} ({store.currency})
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-zinc-900">
            Location
            <select
              className="mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm"
              value={locationId}
              onChange={(event) => onLocationChange(event.target.value)}
              required
              disabled={
                !storeId || pending || confirmLocked || step === "result"
              }
            >
              <option value="">
                {storeId ? "Select a location" : "Choose a store first"}
              </option>
              {storeLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {stores.length > 1 ? (
          <p className="mt-3 text-xs text-zinc-500">
            Multiple stores are available. StoreAgent never auto-selects one.
          </p>
        ) : null}
        {!previewFresh && rows.length > 0 ? (
          <p className="mt-3 text-xs font-medium text-amber-700">
            Store, location, file, or mapping changed. Re-run preview before
            confirm.
          </p>
        ) : null}
      </section>

      {step === "upload" || step === "map" || step === "preview" ? (
        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.025em]">
                Upload inventory CSV
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600">
                Import SKUs and available quantities into{" "}
                {selectedStore?.name ?? "the selected store"}. No prices,
                suppliers, or forecasts are inferred.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void downloadTemplate()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-zinc-200 px-4 text-sm font-medium text-zinc-700 hover:border-zinc-300"
            >
              <FileSpreadsheet className="size-4" aria-hidden="true" />
              Download template
            </button>
          </div>

          {!selectedFile ? (
            <label
              htmlFor={inputId}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border border-dashed px-6 py-12 text-center transition ${
                dragging
                  ? "border-zinc-900 bg-zinc-50"
                  : "border-zinc-300 bg-zinc-50/70 hover:border-zinc-400"
              }`}
            >
              <Upload className="size-6 text-zinc-500" aria-hidden="true" />
              <span className="mt-4 text-sm font-semibold text-zinc-900">
                Drop a CSV here or choose a file
              </span>
              <span className="mt-2 text-xs text-zinc-500">
                Up to 1 MB and 2,000 rows. UTF-8 CSV.
              </span>
            </label>
          ) : (
            <div
              className="mt-6 rounded-[1.5rem] border border-zinc-200 bg-zinc-50/80 p-4 sm:p-5"
              data-testid="selected-file-card"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white text-zinc-700 shadow-sm ring-1 ring-zinc-200">
                    <FileSpreadsheet className="size-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-950">
                      {selectedFile.name}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {formatFileSizeBytes(selectedFile.sizeBytes)}
                      {" · "}
                      <span
                        className={
                          validationState === "preview_rejected"
                            ? "font-medium text-rose-700"
                            : validationState === "preview_stale"
                              ? "font-medium text-amber-700"
                              : validationState === "preview_ready"
                                ? "font-medium text-emerald-700"
                                : "font-medium text-zinc-700"
                        }
                      >
                        {fileValidationLabel(validationState)}
                      </span>
                    </p>
                    {previewFresh ? (
                      <p className="mt-2 text-xs text-zinc-600">
                        {readyCount} ready · {rejectedCount} rejected
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    disabled={pending || confirmLocked}
                    onClick={replaceSelectedFile}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 hover:border-zinc-400 disabled:opacity-60"
                  >
                    <Replace className="size-4" aria-hidden="true" />
                    Replace
                  </button>
                  <button
                    type="button"
                    disabled={pending || confirmLocked}
                    onClick={removeSelectedFile}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-rose-200 bg-white px-4 text-sm font-medium text-rose-700 hover:border-rose-300 disabled:opacity-60"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    Remove
                  </button>
                </div>
              </div>
            </div>
          )}

          <input
            id={inputId}
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={handleFileInput}
          />

          {(step === "map" || headers.length > 0) && (
            <div className="mt-8 space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Column mapping
                </h3>
                {!previewFresh ? (
                  <p className="text-xs font-medium text-amber-700">
                    Mapping changed — preview again
                  </p>
                ) : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[...MERCHANT_CSV_REQUIRED_FIELDS, ...MERCHANT_CSV_OPTIONAL_FIELDS].map(
                  (field) => (
                    <label
                      key={field}
                      className="block text-sm font-medium text-zinc-900"
                    >
                      {FIELD_LABELS[field]}
                      {MERCHANT_CSV_REQUIRED_FIELDS.includes(
                        field as (typeof MERCHANT_CSV_REQUIRED_FIELDS)[number],
                      )
                        ? " *"
                        : " (optional)"}
                      <select
                        className="mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm"
                        value={mappingOverride[field] ?? ""}
                        onChange={(event) =>
                          onMappingChange(field, event.target.value)
                        }
                        disabled={pending || confirmLocked}
                      >
                        <option value="">Not mapped</option>
                        {headers.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </label>
                  ),
                )}
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {step !== "upload" ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => goToStep("upload")}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-zinc-200 px-4 text-sm font-medium text-zinc-700 disabled:opacity-60"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back
              </button>
            ) : null}
            <button
              type="button"
              disabled={pending || !selectedFile || !csvText.trim()}
              onClick={runPreview}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  Validating
                </>
              ) : previewFresh ? (
                <>
                  Revalidate preview
                  <ArrowRight className="size-4" aria-hidden="true" />
                </>
              ) : (
                <>
                  Preview import
                  <ArrowRight className="size-4" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </section>
      ) : null}

      {(step === "preview" || step === "confirm" || step === "map") &&
      rows.length > 0 ? (
        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.025em]">
                Preview before import
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                <span className="font-semibold text-emerald-700">
                  {readyCount} ready
                </span>
                {" · "}
                <span
                  className={
                    rejectedCount > 0
                      ? "font-semibold text-rose-700"
                      : "text-zinc-600"
                  }
                >
                  {rejectedCount} rejected
                </span>
                . Nothing is written until you confirm.
              </p>
              {!previewFresh ? (
                <p className="mt-2 text-xs font-medium text-amber-700">
                  This preview is outdated. Revalidate before continuing.
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {step === "preview" || step === "confirm" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => goToStep(headers.length > 0 ? "map" : "upload")}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-zinc-200 px-4 text-sm font-medium text-zinc-700 disabled:opacity-60"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Back
                </button>
              ) : null}
              {step === "preview" ? (
                <button
                  type="button"
                  disabled={!continueEnabled}
                  onClick={goConfirm}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Continue to confirm
                  <ArrowRight className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>

          {groupedRowErrors.length > 0 ? (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3">
              <p className="text-sm font-semibold text-rose-900">
                Fix these issues (all-or-nothing import)
              </p>
              <p className="mt-1 text-xs text-rose-800">
                {actionableRowErrors.length} row errors across{" "}
                {groupedRowErrors.length} field problem
                {groupedRowErrors.length === 1 ? "" : "s"}.
              </p>
              <ul className="mt-3 space-y-2">
                {groupedRowErrors.map((group) => (
                  <li
                    key={`${group.field}-${group.code}`}
                    className="rounded-xl border border-rose-200/80 bg-white/70 px-3 py-2 text-sm text-rose-900"
                  >
                    <p className="font-medium">
                      {group.field.replaceAll("_", " ")} · {group.count}× —{" "}
                      {group.message}
                    </p>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs font-medium text-rose-700">
                        Show rows ({group.rowNumbers.length})
                      </summary>
                      <p className="mt-1 text-xs leading-5 text-rose-800">
                        {group.rowNumbers.join(", ")}
                      </p>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-[0.12em] text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Row</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Available</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((row) => (
                  <tr key={row.rowNumber} className="border-t border-zinc-100">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                      {row.rowNumber}
                    </td>
                    <td className="px-4 py-3 font-medium">{row.sku || "—"}</td>
                    <td className="px-4 py-3">{row.productName || "—"}</td>
                    <td className="px-4 py-3">{row.availableQuantity}</td>
                    <td className="px-4 py-3">
                      {row.status === "ready" ? (
                        <span className="text-emerald-700">Ready</span>
                      ) : (
                        <span className="text-rose-700">
                          {row.errors[0]?.message ?? "Rejected"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 50 ? (
            <p className="mt-3 text-xs text-zinc-500">
              Showing the first 50 rows of {rows.length}.
            </p>
          ) : null}
        </section>
      ) : null}

      {step === "confirm" ? (
        <section className="rounded-3xl border border-zinc-200 bg-zinc-950 p-6 text-white shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold tracking-[-0.025em]">
            Confirm inventory import
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
            {readyCount} SKUs will be written to {selectedStore?.name} /{" "}
            {selectedLocation?.name}. Existing matching products and variants are
            reconciled; inventory observations are appended as history. Invalid
            rows are not imported.
          </p>
          {!previewFresh || !confirmationToken ? (
            <p className="mt-4 text-sm font-medium text-amber-300">
              Confirmation disabled until you revalidate the current file,
              store, location, and mapping.
            </p>
          ) : null}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={!confirmEnabled}
              onClick={runConfirm}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-zinc-950 disabled:opacity-60"
            >
              {pending || confirmLocked ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  Importing
                </>
              ) : (
                <>
                  Confirm import
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                </>
              )}
            </button>
            <button
              type="button"
              disabled={pending || confirmLocked}
              onClick={() => goToStep("preview")}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-700 px-4 text-sm font-medium text-zinc-200 disabled:opacity-60"
            >
              Back to preview
            </button>
          </div>
        </section>
      ) : null}

      {step === "result" && resultSummary ? (
        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="size-5" aria-hidden="true" />
          </div>
          <h2 className="mt-6 text-2xl font-semibold tracking-[-0.03em]">
            Import{" "}
            {resultSummary.disposition === "replayed" ? "replayed" : "complete"}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
            Persisted to {resultSummary.storeName} / {resultSummary.locationName}.
            Actions recommendations are not generated from this CSV.
          </p>

          <dl className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 p-4">
              <dt className="text-xs uppercase tracking-[0.12em] text-zinc-500">
                SKUs imported
              </dt>
              <dd className="mt-2 text-2xl font-semibold">
                {resultSummary.readyCount}
              </dd>
            </div>
            <div className="rounded-2xl border border-zinc-200 p-4">
              <dt className="text-xs uppercase tracking-[0.12em] text-zinc-500">
                Created / updated
              </dt>
              <dd className="mt-2 text-2xl font-semibold">
                {resultSummary.created} / {resultSummary.updated}
              </dd>
            </div>
            <div className="rounded-2xl border border-zinc-200 p-4">
              <dt className="text-xs uppercase tracking-[0.12em] text-zinc-500">
                Skipped / rejected
              </dt>
              <dd className="mt-2 text-2xl font-semibold">
                {resultSummary.skipped} /{" "}
                {resultSummary.quarantined + resultSummary.failed}
              </dd>
            </div>
          </dl>

          {resultSummary.rowErrors.length > 0 ? (
            <ul className="mt-6 space-y-2 text-sm text-rose-700">
              {resultSummary.rowErrors.slice(0, 20).map((entry) => (
                <li key={`${entry.rowNumber}-${entry.code}`}>
                  Row {entry.rowNumber}: {entry.message}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/app/${organizationId}/inventory`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white"
            >
              View imported inventory
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={startOverAfterCommit}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-200 px-4 text-sm font-medium text-zinc-700"
            >
              Start over with a new file
            </button>
          </div>
        </section>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
