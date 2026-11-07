"use server";

import { completePasswordRecovery } from "@/lib/auth/password-recovery";

export type RecoveryActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function completePasswordRecoveryAction(input: {
  password: string;
  confirmPassword: string;
}): Promise<RecoveryActionResult> {
  if (input.password !== input.confirmPassword) {
    return { ok: false, error: "Passwords do not match." };
  }

  return completePasswordRecovery({ password: input.password });
}
