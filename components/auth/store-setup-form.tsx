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
import { createFirstOrganizationStoreAction } from "@/lib/auth/actions";
import {
  parseFirstStoreBootstrapInput,
  storeBootstrapOptions,
} from "@/lib/stores/bootstrap";

export function StoreSetupForm({
  organizationId,
  organizationName,
  inheritedCurrency,
  inheritedTimezone,
}: {
  organizationId: string;
  organizationName: string;
  inheritedCurrency: string;
  inheritedTimezone: string;
}) {
  const router = useRouter();
  const options = storeBootstrapOptions();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState(inheritedCurrency);
  const [timezone, setTimezone] = useState(inheritedTimezone);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = parseFirstStoreBootstrapInput({
      name,
      currency,
      timezone,
    });

    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    startTransition(async () => {
      const result = await createFirstOrganizationStoreAction({
        organizationId,
        store: parsed.value,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.replace(`/app/${organizationId}/inventory/import`);
      router.refresh();
    });
  }

  return (
    <form method="post" onSubmit={handleSubmit} className="space-y-5">
      <AuthField
        id="store-name"
        label="Store name"
        hint={`This store belongs to ${organizationName}. Integrations stay for a later step.`}
      >
        <input
          id="store-name"
          name="name"
          type="text"
          required
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={authControlClassName}
          placeholder="Harbor Goods — Downtown"
          autoComplete="organization"
        />
      </AuthField>

      <div className="grid gap-5 sm:grid-cols-2">
        <AuthField
          id="store-currency"
          label="Store currency"
          hint="Inherited from your organization. Change only if this store differs."
        >
          <select
            id="store-currency"
            name="currency"
            required
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            className={authControlClassName}
          >
            {(options.currencies as readonly string[]).includes(currency) ? null : (
              <option value={currency}>{currency}</option>
            )}
            {options.currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </AuthField>

        <AuthField
          id="store-timezone"
          label="Store timezone"
          hint="Inherited from your organization profile."
        >
          <select
            id="store-timezone"
            name="timezone"
            required
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            className={authControlClassName}
          >
            {(options.timezones as readonly string[]).includes(timezone) ? null : (
              <option value={timezone}>{timezone}</option>
            )}
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
            Creating store
          </>
        ) : (
          <>
            Create store and continue
            <ArrowRight className="size-4" aria-hidden="true" />
          </>
        )}
      </button>
    </form>
  );
}
