export interface SyncRunReplayIdentity {
  organizationId: string;
  integrationId: string;
  idempotencyKey: string;
}

export interface ExistingSyncRunReplayIdentity
  extends SyncRunReplayIdentity {
  id: string;
}

export type SyncRunReplayResult =
  | {
      disposition: "create";
      replayKey: string;
    }
  | {
      disposition: "idempotent";
      replayKey: string;
      syncRunId: string;
    };

function required(
  value: string,
  field: string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `${field} must not be empty.`,
    );
  }

  return normalized;
}

export function normalizeSyncRunReplayIdentity(
  identity: SyncRunReplayIdentity,
): SyncRunReplayIdentity {
  return {
    organizationId:
      required(
        identity.organizationId,
        "organizationId",
      ),

    integrationId:
      required(
        identity.integrationId,
        "integrationId",
      ),

    idempotencyKey:
      required(
        identity.idempotencyKey,
        "idempotencyKey",
      ),
  };
}

export function buildSyncRunReplayKey(
  identity: SyncRunReplayIdentity,
): string {
  const normalized =
    normalizeSyncRunReplayIdentity(
      identity,
    );

  return JSON.stringify([
    normalized.organizationId,
    normalized.integrationId,
    normalized.idempotencyKey,
  ]);
}

export function assessSyncRunReplay(
  existing:
    ExistingSyncRunReplayIdentity | null,

  incoming:
    SyncRunReplayIdentity,
): SyncRunReplayResult {
  const replayKey =
    buildSyncRunReplayKey(
      incoming,
    );

  if (existing === null) {
    return {
      disposition:
        "create",
      replayKey,
    };
  }

  const existingKey =
    buildSyncRunReplayKey(
      existing,
    );

  if (
    existingKey !==
    replayKey
  ) {
    throw new Error(
      "Existing sync run does not match the incoming replay identity.",
    );
  }

  const syncRunId =
    required(
      existing.id,
      "syncRunId",
    );

  return {
    disposition:
      "idempotent",
    replayKey,
    syncRunId,
  };
}
