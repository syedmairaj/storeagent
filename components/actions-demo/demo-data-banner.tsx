import {
  TriangleAlert,
} from "lucide-react";

/**
 * Sticky synthetic disclosure for Actions.
 * Height is intentionally compact below lg so filter sticky offsets stay reliable
 * at 320–1024 without hiding the safety warning.
 */
export function DemoDataBanner() {
  return (
    <div
      role="status"
      className="sticky top-16 z-[15] flex w-full min-w-0 max-w-full items-start gap-2 rounded-xl border border-amber-200/90 bg-amber-50/95 px-3 py-1.5 text-amber-950 shadow-sm backdrop-blur-sm sm:items-center sm:gap-2.5 sm:rounded-2xl sm:px-4 sm:py-2.5 lg:top-0 lg:px-5 lg:py-3.5"
    >
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800 sm:mt-0 sm:size-8 sm:rounded-xl lg:size-9">
        <TriangleAlert
          className="size-3.5 sm:size-4"
          aria-hidden="true"
        />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-snug tracking-[-0.01em] sm:text-sm">
          Synthetic demonstration data — not live inventory
        </p>

        <p className="mt-0.5 text-[11px] leading-4 text-amber-900/75 sm:leading-5">
          Fixture recommendations only — not live inventory, forecasts, or approvals.
        </p>
      </div>
    </div>
  );
}
