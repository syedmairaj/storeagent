"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { ChevronDown, LoaderCircle, MessageCircleQuestion } from "lucide-react";

import { explainInventorySkuAction } from "@/lib/inventory-explainer/actions";
import { classifyGuidanceSituation } from "@/lib/inventory-explainer/guidance-situation";
import {
  getInventoryExplainerQuestion,
  rankInventoryExplainerQuestions,
} from "@/lib/inventory-explainer/questions";
import type {
  InventoryExplainerAnswer,
  InventoryExplainerQuestionId,
} from "@/lib/inventory-explainer/types";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import { cn } from "@/lib/utils";

type PanelState =
  | { kind: "idle" }
  | { kind: "loading"; questionId: InventoryExplainerQuestionId }
  | {
      kind: "ready";
      questionId: InventoryExplainerQuestionId;
      answer: InventoryExplainerAnswer;
    }
  | {
      kind: "error";
      questionId: InventoryExplainerQuestionId;
      message: string;
    };

export function SkuExplainerPanel({
  row,
  organizationId,
  stockObservationsStale,
}: {
  row: MerchantInventoryIntelligenceRow;
  organizationId: string;
  stockObservationsStale: boolean;
}) {
  const headingId = useId();
  const [state, setState] = useState<PanelState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const guidance = useMemo(
    () =>
      classifyGuidanceSituation({
        row,
        stockObservationsStale,
        incomingTrust: "unknown",
      }),
    [row, stockObservationsStale],
  );

  const rankedQuestions = useMemo(
    () =>
      rankInventoryExplainerQuestions({
        rankedQuestionIds: guidance.rankedQuestionIds,
      }),
    [guidance.rankedQuestionIds],
  );

  const primary = rankedQuestions[0];
  const secondary = rankedQuestions.slice(1);

  function ask(questionId: InventoryExplainerQuestionId) {
    setEvidenceOpen(false);
    setState({ kind: "loading", questionId });
    startTransition(async () => {
      const result = await explainInventorySkuAction({
        organizationId,
        storeId: row.storeId,
        locationId: row.locationId,
        variantId: row.variantId,
        questionId,
        stockObservationsStaleHint: stockObservationsStale,
      });

      if (!result.ok) {
        setState({
          kind: "error",
          questionId,
          message: result.error,
        });
        return;
      }

      setState({
        kind: "ready",
        questionId,
        answer: result.answer,
      });
      setEvidenceOpen(false);
    });
  }

  const activeQuestionId = state.kind === "idle" ? null : state.questionId;

  return (
    <section
      className="rounded-2xl border border-zinc-200 bg-gradient-to-b from-zinc-50 to-white p-3 sm:p-4"
      data-inspector-section="explainer"
      data-sku-explainer="true"
      data-sku-explainer-situation={guidance.id}
      aria-labelledby={headingId}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700"
          aria-hidden="true"
        >
          <MessageCircleQuestion className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id={headingId}
            className="text-sm font-semibold tracking-[-0.01em] text-zinc-950"
          >
            Ask about this SKU
          </h3>
          <p className="mt-0.5 text-xs leading-5 text-zinc-500">
            Specific guidance from trusted evidence — not a chatbot, forecast, or
            buy action.
          </p>
        </div>
      </div>

      {primary ? (
        <div className="mt-3" data-sku-explainer-primary="true">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Suggested for this SKU
          </p>
          <QuestionButton
            question={primary}
            selected={activeQuestionId === primary.id}
            loading={
              pending &&
              state.kind === "loading" &&
              state.questionId === primary.id
            }
            disabled={pending}
            primary
            onAsk={() => ask(primary.id)}
          />
        </div>
      ) : null}

      {secondary.length > 0 ? (
        <div className="mt-2">
          <button
            type="button"
            className="inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold text-zinc-700 outline-none hover:border-zinc-300 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
            aria-expanded={moreOpen}
            data-sku-explainer-more-toggle="true"
            onClick={() => setMoreOpen((v) => !v)}
          >
            More questions
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 transition-transform",
                moreOpen ? "rotate-0" : "-rotate-90",
              )}
              aria-hidden="true"
            />
          </button>
          {moreOpen ? (
            <ul
              className="mt-2 flex flex-col gap-2"
              data-sku-explainer-questions="true"
            >
              {secondary.map((question) => (
                <li key={question.id}>
                  <QuestionButton
                    question={question}
                    selected={activeQuestionId === question.id}
                    loading={
                      pending &&
                      state.kind === "loading" &&
                      state.questionId === question.id
                    }
                    disabled={pending}
                    onAsk={() => ask(question.id)}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div
        className="mt-3"
        aria-live="polite"
        data-sku-explainer-result="true"
      >
        {state.kind === "loading" ? (
          <p
            className="flex items-center gap-2 text-sm text-zinc-600"
            data-sku-explainer-loading="true"
          >
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Preparing SKU-specific guidance…
          </p>
        ) : null}

        {state.kind === "error" ? (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-6 text-amber-950"
            data-sku-explainer-error="true"
            role="alert"
          >
            {state.message}
          </div>
        ) : null}

        {state.kind === "ready" ? (
          <AnswerCard
            answer={state.answer}
            questionLabel={getInventoryExplainerQuestion(state.questionId).label}
            evidenceOpen={evidenceOpen}
            onToggleEvidence={() => setEvidenceOpen((v) => !v)}
          />
        ) : null}
      </div>
    </section>
  );
}

function QuestionButton({
  question,
  selected,
  loading,
  disabled,
  primary = false,
  onAsk,
}: {
  question: { id: InventoryExplainerQuestionId; label: string; hint: string };
  selected: boolean;
  loading: boolean;
  disabled: boolean;
  primary?: boolean;
  onAsk: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "mt-1.5 flex w-full min-h-11 items-start gap-2 rounded-xl border px-3 py-2.5 text-left outline-none transition-[border-color,background-color,box-shadow]",
        "focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2",
        selected
          ? "border-zinc-900 bg-zinc-950 text-white"
          : primary
            ? "border-zinc-300 bg-white text-zinc-900 shadow-sm hover:border-zinc-400"
            : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50",
      )}
      aria-pressed={selected}
      aria-busy={loading || undefined}
      disabled={disabled}
      data-sku-explainer-question={question.id}
      data-sku-explainer-question-priority={primary ? "primary" : "secondary"}
      onClick={onAsk}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-5">
          {question.label}
        </span>
        <span
          className={cn(
            "mt-0.5 block text-xs leading-4",
            selected ? "text-zinc-300" : "text-zinc-500",
          )}
        >
          {question.hint}
        </span>
      </span>
      {loading ? (
        <LoaderCircle
          className="mt-0.5 size-4 shrink-0 animate-spin"
          aria-hidden="true"
        />
      ) : null}
    </button>
  );
}

function AnswerCard({
  answer,
  questionLabel,
  evidenceOpen,
  onToggleEvidence,
}: {
  answer: InventoryExplainerAnswer;
  questionLabel: string;
  evidenceOpen: boolean;
  onToggleEvidence: () => void;
}) {
  const isAbstain = answer.status === "abstained";

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-3",
        isAbstain
          ? "border-amber-200 bg-amber-50"
          : "border-zinc-200 bg-white",
      )}
      data-sku-explainer-answer="true"
      data-sku-explainer-status={answer.status}
      data-sku-explainer-generator={answer.generator}
    >
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
        {questionLabel}
      </p>
      <p
        className="mt-1 text-sm font-medium leading-6 text-zinc-950"
        data-sku-explainer-merchant-answer="true"
      >
        {answer.merchantAnswer}
      </p>

      {answer.abstentionReason ? (
        <p
          className="mt-1.5 text-xs leading-5 text-amber-900"
          data-sku-explainer-abstention="true"
        >
          {answer.abstentionReason}
        </p>
      ) : null}

      {answer.nextSteps.length > 0 ? (
        <div className="mt-3" data-sku-explainer-next-steps="true">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Verify next
          </p>
          <ol className="mt-1 list-decimal space-y-1 pl-4">
            {answer.nextSteps.map((step) => (
              <li
                key={step.code}
                className="text-xs leading-5 text-zinc-700"
                data-sku-explainer-next-step={step.code}
              >
                {step.label}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {answer.citations.length > 0 ? (
        <div className="mt-3">
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-zinc-700 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
            aria-expanded={evidenceOpen}
            data-sku-explainer-evidence-toggle="true"
            onClick={onToggleEvidence}
          >
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                evidenceOpen ? "rotate-0" : "-rotate-90",
              )}
              aria-hidden="true"
            />
            Supporting evidence & dates
          </button>
          {evidenceOpen ? (
            <ul
              className="mt-2 space-y-2 border-t border-zinc-100 pt-2"
              data-sku-explainer-citations="true"
            >
              {answer.citations.map((citation) => (
                <li
                  key={`${citation.factId}:${citation.source}`}
                  className="text-xs leading-5 text-zinc-600"
                  data-sku-explainer-citation={citation.factId}
                >
                  <span className="font-medium text-zinc-800">
                    {citation.label}:
                  </span>{" "}
                  {citation.value}
                  {citation.asOf ? (
                    <span className="mt-0.5 block text-[0.7rem] text-zinc-400">
                      As of {citation.asOf}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
