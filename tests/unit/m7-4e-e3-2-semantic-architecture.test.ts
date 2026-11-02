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
        path.extname(
          entry.name,
        ) !== ".ts" &&
        path.extname(
          entry.name,
        ) !== ".tsx"
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

describe("M7.4e E3.2 semantic architecture", () => {
  it("ships ai-brief-semantic-claims-v1 without live providers", () => {
    const profile =
      read(
        "lib/decision-brief/semantic-claims-v1.ts",
      );

    expect(
      profile,
    ).toContain(
      "ai-brief-semantic-claims-v1",
    );
    expect(
      profile,
    ).toContain(
      "AI_BRIEF_SEMANTIC_TEMPLATES_V1",
    );
    expect(
      profile,
    ).toContain(
      "AI_BRIEF_SEMANTIC_PROFILE_APPROVED",
    );
    expect(
      profile,
    ).toContain(
      "isSafeSemanticTextSlot",
    );
    expect(
      profile,
    ).toContain(
      "requiredEvidenceRefAnyOf",
    );
    expect(
      profile,
    ).toContain(
      "requiredClaimKind",
    );
    expect(
      profile,
    ).not.toContain(
      "openai",
    );
    expect(
      profile,
    ).not.toContain(
      "@anthropic",
    );
    expect(
      profile,
    ).not.toMatch(
      /\bfetch\s*\(/,
    );
  });

  it("wires the semantic gate through evaluate path without ai_validated delivery", () => {
    const validateClaims =
      read(
        "lib/decision-brief/validate-claims.ts",
      );
    const validateCandidate =
      read(
        "lib/decision-brief/ai/validate-candidate.ts",
      );
    const orchestrate =
      read(
        "lib/decision-brief/ai/orchestrate.ts",
      );

    expect(
      validateClaims,
    ).toContain(
      "assessAiBriefSemanticClaimsV1",
    );
    expect(
      validateCandidate,
    ).toContain(
      "evaluation:",
    );
    expect(
      orchestrate,
    ).toContain(
      "E3_1_FORCE_DETERMINISTIC_FALLBACK",
    );
    expect(
      orchestrate,
    ).not.toContain(
      'generator: "ai_validated"',
    );
  });

  it("keeps client Actions components off semantic AI adapter entry", () => {
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
        "semantic-claims-v1",
      );
      expect(
        source,
        file,
      ).not.toContain(
        "buildTemplatedOfflineStubCandidate",
      );
    }
  });

  it("keeps workers/explain-actions unimplemented", () => {
    expect(
      read(
        "workers/explain-actions.ts",
      ).trim().length,
    ).toBe(
      0,
    );
  });
});
