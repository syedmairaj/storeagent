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
  confirmMerchantSalesImportAction,
  createSalesImportConfirmationTokenAction,
  getMerchantSalesCsvTemplateAction,
  previewMerchantSalesImportAction,
} from "@/lib/sales-import/actions";
import type {
  MerchantSalesColumnMapping,
  MerchantSalesCsvField,
  MerchantSalesImportPreviewRow,
} from "@/lib/sales-import/contract";
import {
  MERCHANT_SALES_CSV_OPTIONAL_FIELDS,
  MERCHANT_SALES_CSV_REQUIRED_FIELDS,
} from "@/lib/sales-import/contract";

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

const FIELD_LABELS: Record<MerchantSalesCsvField, string> = {
  order_id: "Order ID",
  line_id: "Line ID",
  sku: "SKU",
  quantity: "Quantity sold",
  ordered_at: "Ordered at",
  status: "Order status",
  currency: "Currency",
  unit_price: "Unit price",
};

export function SalesImportWizard({
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
  const [mappingOverride, setMappingOverride] =
    useState<MerchantSalesColumnMapping>({});
  const [headers, setHeaders] = useState<readonly string[]>([]);
  const [rows, setRows] = useState<readonly MerchantSalesImportPreviewRow[]>(
    [],
  );
  const [contentHash, setContentHash] = useState("");
  const [readyCount, setReadyCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [velocityEligibleCount, setVelocityEligibleCount] = useState(0);
  const [storeTimezone, setStoreTimezone] = useState("");
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
    metricRecomputeNote: string;
    metricsActivated: boolean;
    metricsSucceeded: number;
    metricsConsumedEvents: number;
    metricsStatus: "ready" | "pending" | "retryable" | "idle";
    metricsPendingRemaining: boolean;
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
    setVelocityEligibleCount(0);
    setStoreTimezone("");
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

  function mappingComplete(mapping: MerchantSalesColumnMapping): boolean {
    return MERCHANT_SALES_CSV_REQUIRED_FIELDS.every((field) =>
      Boolean(mapping[field]),
    );
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
      const preview = await previewMerchantSalesImportAction({
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
      setVelocityEligibleCount(preview.velocityEligibleCount);
      setMappingOverride(preview.mapping);
      setStoreTimezone(preview.storeTimezone);
      setStep(
        preview.rejectedCount > 0 || !mappingComplete(preview.mapping)
          ? "map"
          : "preview",
      );
    });
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
      const token = await createSalesImportConfirmationTokenAction();
      setConfirmationToken(token);
      setStep("confirm");
    });
  }

  function runConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmMerchantSalesImportAction({
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
        created: result.orderItemCounts.created,
        updated: result.orderItemCounts.updated,
        skipped: result.orderItemCounts.skipped,
        quarantined: result.orderItemCounts.quarantined,
        failed: result.orderItemCounts.failed,
        storeName: result.storeName,
        locationName: result.locationName,
        metricRecomputeNote: result.metricRecomputeNote,
        metricsActivated: result.metricsActivated,
        metricsSucceeded: result.metricsSucceeded,
        metricsConsumedEvents: result.metricsConsumedEvents,
        metricsStatus: result.metricsStatus,
        metricsPendingRemaining: result.metricsPendingRemaining,
        rowErrors: result.rowErrors,
      });
      setStep("result");
    });
  }

  async function downloadTemplate() {
    const template = await getMerchantSalesCsvTemplateAction();
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
          Sales history CSV import is limited to owners and admins for this
          organization.
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
          Sales import needs an authorized store and location.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
        Returns are not imported in V1. Upload sold line quantities only —
        StoreAgent will not invent net sales after returns. SKUs must already
        exist from inventory import. Identical retries are safe; conflicting
        changes to an existing order or line are rejected so history cannot be
        silently rewritten. Cover stays blocked until demand metrics are
        activated for matching stock positions.
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid w-full gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-zinc-900">Store</span>
              <select
                className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                value={storeId}
                onChange={(event) => onStoreChange(event.target.value)}
              >
                <option value="">Select store</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-900">Location</span>
              <select
                className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                value={locationId}
                onChange={(event) => {
                  setLocationId(event.target.value);
                  resetPreviewState();
                  setStep("upload");
                }}
                disabled={!storeId}
              >
                <option value="">Select location</option>
                {storeLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={() => void downloadTemplate()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-zinc-200 px-4 text-sm font-medium text-zinc-700"
          >
            <FileSpreadsheet className="size-4" aria-hidden="true" />
            Download template
          </button>
        </div>

        {selectedStore ? (
          <p className="mt-3 text-xs text-zinc-500">
            Timestamps without a timezone use store local time (
            {selectedStore.timezone}
            ). Currency defaults to {selectedStore.currency}.
          </p>
        ) : null}

        <label
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed px-6 py-10 text-center transition ${
            dragging
              ? "border-zinc-900 bg-zinc-50"
              : "border-zinc-300 bg-zinc-50/70"
          }`}
        >
          <Upload className="size-6 text-zinc-700" aria-hidden="true" />
          <span className="mt-3 text-sm font-semibold text-zinc-950">
            {fileName ? fileName : "Drop sales CSV here or browse"}
          </span>
          <span className="mt-1 text-xs text-zinc-500">
            Max 1 MB · up to 5,000 rows
          </span>
          <input
            id={inputId}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={handleFileInput}
          />
        </label>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={pending || !csvText}
            onClick={runPreview}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-zinc-950 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            Preview import
          </button>
          <Link
            href={`/app/${organizationId}/inventory`}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-200 px-5 text-sm font-medium text-zinc-700"
          >
            Back to inventory
          </Link>
        </div>

        {error ? (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}
      </div>

      {step === "map" || step === "preview" || step === "confirm" ? (
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-zinc-950">
            Column mapping
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            Required fields must map before confirmation. Returns columns are
            rejected.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {[
              ...MERCHANT_SALES_CSV_REQUIRED_FIELDS,
              ...MERCHANT_SALES_CSV_OPTIONAL_FIELDS,
            ].map((field) => (
              <label key={field} className="block text-sm">
                <span className="font-medium text-zinc-900">
                  {FIELD_LABELS[field]}
                  {MERCHANT_SALES_CSV_REQUIRED_FIELDS.includes(
                    field as (typeof MERCHANT_SALES_CSV_REQUIRED_FIELDS)[number],
                  )
                    ? " *"
                    : ""}
                </span>
                <select
                  className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                  value={mappingOverride[field] ?? ""}
                  onChange={(event) => {
                    const next = {
                      ...mappingOverride,
                      [field]: event.target.value || undefined,
                    };
                    setMappingOverride(next);
                  }}
                >
                  <option value="">Not mapped</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={runPreview}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-200 px-4 text-sm font-medium text-zinc-700"
          >
            Re-preview with mapping
          </button>
        </div>
      ) : null}

      {rows.length > 0 && step !== "result" ? (
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-zinc-950">
                Preview
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                {readyCount} ready · {rejectedCount} rejected ·{" "}
                {velocityEligibleCount} velocity-eligible after metrics activation
                {storeTimezone ? ` · timezone ${storeTimezone}` : ""}
              </p>
            </div>
            {step === "preview" ? (
              <button
                type="button"
                disabled={pending || rejectedCount > 0 || readyCount === 0}
                onClick={goConfirm}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-zinc-950 px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Continue to confirm
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            ) : null}
            {step === "confirm" ? (
              <button
                type="button"
                disabled={pending}
                onClick={runConfirm}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-zinc-950 px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {pending ? (
                  <LoaderCircle
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                )}
                Confirm import
              </button>
            ) : null}
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase tracking-[0.12em] text-zinc-500">
                <tr>
                  <th className="px-2 py-2">Row</th>
                  <th className="px-2 py-2">Order</th>
                  <th className="px-2 py-2">Line</th>
                  <th className="px-2 py-2">SKU</th>
                  <th className="px-2 py-2">Qty</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((row) => (
                  <tr
                    key={`${row.rowNumber}-${row.lineId}`}
                    className="border-b border-zinc-100 align-top"
                  >
                    <td className="px-2 py-2 tabular-nums text-zinc-500">
                      {row.rowNumber}
                    </td>
                    <td className="px-2 py-2">{row.orderId || "—"}</td>
                    <td className="px-2 py-2">{row.lineId || "—"}</td>
                    <td className="px-2 py-2">{row.sku || "—"}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {row.quantity || "—"}
                    </td>
                    <td className="px-2 py-2">{row.orderStatus}</td>
                    <td className="px-2 py-2">
                      {row.importStatus === "ready" ? (
                        <span className="text-emerald-700">
                          Ready
                          {row.contributesToVelocity
                            ? ""
                            : " (not velocity-eligible)"}
                        </span>
                      ) : (
                        <span className="text-red-700">
                          {row.errors.map((item) => item.message).join(" ")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 50 ? (
              <p className="mt-3 text-xs text-zinc-500">
                Showing first 50 of {rows.length} rows.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === "result" && resultSummary ? (
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-zinc-950">
            Import complete
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            {resultSummary.storeName} · {resultSummary.locationName} · SyncRun{" "}
            <span className="font-mono text-xs">{resultSummary.syncRunId}</span>{" "}
            ({resultSummary.disposition})
          </p>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Stat label="Ready lines" value={String(resultSummary.readyCount)} />
            <Stat label="Created" value={String(resultSummary.created)} />
            <Stat label="Updated" value={String(resultSummary.updated)} />
            <Stat label="Skipped" value={String(resultSummary.skipped)} />
            <Stat
              label="Quarantined / failed"
              value={String(
                resultSummary.quarantined + resultSummary.failed,
              )}
            />
            <Stat
              label="Demand metrics"
              value={
                resultSummary.metricsStatus === "ready"
                  ? "Ready"
                  : resultSummary.metricsStatus === "pending"
                    ? "Pending"
                    : resultSummary.metricsStatus === "retryable"
                      ? "Retry"
                      : resultSummary.metricsActivated
                        ? "Idle"
                        : "—"
              }
            />
          </dl>
          <p className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700">
            {resultSummary.metricRecomputeNote}
          </p>
          {resultSummary.rowErrors.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm text-red-700">
              {resultSummary.rowErrors.map((item) => (
                <li key={`${item.rowNumber}-${item.code}`}>
                  Row {item.rowNumber}: {item.message}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/app/${organizationId}/inventory`}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-semibold text-white"
            >
              View decision readiness
            </Link>
            <button
              type="button"
              onClick={() => {
                resetPreviewState();
                setCsvText("");
                setFileName(null);
                setStep("upload");
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-200 px-5 text-sm font-medium text-zinc-700"
            >
              Import another file
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-zinc-950">
        {value}
      </dd>
    </div>
  );
}
