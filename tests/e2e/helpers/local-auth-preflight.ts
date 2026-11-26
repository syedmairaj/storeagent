import { spawnSync } from "node:child_process";

/**
 * Fail closed if the configured identity is absent from local auth.users.
 * Prevents accidental user creation via open local signup + magic-link.
 * Read-only. Local Postgres :55322 only.
 */
export function assertExistingLocalAuthUser(
  email: string,
): void {
  const normalized = email.trim().toLowerCase();
  if (
    !normalized.includes("@")
  ) {
    throw new Error(
      "E2E auth BLOCKED: invalid E2E email.",
    );
  }

  const sql = `SELECT count(*)::int FROM auth.users WHERE lower(email) = lower('${normalized.replace(/'/g, "''")}');`;
  const result = spawnSync(
    "psql",
    [
      "-h",
      "127.0.0.1",
      "-p",
      "55322",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-At",
      "-c",
      sql,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PGPASSWORD: "postgres",
      },
    },
  );

  if (
    result.status !== 0
  ) {
    throw new Error(
      [
        "E2E auth BLOCKED: unable to verify local auth.users (psql :55322).",
        (result.stderr || "").slice(0, 200),
      ].join(" "),
    );
  }

  const count = Number(
    (result.stdout || "").trim(),
  );
  if (
    count !== 1
  ) {
    throw new Error(
      [
        "E2E auth BLOCKED: configured E2E_EMAIL/M14_TEST_EMAIL is not an existing local Auth user.",
        "Harness refuses to send magic-link when identity is absent (local signup could create users).",
        "Set gitignored E2E_EMAIL to an owner-authorized existing local identity with snapstore membership.",
      ].join(" "),
    );
  }
}

/**
 * Read-only check: identity has RLS-visible membership to preferred/snapstore org.
 * Uses SQL as diagnostic only; final authority remains app RLS in the browser.
 */
export function readLocalOrgMembershipSummary(
  email: string,
): {
  orgCount: number;
  hasSnapstoreComplete: boolean;
  incompleteOnly: boolean;
} {
  const normalized = email.trim().toLowerCase();
  const sql = `
SELECT
  count(o.id)::int AS org_count,
  count(*) FILTER (
    WHERE o.name = 'snapstore'
      AND o.country_code IS NOT NULL
      AND o.default_currency <> 'XXX'
  )::int AS snap_complete,
  count(*) FILTER (
    WHERE o.country_code IS NULL OR o.default_currency = 'XXX'
  )::int AS incomplete_count
FROM auth.users u
LEFT JOIN public.organization_members m ON m.user_id = u.id
LEFT JOIN public.organizations o ON o.id = m.organization_id
WHERE lower(u.email) = lower('${normalized.replace(/'/g, "''")}');
`;
  const result = spawnSync(
    "psql",
    [
      "-h",
      "127.0.0.1",
      "-p",
      "55322",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-At",
      "-F",
      "|",
      "-c",
      sql,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PGPASSWORD: "postgres",
      },
    },
  );

  if (
    result.status !== 0
  ) {
    return {
      orgCount: 0,
      hasSnapstoreComplete: false,
      incompleteOnly: false,
    };
  }

  const [
    orgCount,
    snapComplete,
    incompleteCount,
  ] = (result.stdout || "")
    .trim()
    .split("|")
    .map((part) => Number(part));

  return {
    orgCount: orgCount || 0,
    hasSnapstoreComplete: (snapComplete || 0) > 0,
    incompleteOnly:
      (orgCount || 0) > 0 &&
      (incompleteCount || 0) === (orgCount || 0),
  };
}
