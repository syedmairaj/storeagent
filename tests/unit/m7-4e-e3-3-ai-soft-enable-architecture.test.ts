import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

function read(
  relative: string,
): string {
  return fs.readFileSync(
    path.join(ROOT, relative),
    "utf8",
  );
}

function listSourceFiles(
  relativeRoot: string,
): string[] {
  const absolute =
    path.join(ROOT, relativeRoot);

  if (
    !fs.existsSync(absolute)
  ) {
    return [];
  }

  const out: string[] = [];

  function walk(
    dir: string,
  ): void {
    for (
      const entry of fs.readdirSync(
        dir,
        {
          withFileTypes: true,
        },
      )
    ) {
      if (
        entry.isDirectory()
      ) {
        walk(
          path.join(
            dir,
            entry.name,
          ),
        );
        continue;
      }

      if (
        ![".ts", ".tsx"].includes(
          path.extname(
            entry.name,
          ),
        )
      ) {
        continue;
      }

      out.push(
        path.relative(
          ROOT,
          path.join(
            dir,
            entry.name,
          ),
        ),
      );
    }
  }

  walk(
    absolute,
  );

  return out.sort();
}

const PROVIDER_FRAGMENTS = [
  "openai",
  "@anthropic",
  "@google/generative-ai",
  "api.openai.com",
] as const;

describe("M7.4e E3.3 soft-enable architecture", () => {
  it("defaults server enablement OFF with empty allowlist in source", () => {
    const enablement =
      read(
        "lib/decision-brief/ai/server-enablement.ts",
      );

    expect(
      enablement,
    ).toContain(
      "enabled: false",
    );
    expect(
      enablement,
    ).toContain(
      "organizationAllowlist: []",
    );
    expect(
      enablement,
    ).toContain(
      "server_resolved_config",
    );
  });

  it("keeps AI adapters server-only and out of client Actions components", () => {
    for (
      const file of listSourceFiles(
        "components/actions-demo",
      )
    ) {
      const source =
        read(
          file,
        );

      expect(
        source,
        file,
      ).not.toContain(
        "decision-brief/ai",
      );
      expect(
        source,
        file,
      ).not.toContain(
        "createOfflineStubAdapter",
      );
      expect(
        source,
        file,
      ).not.toContain(
        "openai",
      );
    }

    const panel =
      read(
        "components/actions-demo/decision-brief-panel.tsx",
      );

    expect(
      panel,
    ).toContain(
      "precomposedBrief",
    );
    expect(
      panel,
    ).toContain(
      "composeDemoDecisionBrief",
    );
    expect(
      panel,
    ).toContain(
      "AI-assisted explanation",
    );
  });

  it("allows server Actions page to resolve soft-enable without live providers", () => {
    const page =
      read(
        "app/(app)/app/[organizationId]/actions/page.tsx",
      );

    expect(
      page,
    ).toContain(
      "resolveServerAiExplanationEnablement",
    );
    expect(
      page,
    ).toContain(
      "composeAllDemoDecisionBriefsWithAi",
    );
    expect(
      page,
    ).toContain(
      "resolveServerOrganizationContext",
    );

    for (
      const fragment of PROVIDER_FRAGMENTS
    ) {
      expect(
        page.toLowerCase(),
      ).not.toContain(
        fragment.toLowerCase(),
      );
    }
  });

  it("bans live network adapters and provider SDKs in AI modules", () => {
    for (
      const file of listSourceFiles(
        "lib/decision-brief/ai",
      )
    ) {
      const source =
        read(
          file,
        );

      for (
        const fragment of PROVIDER_FRAGMENTS
      ) {
        expect(
          source.toLowerCase(),
          `${file} ${fragment}`,
        ).not.toContain(
          fragment.toLowerCase(),
        );
      }

      expect(
        source,
        file,
      ).not.toMatch(
        /\bfetch\s*\(/,
      );
    }

    const orchestrate =
      read(
        "lib/decision-brief/ai/orchestrate.ts",
      );

    expect(
      orchestrate,
    ).toContain(
      "supportsLiveNetwork",
    );
    expect(
      orchestrate,
    ).toContain(
      "offline_stub",
    );
    expect(
      orchestrate,
    ).toContain(
      "recorded_replay",
    );
    expect(
      orchestrate,
    ).toContain(
      '"live_provider"',
    );
  });

  it("keeps workers/explain-actions unimplemented and omits M7.3 RPCs from AI path", () => {
    expect(
      read(
        "workers/explain-actions.ts",
      ).trim().length,
    ).toBe(
      0,
    );

    for (
      const file of listSourceFiles(
        "lib/decision-brief/ai",
      )
    ) {
      const source =
        read(
          file,
        );

      for (
        const fragment of [
          "transition_inventory_action_merchant",
          "persistInventoryAction",
          "createSupabaseAdminClient",
          "SERVICE_ROLE",
          ".rpc(",
        ] as const
      ) {
        expect(
          source,
          `${file} ${fragment}`,
        ).not.toContain(
          fragment,
        );
      }
    }
  });

  it("keeps privacy-safe diagnostics free of prose dumps", () => {
    const privacy =
      read(
        "lib/decision-brief/ai/privacy-safe-diagnostics.ts",
      );

    expect(
      privacy,
    ).toContain(
      "groundingHash",
    );
    expect(
      privacy,
    ).toContain(
      "Forbidden by default",
    );
    expect(
      privacy,
    ).not.toContain(
      "whyNowSummary",
    );
  });

  it("removes process-global test override and keeps merge off the public barrel", () => {
    const enablement =
      read(
        "lib/decision-brief/ai/server-enablement.ts",
      );

    expect(
      enablement,
    ).not.toContain(
      "testOnlyConfigOverride",
    );
    expect(
      enablement,
    ).not.toContain(
      "setTestOnlyServerAiExplanationConfig",
    );

    const barrel =
      read(
        "lib/decision-brief/ai/index.ts",
      );

    expect(
      barrel,
    ).not.toContain(
      "setTestOnlyServerAiExplanationConfig",
    );
    expect(
      barrel,
    ).not.toMatch(
      /export\s*\{[^}]*mergeAiValidatedBrief/,
    );
    expect(
      barrel,
    ).not.toMatch(
      /export\s*\{[^}]*withRejectedUsedFallback/,
    );
    expect(
      barrel,
    ).toContain(
      "intentionally NOT",
    );

    const mergeImporters =
      listSourceFiles(
        "lib",
      ).concat(
        listSourceFiles(
          "app",
        ),
        listSourceFiles(
          "components",
        ),
      ).filter(
        (file) => {
          if (
            file ===
            "lib/decision-brief/ai/merge-ai-brief.ts"
          ) {
            return false;
          }

          return read(
            file,
          ).includes(
            "merge-ai-brief",
          );
        },
      );

    expect(
      mergeImporters,
    ).toEqual(
      [
        "lib/decision-brief/ai/orchestrate.ts",
      ],
    );
  });

  it("requires minted validated-candidate gate before ai_validated merge", () => {
    const merge =
      read(
        "lib/decision-brief/ai/merge-ai-brief.ts",
      );
    const validate =
      read(
        "lib/decision-brief/ai/validate-candidate.ts",
      );
    const mint =
      read(
        "lib/decision-brief/ai/validated-candidate.ts",
      );

    expect(
      merge,
    ).toContain(
      "isSemanticallyValidatedCandidate",
    );
    expect(
      validate,
    ).toContain(
      "mintSemanticallyValidatedCandidate",
    );
    expect(
      mint,
    ).toContain(
      "WeakSet",
    );
  });
});
