import {
  Eye,
  Megaphone,
  PackageMinus,
  RefreshCw,
} from "lucide-react";

import type {
  DemoActionType,
} from "@/lib/demo/m7-decision-demo-fixtures";

const ACTION_TYPE_META: Record<
  DemoActionType,
  {
    label: string;
    shortWhy: string;
    Icon: typeof RefreshCw;
    chipClassName: string;
  }
> = {
  REORDER: {
    label: "Reorder",
    shortWhy: "Bring stock up",
    Icon: RefreshCw,
    chipClassName:
      "border-sky-200 bg-sky-50 text-sky-900",
  },
  REDUCE: {
    label: "Reduce",
    shortWhy: "Lower exposure",
    Icon: PackageMinus,
    chipClassName:
      "border-orange-200 bg-orange-50 text-orange-950",
  },
  PROMOTE: {
    label: "Promote",
    shortWhy: "Clear / move",
    Icon: Megaphone,
    chipClassName:
      "border-emerald-200 bg-emerald-50 text-emerald-950",
  },
  WATCH: {
    label: "Watch",
    shortWhy: "Evidence incomplete",
    Icon: Eye,
    chipClassName:
      "border-zinc-300 bg-zinc-100 text-zinc-800",
  },
};

export function getActionTypeMeta(
  actionType: DemoActionType,
) {
  return ACTION_TYPE_META[actionType];
}

export function ActionTypeChip({
  actionType,
}: {
  actionType: DemoActionType;
}) {
  const meta =
    getActionTypeMeta(actionType);

  const Icon =
    meta.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${meta.chipClassName}`}
    >
      <Icon
        className="size-3"
        aria-hidden="true"
      />
      {meta.label}
    </span>
  );
}
