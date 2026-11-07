"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";

import {
  AuthAlert,
  AuthField,
  authControlClassName,
  authPrimaryButtonClassName,
} from "@/components/auth/auth-shell";
import { completeOrganizationProfileAction } from "@/lib/auth/actions";
import {
  organizationProfileOptions,
  parseOrganizationProfileInput,
} from "@/lib/organizations/profile";

export function OrganizationSetupForm({
  organizationId,
  initialName,
}: {
  organizationId: string;
  initialName: string;
}) {
  const router = useRouter();
  const options = organizationProfileOptions();
  const [name, setName] = useState(
    initialName === "My Organization" ? "" : initialName,
  );
  const [countryCode, setCountryCode] = useState("US");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [timezone, setTimezone] = useState("UTC");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = parseOrganizationProfileInput({
      name,
      countryCode,
      defaultCurrency,
      timezone,
    });

    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    startTransition(async () => {
      const result = await completeOrganizationProfileAction({
        organizationId,
        profile: parsed.value,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.replace(`/app/${organizationId}`);
      router.refresh();
    });
  }

  return (
    <form method="post" onSubmit={handleSubmit} className="space-y-5">
      <AuthField
        id="org-name"
        label="Organization name"
        hint="Use the trading name merchants will recognize in the workspace."
      >
        <input
          id="org-name"
          name="name"
          type="text"
          required
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={authControlClassName}
          placeholder="Harbor Goods Co."
        />
      </AuthField>

      <AuthField id="country" label="Country">
        <select
          id="country"
          name="countryCode"
          required
          value={countryCode}
          onChange={(event) => setCountryCode(event.target.value)}
          className={authControlClassName}
        >
          {options.countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.label} ({country.code})
            </option>
          ))}
        </select>
      </AuthField>

      <div className="grid gap-5 sm:grid-cols-2">
        <AuthField id="currency" label="Default currency">
          <select
            id="currency"
            name="defaultCurrency"
            required
            value={defaultCurrency}
            onChange={(event) => setDefaultCurrency(event.target.value)}
            className={authControlClassName}
          >
            {options.currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </AuthField>

        <AuthField id="timezone" label="Timezone">
          <select
            id="timezone"
            name="timezone"
            required
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            className={authControlClassName}
          >
            {options.timezones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </AuthField>
      </div>

      {error ? <AuthAlert>{error}</AuthAlert> : null}

      <button
        type="submit"
        disabled={pending}
        className={authPrimaryButtonClassName}
      >
        {pending ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Saving organization
          </>
        ) : (
          <>
            Continue to workspace
            <ArrowRight className="size-4" aria-hidden="true" />
          </>
        )}
      </button>
    </form>
  );
}
