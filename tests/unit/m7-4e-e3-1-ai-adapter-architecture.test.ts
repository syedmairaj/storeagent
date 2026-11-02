import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

const PROVIDER_FRAGMENTS = [
  "openai",
  "@anthropic",
  "@google/generative-ai",
  "anthropic",
  "generativelanguage.googleapis",
  "api.openai.com",
] as const;

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
]);

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
        !SOURCE_EXTENSIONS.has(
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

describe("M7.4e E3.1 AI adapter architecture", () => {
  it("ships offline AI module without live provider SDKs", () => {
    const files =
      listSourceFiles(
        "lib/decision-brief/ai",
      );

    expect(
      files.length,
    ).toBeGreaterThan(
      0,
    );

    for (
      const file of files
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
          `${file} must not reference ${fragment}`,
        ).not.toContain(
          fragment.toLowerCase(),
        );
      }

      expect(
        source,
        `${file} must not fetch`,
      ).not.toMatch(
        /\bfetch\s*\(/,
      );
      expect(
        source,
        `${file} must not use http(s) URLs for providers`,
      ).not.toMatch(
        /https?:\/\/(?!localhost)/,
      );
    }
  });

  it("keeps client Actions components off the AI adapter entry", () => {
    const componentFiles =
      listSourceFiles(
        "components/actions-demo",
      );

    expect(
      componentFiles.length,
    ).toBeGreaterThan(
      0,
    );

    for (
      const file of componentFiles
    ) {
      const source =
        read(
          file,
        );

      expect(
        source,
        `${file} must not import decision-brief/ai`,
      ).not.toContain(
        "decision-brief/ai",
      );
      expect(
        source,
        `${file} must not import offline stub`,
      ).not.toContain(
        "createOfflineStubAdapter",
      );
      expect(
        source,
        `${file} must not import explainDecisionBriefFromGrounding`,
      ).not.toContain(
        "explainDecisionBriefFromGrounding",
      );
    }

    const panel =
      read(
        "components/actions-demo/decision-brief-panel.tsx",
      );

    expect(
      panel,
    ).toContain(
      "composeDemoDecisionBrief",
    );
    // E2 chrome already labels ai_validated vs fallback; must stay unwired to adapters.
    expect(
      panel,
    ).toContain(
      "StoreAgent explanation",
    );
  });

  it("does not re-export AI adapter from the client-facing decision-brief barrel", () => {
    const barrel =
      read(
        "lib/decision-brief/index.ts",
      );

    expect(
      barrel,
    ).not.toContain(
      "decision-brief/ai",
    );
    expect(
      barrel,
    ).not.toContain(
      "createOfflineStubAdapter",
    );
    expect(
      barrel,
    ).not.toContain(
      "explainDecisionBriefFromGrounding",
    );
    expect(
      barrel,
    ).not.toContain(
      "node:crypto",
    );
  });

  it("keeps workers/explain-actions.ts unimplemented", () => {
    const worker =
      read(
        "workers/explain-actions.ts",
      ).trim();

    expect(
      worker.length,
    ).toBe(
      0,
    );
  });

  it("keeps E3.1 forceDeterministicFallback frozen true", () => {
    const types =
      read(
        "lib/decision-brief/ai/types.ts",
      );
    const orchestrate =
      read(
        "lib/decision-brief/ai/orchestrate.ts",
      );

    expect(
      types,
    ).toContain(
      "E3_1_FORCE_DETERMINISTIC_FALLBACK",
    );
    expect(
      types,
    ).toContain(
      "true as const",
    );
    expect(
      orchestrate,
    ).toContain(
      "E3_1_FORCE_DETERMINISTIC_FALLBACK",
    );
    expect(
      orchestrate,
    ).toContain(
      "forceDeterministicFallback",
    );
    expect(
      orchestrate,
    ).not.toContain(
      'generator: "ai_validated"',
    );
    expect(
      orchestrate,
    ).toContain(
      "clearTimeout",
    );
    expect(
      orchestrate,
    ).toContain(
      "validateAiExplanationCandidate",
    );
  });

  it("keeps grounding-hash on code-unit ordering without localeCompare", () => {
    const hash =
      read(
        "lib/decision-brief/ai/grounding-hash.ts",
      );

    expect(
      hash,
    ).toContain(
      "compareCanonicalKeys",
    );
    expect(
      hash,
    ).not.toContain(
      ".localeCompare(",
    );
  });

  it("guards nested candidate claim shapes before E1 validators", () => {
    const validate =
      read(
        "lib/decision-brief/ai/validate-candidate.ts",
      );

    expect(
      validate,
    ).toContain(
      "validateCandidateClaimNesting",
    );
    expect(
      validate,
    ).toContain(
      "Candidate validation failed closed on unexpected error.",
    );
  });

  it("does not wire M7.3 RPCs or persistence from the AI module", () => {
    const files =
      listSourceFiles(
        "lib/decision-brief/ai",
      );

    const forbidden = [
      "transition_inventory_action_merchant",
      "persistInventoryAction",
      "createSupabaseAdminClient",
      "SERVICE_ROLE",
      ".rpc(",
      "lib/persistence",
    ] as const;

    for (
      const file of files
    ) {
      const source =
        read(
          file,
        );

      for (
        const fragment of forbidden
      ) {
        expect(
          source,
          `${file} must not reference ${fragment}`,
        ).not.toContain(
          fragment,
        );
      }
    }
  });
});
