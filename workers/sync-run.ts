import type {
  SyncRunStatus,
} from "@/lib/commerce-domain/types";

import type {
  WorkerFailureClass,
  WorkerJobStatus,
} from "./types";

export interface SyncRunExecutionIdentity {
  syncRunId: string;
  integrationId: string;

  organizationId: string;
  storeId: string | null;

  /**
   * Canonical SyncRun idempotency identity.
   *
   * This remains owned by the commerce domain.
   */
  syncRunIdempotencyKey: string;
}

export type SyncRunWorkerOutcome =
  | {
      kind: "started";
    }
  | {
      kind: "completed";
      completedWithErrors: boolean;
    }
  | {
      kind: "terminal_failure";
      failureClass: WorkerFailureClass;
    }
  | {
      kind: "cancelled";
    };

/**
 * Worker infrastructure status does not automatically own SyncRun status.
 *
 * This helper intentionally maps only explicit synchronization outcomes.
 */
export function syncRunStatusForWorkerOutcome(
  outcome: SyncRunWorkerOutcome,
): SyncRunStatus {
  switch (outcome.kind) {
    case "started":
      return "running";

    case "completed":
      return outcome.completedWithErrors
        ? "completed_with_errors"
        : "completed";

    case "terminal_failure":
      return "failed";

    case "cancelled":
      return "cancelled";
  }
}

/**
 * Infrastructure states that must not directly force a SyncRun status.
 *
 * queued/claimed/retry_wait describe worker execution mechanics,
 * not canonical synchronization business outcome.
 */
export function workerStatusMayDirectlyOwnSyncRunStatus(
  status: WorkerJobStatus,
): boolean {
  return (
    status === "running" ||
    status === "succeeded" ||
    status === "failed" ||
    status === "cancelled"
  );
}

function requireNonEmpty(
  value: string,
  field: string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `SyncRun orchestration ${field} must not be empty.`,
    );
  }

  return normalized;
}

export function validateSyncRunExecutionIdentity(
  identity: SyncRunExecutionIdentity,
): SyncRunExecutionIdentity {
  return {
    syncRunId:
      requireNonEmpty(
        identity.syncRunId,
        "syncRunId",
      ),

    integrationId:
      requireNonEmpty(
        identity.integrationId,
        "integrationId",
      ),

    organizationId:
      requireNonEmpty(
        identity.organizationId,
        "organizationId",
      ),

    storeId:
      identity.storeId === null
        ? null
        : requireNonEmpty(
            identity.storeId,
            "storeId",
          ),

    syncRunIdempotencyKey:
      requireNonEmpty(
        identity.syncRunIdempotencyKey,
        "syncRunIdempotencyKey",
      ),
  };
}

/**
 * StoreAgent keeps worker-job and SyncRun idempotency as separate
 * identities, but provider-sync orchestration must bind them
 * deterministically to the same logical synchronization request.
 */
export interface ProviderSyncIdempotencyBinding {
  workerJobIdempotencyKey: string;
  syncRunIdempotencyKey: string;
}

export function validateProviderSyncIdempotencyBinding(
  binding: ProviderSyncIdempotencyBinding,
): ProviderSyncIdempotencyBinding {
  return {
    workerJobIdempotencyKey:
      requireNonEmpty(
        binding.workerJobIdempotencyKey,
        "workerJobIdempotencyKey",
      ),

    syncRunIdempotencyKey:
      requireNonEmpty(
        binding.syncRunIdempotencyKey,
        "syncRunIdempotencyKey",
      ),
  };
}
