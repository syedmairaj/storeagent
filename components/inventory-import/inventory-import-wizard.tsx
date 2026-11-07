"use client";

import {
  type ChangeEvent,
  type DragEvent,
  useId,
  useMemo,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  Upload,
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

type Step = "upload" | "map" | "preview" | "confirm" | "result";

const FIELD_LABELS: Record<MerchantCsvField, string> = {
  sku: "SKU",
  product_name: "Product name",
  available_quantity: "Available quantity",
  barcode: "Barcode",
  on_hand_quantity: "On-hand quantity",
  committed_quantity: "Committed quantity",
  incoming_quantity: "Incoming quantity",
};

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
  const [step, setStep] = useState<Step>("upload");
  const initialStoreId = stores.length === 1 ? stores[0]!.id : "";
  const initialLocations = locations.filter(
    (location) => location.storeId === initialStoreId,
  );
  const [storeId, setStoreId] = useState(initialStoreId);
  const [locationId, setLocationId] = useState(
    initialLocations.length === 1 ? initialLocations[0]!.id : "",
  );
  const [fileName, setFileName] = useState<string | null>(null);
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
  const [error, setError] = useState<string | null>(null);
  const [resultSummary, setResultSummary] = useState<{
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
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);

  const storeLocations = useMemo(
    () => locations.filter((location) => location.storeId === storeId),
    [locations, storeId],
  );

  const selectedStore = stores.find((store) => store.id === storeId) ?? null;

  function resetPreviewState() {
    setHeaders([]);
    setRows([]);
    setContentHash("");
    setReadyCount(0);
    setRejectedCount(0);
    setConfirmationToken("");
    setResultSummary(null);
  }

  function onStoreChange(nextStoreId: string) {
    setStoreId(nextStoreId);
    const nextLocations = locations.filter(
      (location) => location.storeId === nextStoreId,
    );
    setLocationId(
      nextLocations.length === 1 ? nextLocations[0]!.id : "",
    );
    resetPreviewState();
    setStep("upload");
  }

  async function ingestFile(file: File) {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a .csv file.");
      return;
    }
    if (file.size > 1_000_000) {
      setError("CSV must be 1 MB or smaller.");
      return;
    }

    const text = await file.text();
    setFileName(file.name);
    setCsvText(text);
    resetPreviewState();
    setStep("upload");
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

  function runPreview() {
    setError(null);
    if (!storeId || !locationId) {
      setError("Choose a store and location before previewing.");
      return;
    }
    if (!csvText.trim()) {
      setError("Upload a CSV file first.");
      return;
    }

    startTransition(async () => {
      const preview = await previewMerchantInventoryImportAction({
        organizationId,
        storeId,
        locationId,
        csvText,
        mappingOverride,
      });

      if (!preview.ok) {
        setError(preview.error);
        return;
      }

      setHeaders(preview.headers);
      setRows(preview.rows);
      setContentHash(preview.contentHash);
      setReadyCount(preview.readyCount);
      setRejectedCount(preview.rejectedCount);
      setMappingOverride(preview.mapping);
      setStep(preview.rejectedCount > 0 || !mappingComplete(preview.mapping) ? "map" : "preview");
    });
  }

  function mappingComplete(mapping: MerchantColumnMapping): boolean {
    return MERCHANT_CSV_REQUIRED_FIELDS.every((field) => Boolean(mapping[field]));
  }

  function goConfirm() {
    setError(null);
    if (rejectedCount > 0) {
      setError("Fix rejected rows before confirming import.");
      return;
    }
    if (readyCount === 0) {
      setError("No valid rows are ready to import.");
      return;
    }

    startTransition(async () => {
      const token = await createImportConfirmationTokenAction();
      setConfirmationToken(token);
      setStep("confirm");
    });
  }

  function runConfirm() {
    setError(null);
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

      if (!result.ok) {
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
      setStep("result");
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

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {(
          [
            ["upload", "Upload"],
            ["map", "Map"],
            ["preview", "Preview"],
            ["confirm", "Confirm"],
            ["result", "Results"],
          ] as const
        ).map(([key, label]) => (
          <li
            key={key}
            className={
              step === key
                ? "rounded-full border border-zinc-900 bg-zinc-950 px-3 py-1 text-white"
                : "rounded-full border border-zinc-200 px-3 py-1"
            }
          >
            {label}
          </li>
        ))}
      </ol>

      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium text-zinc-900">
            Store
            <select
              className="mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm"
              value={storeId}
              onChange={(event) => onStoreChange(event.target.value)}
              required
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
              onChange={(event) => {
                setLocationId(event.target.value);
                resetPreviewState();
                setStep("upload");
              }}
              required
              disabled={!storeId}
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
            <input
              id={inputId}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={handleFileInput}
            />
          </label>

          {fileName ? (
            <p className="mt-4 text-sm text-zinc-600">
              Selected file:{" "}
              <span className="font-medium text-zinc-950">{fileName}</span>
            </p>
          ) : null}

          {(step === "map" || headers.length > 0) && (
            <div className="mt-8 space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Column mapping
              </h3>
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
                          setMappingOverride((current) => ({
                            ...current,
                            [field]: event.target.value || undefined,
                          }))
                        }
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

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={pending}
              onClick={runPreview}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  Validating
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

      {(step === "preview" || step === "confirm") && rows.length > 0 ? (
        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.025em]">
                Preview before import
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                {readyCount} ready · {rejectedCount} rejected. Nothing is written
                until you confirm.
              </p>
            </div>
            {step === "preview" ? (
              <button
                type="button"
                disabled={pending || rejectedCount > 0 || readyCount === 0}
                onClick={goConfirm}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                Continue to confirm
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>

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
            {storeLocations.find((location) => location.id === locationId)?.name}.
            Existing matching products and variants are reconciled; inventory
            observations are appended as history. Invalid rows are not imported.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={pending}
              onClick={runConfirm}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-zinc-950 disabled:opacity-60"
            >
              {pending ? (
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
              disabled={pending}
              onClick={() => setStep("preview")}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-700 px-4 text-sm font-medium text-zinc-200"
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
            Import {resultSummary.disposition === "replayed" ? "replayed" : "complete"}
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
              onClick={() => {
                setStep("upload");
                setFileName(null);
                setCsvText("");
                resetPreviewState();
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-200 px-4 text-sm font-medium text-zinc-700"
            >
              Import another file
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
