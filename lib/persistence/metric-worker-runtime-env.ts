import "server-only";

/**
 * M5-HR3.2a — Preview metric-worker execution guard.
 *
 * Vercel sets `VERCEL_ENV` to `production` | `preview` | `development`.
 * When the value is exactly `preview`, metric recompute/rollover workers
 * must remain disabled even if `METRIC_*_WORKER_ENABLED=1` and Production
 * Supabase credentials are accidentally present on the Preview deployment.
 *
 * Decision authority:
 * docs/M5_HR3_2_VERCEL_DEPLOYMENT_READINESS.md §11.
 *
 * Rules:
 * - Infer runtime **only** from `env.VERCEL_ENV` (exact string `preview`).
 * - Do not infer from process mode flags, HTTP headers, User-Agent, or DB URLs.
 * - Local macOS (`VERCEL_ENV` unset) and Production keep existing ENABLE
 *   semantics so intentional local ENABLE=1 tests still work.
 *
 * Limitation (intentional):
 * - Missing, empty, or unknown `VERCEL_ENV` values are **not** treated as
 *   verified Production. They only fail the Preview equality check, so
 *   ENABLE=`1` may still activate (same as local). This guard hard-blocks
 *   exact `preview` only; it is not a positive Production attestation.
 * - Rely on Vercel injecting `VERCEL_ENV=preview` on Preview deployments,
 *   plus operator ENABLE/env scoping, for defense in depth.
 */

export const VERCEL_PREVIEW_ENV = "preview";

/**
 * True only when `VERCEL_ENV` is exactly `"preview"`.
 * Absent, empty, `production`, `development`, or any other value → false
 * (not Preview — **not** a claim that the runtime is Production).
 */
export function isVercelPreviewRuntime(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return env.VERCEL_ENV === VERCEL_PREVIEW_ENV;
}

/**
 * Resolve the effective worker ENABLE flag after the Preview hard-disable.
 *
 * Preview → always false (treat as unset).
 * Otherwise → true only when the family ENABLE env is exactly `"1"`.
 *
 * `Otherwise` includes unset/unknown `VERCEL_ENV`; that path is **not**
 * a verified-Production attestation (see file limitation note).
 */
export function isMetricWorkerEnvEnabled(
  env: Readonly<Record<string, string | undefined>>,
  enabledFlag: string | undefined,
): boolean {
  if (isVercelPreviewRuntime(env)) {
    return false;
  }

  return enabledFlag === "1";
}
