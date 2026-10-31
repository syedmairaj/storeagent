import {
  redirect,
} from "next/navigation";

import {
  DemoDataBanner,
} from "@/components/actions-demo/demo-data-banner";

import {
  ActionsDemoWorkspace,
} from "@/components/actions-demo/actions-demo-workspace";

import {
  requireAppIdentity,
} from "@/lib/auth/app-route";

import {
  getM7DecisionDemoFixtureRoot,
  loadM7DecisionDemoDataset,
} from "@/lib/demo/m7-decision-demo-fixtures";

import {
  resolveServerOrganizationContext,
} from "@/lib/tenancy/server-organization-context";

export default async function OrganizationActionsDemoPage({
  params,
}: {
  params: Promise<{
    organizationId: string;
  }>;
}) {
  const identity =
    await requireAppIdentity();

  const {
    organizationId,
  } =
    await params;

  // Membership is also enforced by the parent layout; resolve again for role chrome.
  const resolution =
    await resolveServerOrganizationContext(
      identity,
      organizationId,
    );

  if (
    !resolution.ok
  ) {
    redirect(
      "/app?tenant_error=organization_access_denied",
    );
  }

  // Fixtures are synthetic only — organizationId is unused for decision data.
  const loaded =
    loadM7DecisionDemoDataset(
      getM7DecisionDemoFixtureRoot(),
    );

  return (
    <div className="space-y-6">
      <DemoDataBanner />

      {loaded.ok ? (
        <ActionsDemoWorkspace
          dataset={loaded.dataset}
          role={resolution.context.role}
        />
      ) : (
        <DemoAttestationError
          reason={loaded.reason}
        />
      )}
    </div>
  );
}

function DemoAttestationError({
  reason,
}: {
  reason: "missing_attestation" | "empty_actions";
}) {
  return (
    <div
      role="alert"
      className="rounded-3xl border border-zinc-200 bg-white px-7 py-12 shadow-sm sm:px-9"
    >
      <p className="text-sm font-medium text-zinc-500">
        Actions demonstration
      </p>

      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-zinc-950">
        Demonstration data unavailable
      </h1>

      <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-600">
        {reason === "missing_attestation"
          ? "Synthetic demonstration attestation is missing. StoreAgent will not render unverified demo actions."
          : "The demonstration fixture set is empty. No decision rows are shown."}
      </p>
    </div>
  );
}
