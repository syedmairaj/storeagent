"use server";

import {
  ensureCurrentUserProvisioned,
  UserProvisioningError,
} from "@/lib/provisioning/current-user";
import {
  parseOrganizationProfileInput,
  type OrganizationProfileFields,
} from "@/lib/organizations/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Trusted post-session provisioning for password / restored sessions.
 * Idempotent: existing members receive created=false and no membership changes.
 */
export async function provisionAuthenticatedUserAction(): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        ok: false,
        error: "Sign in again to continue.",
      };
    }

    await ensureCurrentUserProvisioned(supabase);
    return { ok: true };
  } catch (cause) {
    if (cause instanceof UserProvisioningError) {
      return {
        ok: false,
        error: "Unable to prepare your StoreAgent workspace.",
      };
    }

    return {
      ok: false,
      error: "Unable to prepare your StoreAgent workspace.",
    };
  }
}

export async function completeOrganizationProfileAction(input: {
  organizationId: string;
  profile: OrganizationProfileFields;
}): Promise<ActionResult> {
  const parsed = parseOrganizationProfileInput(input.profile);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const organizationId = input.organizationId?.trim();
  if (
    !organizationId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      organizationId,
    )
  ) {
    return { ok: false, error: "Organization is required." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc(
      "complete_current_user_organization_profile",
      {
        p_organization_id: organizationId,
        p_name: parsed.value.name,
        p_country_code: parsed.value.countryCode,
        p_default_currency: parsed.value.defaultCurrency,
        p_timezone: parsed.value.timezone,
      },
    );

    if (error) {
      return {
        ok: false,
        error:
          error.message.includes("already complete")
            ? "This organization is already set up."
            : "Unable to save organization details.",
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Unable to save organization details.",
    };
  }
}
