import "server-only";

import type {
  SupabaseClient,
} from "@supabase/supabase-js";

export interface UserProvisioningResult {
  readonly created:
    boolean;

  readonly organizationId:
    string | null;
}

export class UserProvisioningError
  extends Error {
  constructor() {
    super(
      "Unable to provision authenticated user.",
    );

    this.name =
      "UserProvisioningError";
  }
}

function parseProvisioningResult(
  value: unknown,
): UserProvisioningResult {
  if (
    !Array.isArray(value) ||
    value.length !== 1
  ) {
    throw new UserProvisioningError();
  }

  const row =
    value[0];

  if (
    typeof row !==
      "object" ||
    row === null ||
    Array.isArray(row)
  ) {
    throw new UserProvisioningError();
  }

  const record =
    row as Record<
      string,
      unknown
    >;

  if (
    typeof record.created !==
      "boolean"
  ) {
    throw new UserProvisioningError();
  }

  const organizationId =
    record.organization_id;

  if (
    organizationId !== null &&
    typeof organizationId !==
      "string"
  ) {
    throw new UserProvisioningError();
  }

  if (
    record.created &&
    (
      typeof organizationId !==
        "string" ||
      organizationId.trim()
        .length === 0
    )
  ) {
    throw new UserProvisioningError();
  }

  if (
    !record.created &&
    organizationId !== null
  ) {
    throw new UserProvisioningError();
  }

  return {
    created:
      record.created,

    organizationId,
  };
}

export async function ensureCurrentUserProvisioned(
  supabase:
    SupabaseClient,
): Promise<UserProvisioningResult> {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      "ensure_current_user_provisioned",
    );

  if (
    error
  ) {
    throw new UserProvisioningError();
  }

  return parseProvisioningResult(
    data,
  );
}
