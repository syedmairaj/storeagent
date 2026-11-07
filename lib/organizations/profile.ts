export type OrganizationProfileFields = {
  name: string;
  countryCode: string;
  defaultCurrency: string;
  timezone: string;
};

export type OrganizationProfileRecord = {
  id: string;
  name: string;
  country_code: string | null;
  default_currency: string;
  timezone: string;
};

const NAME_MAX = 120;

const COMMON_CURRENCIES = [
  "AED",
  "AUD",
  "CAD",
  "CHF",
  "EUR",
  "GBP",
  "INR",
  "JPY",
  "SAR",
  "SGD",
  "USD",
] as const;

const COMMON_COUNTRIES = [
  { code: "AE", label: "United Arab Emirates" },
  { code: "AU", label: "Australia" },
  { code: "CA", label: "Canada" },
  { code: "DE", label: "Germany" },
  { code: "GB", label: "United Kingdom" },
  { code: "IN", label: "India" },
  { code: "SG", label: "Singapore" },
  { code: "US", label: "United States" },
] as const;

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
] as const;

export function organizationProfileOptions() {
  return {
    currencies: COMMON_CURRENCIES,
    countries: COMMON_COUNTRIES,
    timezones: COMMON_TIMEZONES,
  };
}

export function isOrganizationProfileIncomplete(
  organization: Pick<
    OrganizationProfileRecord,
    "country_code" | "default_currency"
  >,
): boolean {
  return (
    organization.country_code == null ||
    organization.default_currency === "XXX"
  );
}

export function parseOrganizationProfileInput(
  input: Partial<OrganizationProfileFields>,
):
  | { ok: true; value: OrganizationProfileFields }
  | { ok: false; error: string } {
  const name = (input.name ?? "").trim();
  const countryCode = (input.countryCode ?? "").trim().toUpperCase();
  const defaultCurrency = (input.defaultCurrency ?? "").trim().toUpperCase();
  const timezone = (input.timezone ?? "").trim();

  if (!name || name.length > NAME_MAX) {
    return {
      ok: false,
      error: "Enter an organization name (1–120 characters).",
    };
  }

  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return {
      ok: false,
      error: "Choose a valid two-letter country code.",
    };
  }

  if (!/^[A-Z]{3}$/.test(defaultCurrency) || defaultCurrency === "XXX") {
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
      countryCode,
      defaultCurrency,
      timezone,
    },
  };
}
