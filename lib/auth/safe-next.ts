import { safeAuthNextPath } from "@/lib/auth/redirect";

/** Application default after password authentication. */
export function safeAppNextPath(
  candidate: string | null | undefined,
): string {
  return safeAuthNextPath(candidate, "/app");
}
