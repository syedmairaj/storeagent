import {
  Eye,
  Megaphone,
  PackageMinus,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";

import type { DemoActionType } from "@/lib/demo/m7-decision-demo-fixtures";

export const DECISION_TYPE_UI: Record<
  DemoActionType,
  {
    label: string;
    shortPitch: string;
    Icon: LucideIcon;
    accent: string;
    chip: string;
    riskLabel: string;
  }
> = {
  REORDER: {
    label: "Reorder",
    shortPitch: "Protect product availability.",
    Icon: RefreshCw,
    accent: "bg-[var(--sa-insight)]",
    chip: "bg-[color-mix(in_srgb,var(--sa-insight)_18%,transparent)] text-[var(--sa-ink)]",
    riskLabel: "Stockout exposure",
  },
  REDUCE: {
    label: "Reduce",
    shortPitch: "Avoid excess inventory commitments.",
    Icon: PackageMinus,
    accent: "bg-[#e8a35c]",
    chip: "bg-[color-mix(in_srgb,#e8a35c_22%,transparent)] text-[var(--sa-ink)]",
    riskLabel: "Excess inventory",
  },
  PROMOTE: {
    label: "Promote",
    shortPitch: "Move slow or seasonal inventory deliberately.",
    Icon: Megaphone,
    accent: "bg-[var(--sa-signal)]",
    chip: "bg-[color-mix(in_srgb,var(--sa-signal)_28%,transparent)] text-[var(--sa-ink)]",
    riskLabel: "Aging / markdown pressure",
  },
  WATCH: {
    label: "Watch",
    shortPitch: "Hold when signals conflict or evidence is incomplete.",
    Icon: Eye,
    accent: "bg-[var(--sa-stone)]",
    chip: "bg-[var(--sa-stone)] text-[var(--sa-ink)]",
    riskLabel: "Premature commitment risk",
  },
};

export const DECISION_ORDER: DemoActionType[] = [
  "REORDER",
  "REDUCE",
  "PROMOTE",
  "WATCH",
];
