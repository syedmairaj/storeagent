import {
  organizationProfileOptions,
} from "@/lib/organizations/profile";

export type FirstStoreBootstrapFields = {
  name: string;
  currency: string;
  timezone: string;
};

export type OrganizationStoreBootstrapContext = {
  id: string;
  name: string;
  country_code: string | null;
  default_currency: string;
  timezone: string;
};

const NAME_MAX = 120;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isOrganizationUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function storeBootstrapOptions() {
  return organizationProfileOptions();
}

export function parseFirstStoreBootstrapInput(
  input: Partial<FirstStoreBootstrapFields>,
):
  | { ok: true; value: FirstStoreBootstrapFields }
  | { ok: false; error: string } {
  const name = (input.name ?? "").trim();
  const currency = (input.currency ?? "").trim().toUpperCase();
  const timezone = (input.timezone ?? "").trim();

  if (!name || name.length > NAME_MAX) {
    return {
      ok: false,
      error: "Enter a store name (1–120 characters).",
    };
  }

  if (!/^[A-Z]{3}$/.test(currency) || currency === "XXX") {
    return {
      ok: false,
      error: "Choose a valid three-letter currency.",
    };
  }

  if (!timezone) {
    return {
      ok: false,
      error: "Choose a valid IANA timezone.",
    };
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    return {
      ok: false,
      error: "Choose a valid IANA timezone.",
    };
  }

  return {
    ok: true,
    value: {
      name,
      currency,
      timezone,
    },
  };
}

export function mapFirstStoreBootstrapError(
  message: string | null | undefined,
): string {
  const text = message ?? "";

  if (text.includes("already has a store")) {
    return "This organization already has a store.";
  }

  if (text.includes("Organization profile is incomplete")) {
    return "Finish organization setup before creating a store.";
  }

  if (text.includes("membership required")) {
    return "You do not have access to this organization.";
  }

  if (text.includes("owner or admin")) {
    return "Only owners and admins can create the first store.";
  }

  if (text.includes("Organization not found")) {
    return "Organization not found.";
  }

  if (text.includes("Store name is invalid")) {
    return "Enter a store name (1–120 characters).";
  }

  if (text.includes("Currency is invalid")) {
    return "Choose a valid three-letter currency.";
  }

  if (text.includes("Timezone is invalid")) {
    return "Choose a valid IANA timezone.";
  }

  if (text.includes("Authentication required")) {
    return "Sign in again to continue.";
  }

  return "Unable to create your store right now.";
}
