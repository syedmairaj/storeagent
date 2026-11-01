import {
  TriangleAlert,
} from "lucide-react";

export function DemoDataBanner() {
  return (
    <div
      role="status"
      className="sticky top-16 z-[15] flex w-full min-w-0 max-w-full items-start gap-2.5 rounded-2xl border border-amber-200/90 bg-amber-50/95 px-3.5 py-2 text-amber-950 shadow-sm backdrop-blur-sm sm:items-center sm:gap-3 sm:px-5 sm:py-3.5 lg:top-0"
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 sm:mt-0 sm:size-9">
        <TriangleAlert
          className="size-3.5 sm:size-4"
          aria-hidden="true"
        />
      </span>

      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-[-0.01em]">
          Synthetic demonstration data — not live inventory
        </p>

        <p className="mt-0.5 text-[11px] leading-4 text-amber-900/75 sm:text-xs sm:leading-5">
          Fixture recommendations only — not connected to merchant inventory, forecasts, or approvals.
        </p>
      </div>
    </div>
  );
}
