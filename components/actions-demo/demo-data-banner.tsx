import {
  TriangleAlert,
} from "lucide-react";

export function DemoDataBanner() {
  return (
    <div
      role="status"
      className="sticky top-0 z-10 flex items-start gap-3 rounded-2xl border border-amber-200/90 bg-amber-50 px-4 py-3.5 text-amber-950 shadow-sm sm:items-center sm:px-5"
    >
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 sm:mt-0">
        <TriangleAlert
          className="size-4"
          aria-hidden="true"
        />
      </span>

      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-[-0.01em]">
          Synthetic demonstration data — not live inventory
        </p>

        <p className="mt-0.5 text-xs leading-5 text-amber-900/75">
          These recommendations are fixtures for UX review. They are not connected to merchant inventory, forecasts, or approvals.
        </p>
      </div>
    </div>
  );
}
