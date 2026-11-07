"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import {
  AuthField,
  authControlClassName,
} from "@/components/auth/auth-shell";
import { cn } from "@/lib/utils";

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  hint,
  required = true,
  minLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder: string;
  hint?: string;
  required?: boolean;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? "Hide password" : "Show password";

  return (
    <AuthField id={id} label={label} hint={hint}>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(authControlClassName, "pr-12")}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 inline-flex w-12 items-center justify-center rounded-r-xl text-[var(--sa-ink-muted)] transition hover:text-[var(--sa-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sa-insight)] focus-visible:ring-inset"
          aria-label={toggleLabel}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </AuthField>
  );
}
