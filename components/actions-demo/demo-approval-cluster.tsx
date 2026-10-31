"use client";

import {
  useId,
  useState,
} from "react";

import {
  Info,
  Minus,
  Plus,
} from "lucide-react";

import type {
  OrganizationMemberRole,
} from "@/lib/commerce-domain/types";

import {
  demoActionShowsRecommendedQuantity,
  type DemoActionItem,
} from "@/lib/demo/m7-decision-demo-fixtures";

import {
  canInteractWithDemoApprovals,
  DEMO_NO_SAVE_MESSAGE,
  DEMO_VIEW_ONLY_MESSAGE,
  demoDismissControlLabel,
  demoPrimaryControlDescription,
  demoPrimaryControlLabel,
  demoQuantityValidationMessage,
  validateDemoReorderEditQuantity,
} from "@/lib/demo/m7-decision-demo-controls";

interface DemoApprovalClusterProps {
  action: DemoActionItem;
  role: OrganizationMemberRole;
}

export function DemoApprovalCluster({
  action,
  role,
}: DemoApprovalClusterProps) {
  const canDecide =
    canInteractWithDemoApprovals(
      role,
    );

  const feedbackId =
    useId();

  const [
    feedback,
    setFeedback,
  ] =
    useState<string | null>(null);

  const [
    quantityError,
    setQuantityError,
  ] =
    useState<string | null>(null);

  const showQuantityEditor =
    canDecide &&
    demoActionShowsRecommendedQuantity(
      action,
    );

  const originalQuantity =
    action.recommendedQuantity;

  const [
    draftQuantity,
    setDraftQuantity,
  ] =
    useState(
      originalQuantity != null
        ? String(originalQuantity)
        : "",
    );

  function announceNoSave() {
    setQuantityError(null);
    setFeedback(DEMO_NO_SAVE_MESSAGE);
  }

  function onPrimary() {
    if (
      !canDecide
    ) {
      return;
    }

    announceNoSave();
  }

  function onDismiss() {
    if (
      !canDecide
    ) {
      return;
    }

    announceNoSave();
  }

  function onApplyDemoEdit() {
    if (
      !canDecide ||
      originalQuantity == null
    ) {
      return;
    }

    const validation =
      validateDemoReorderEditQuantity(
        draftQuantity,
        originalQuantity,
      );

    if (
      !validation.ok
    ) {
      setFeedback(null);
      setQuantityError(
        demoQuantityValidationMessage(
          validation.reason,
        ),
      );
      return;
    }

    setQuantityError(null);
    setFeedback(DEMO_NO_SAVE_MESSAGE);
  }

  function adjustDraft(
    delta: number,
  ) {
    const current =
      Number.parseInt(
        draftQuantity,
        10,
      );

    const base =
      Number.isFinite(current) &&
      current > 0
        ? current
        : originalQuantity ?? 1;

    const next =
      Math.max(
        1,
        base + delta,
      );

    setDraftQuantity(
      String(next),
    );
    setQuantityError(null);
  }

  const primaryLabel =
    demoPrimaryControlLabel(
      action.actionType,
    );

  const dismissLabel =
    demoDismissControlLabel(
      action.actionType,
    );

  return (
    <section
      aria-label="Demonstration decision controls"
      className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50/90 px-4 py-4 sm:px-5 sm:py-5"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-white text-zinc-500 shadow-sm">
          <Info
            className="size-3.5"
            aria-hidden="true"
          />
        </span>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900">
            Demonstration controls
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Production approvals are disabled. Every interaction stays in local UI state only.
          </p>
        </div>
      </div>

      {!canDecide ? (
        <p
          role="status"
          className="mt-4 rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm text-zinc-600"
        >
          {DEMO_VIEW_ONLY_MESSAGE}. Analysts can inspect evidence but cannot run demonstration approve, edit, or dismiss actions.
        </p>
      ) : (
        <>
          {showQuantityEditor &&
            originalQuantity != null && (
              <div className="mt-5 rounded-2xl border border-zinc-200 bg-white px-4 py-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                      Suggested quantity
                    </p>
                    <p className="mt-1 text-2xl font-semibold tracking-[-0.03em] tabular-nums text-zinc-950">
                      {originalQuantity}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Original fixture recommendation (unchanged)
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <label
                    htmlFor={`demo-qty-${action.id}`}
                    className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500"
                  >
                    Edit quantity (local only)
                  </label>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() =>
                        adjustDraft(-1)
                      }
                      className="flex size-11 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 motion-safe:duration-150"
                    >
                      <Minus
                        className="size-4"
                        aria-hidden="true"
                      />
                    </button>

                    <input
                      id={`demo-qty-${action.id}`}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={draftQuantity}
                      onChange={(event) => {
                        setDraftQuantity(
                          event.target.value,
                        );
                        setQuantityError(null);
                      }}
                      aria-invalid={
                        quantityError != null
                      }
                      aria-describedby={
                        quantityError
                          ? `${feedbackId}-qty-error`
                          : feedbackId
                      }
                      className="h-11 w-24 rounded-xl border border-zinc-200 bg-white px-3 text-center text-sm font-semibold tabular-nums text-zinc-950 outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                    />

                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() =>
                        adjustDraft(1)
                      }
                      className="flex size-11 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 motion-safe:duration-150"
                    >
                      <Plus
                        className="size-4"
                        aria-hidden="true"
                      />
                    </button>

                    <button
                      type="button"
                      onClick={onApplyDemoEdit}
                      className="min-h-11 rounded-full border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 motion-safe:duration-150"
                    >
                      Apply demo edit
                    </button>
                  </div>

                  {quantityError && (
                    <p
                      id={`${feedbackId}-qty-error`}
                      role="alert"
                      className="mt-2 text-xs leading-5 text-amber-800"
                    >
                      {quantityError}
                    </p>
                  )}
                </div>
              </div>
            )}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={onPrimary}
              aria-describedby={feedbackId}
              title={demoPrimaryControlDescription(
                action.actionType,
              )}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 motion-safe:duration-150"
            >
              {primaryLabel}
            </button>

            <button
              type="button"
              onClick={onDismiss}
              aria-describedby={feedbackId}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-300 bg-white px-5 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 motion-safe:duration-150"
            >
              {dismissLabel}
            </button>
          </div>

          <p
            id={feedbackId}
            className="sr-only"
          >
            {demoPrimaryControlDescription(
              action.actionType,
            )}{" "}
            {DEMO_NO_SAVE_MESSAGE}
          </p>
        </>
      )}

      {feedback && (
        <p
          role="status"
          aria-live="polite"
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm font-medium text-amber-950 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150 motion-reduce:animate-none"
        >
          {feedback}
        </p>
      )}
    </section>
  );
}
