import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

/**
 * M7.1 fixture-evaluation must stay out of production paths.
 *
 * Isolation is checked by resolving import/export-from/dynamic-import
 * specifiers (aliases + relatives), then walking a re-export closure —
 * not by a single direct-import regex.
 */

const ROOT = process.cwd();

const FIXTURE_MODULE = path.normalize(
  "lib/decision-engine/fixture-evaluation",
);

const FORBIDDEN_ROOTS = [
  "app",
  "workers",
  "lib/persistence",
  "lib/providers",
  "lib/canary",
] as const;

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "coverage",
  ".vitest",
]);

const IMPORT_SPECIFIER_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"()]*?\s+from\s+|)\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function listSourceFiles(relativeRoot: string): string[] {
  const absolute = path.join(ROOT, relativeRoot);
  if (!fs.existsSync(absolute)) {
    return [];
  }

  const out: string[] = [];

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (
          SKIP_DIR_NAMES.has(entry.name) ||
          entry.name.startsWith(".")
        ) {
          continue;
        }
        walk(path.join(dir, entry.name));
        continue;
      }

      const ext = path.extname(entry.name);
      if (!SOURCE_EXTENSIONS.has(ext)) {
        continue;
      }
      if (entry.name.endsWith(".d.ts")) {
        continue;
      }

      out.push(path.relative(ROOT, path.join(dir, entry.name)));
    }
  }

  walk(absolute);
  return out.sort();
}

function stripExtension(relativePath: string): string {
  return relativePath.replace(/\.(tsx|ts|jsx|js|mjs|cjs)$/, "");
}

function tryResolveFile(candidateWithoutExt: string): string | null {
  const normalized = path.normalize(candidateWithoutExt);

  for (const ext of [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]) {
    const withExt = `${normalized}${ext}`;
    if (fs.existsSync(path.join(ROOT, withExt))) {
      return stripExtension(withExt);
    }
  }

  for (const indexName of [
    "index.ts",
    "index.tsx",
    "index.js",
    "index.jsx",
  ]) {
    const indexPath = path.join(normalized, indexName);
    if (fs.existsSync(path.join(ROOT, indexPath))) {
      return stripExtension(indexPath);
    }
  }

  return null;
}

function resolveSpecifier(
  fromRelativeFile: string,
  specifier: string,
): string | null {
  if (
    specifier.startsWith("node:") ||
    (!specifier.startsWith(".") &&
      !specifier.startsWith("@/") &&
      !specifier.startsWith("/"))
  ) {
    // bare package import
    return null;
  }

  let candidate: string;

  if (specifier.startsWith("@/")) {
    candidate = specifier.slice(2);
  } else if (specifier.startsWith("/")) {
    candidate = specifier.slice(1);
  } else {
    const fromDir = path.dirname(fromRelativeFile);
    candidate = path.join(fromDir, specifier);
  }

  candidate = path.normalize(candidate);

  const resolved = tryResolveFile(candidate);
  if (resolved) {
    return resolved;
  }

  // Unresolved relative/alias still compared by normalized path stem.
  return stripExtension(candidate);
}

function extractSpecifiers(source: string): string[] {
  const found: string[] = [];
  IMPORT_SPECIFIER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMPORT_SPECIFIER_RE.exec(source)) !== null) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier) {
      found.push(specifier);
    }
  }
  return found;
}

function isUnderForbiddenRoot(relativeFile: string): boolean {
  const normalized = path.normalize(relativeFile);
  return FORBIDDEN_ROOTS.some(
    (root) =>
      normalized === root ||
      normalized.startsWith(`${root}${path.sep}`),
  );
}

function isAllowedImporter(relativeFile: string): boolean {
  const normalized = path.normalize(relativeFile);
  if (normalized === `${FIXTURE_MODULE}.ts`) {
    return true;
  }
  if (normalized.startsWith(`tests${path.sep}`)) {
    return true;
  }
  return false;
}

function collectRepositorySourceFiles(): string[] {
  const roots = [
    "app",
    "workers",
    "lib",
    "scripts",
    "tests",
  ];
  const files: string[] = [];
  for (const root of roots) {
    files.push(...listSourceFiles(root));
  }
  return files;
}

function buildFixtureReexportClosure(
  files: readonly string[],
): Set<string> {
  const tainted = new Set<string>([FIXTURE_MODULE]);
  const sources = new Map<string, string>();

  for (const file of files) {
    sources.set(
      file,
      fs.readFileSync(path.join(ROOT, file), "utf8"),
    );
  }

  let grew = true;
  while (grew) {
    grew = false;

    for (const file of files) {
      const moduleId = stripExtension(path.normalize(file));
      if (tainted.has(moduleId)) {
        continue;
      }

      const source = sources.get(file) ?? "";
      const reexportLines = source
        .split("\n")
        .filter((line) => /^\s*export\s/.test(line));

      if (reexportLines.length === 0) {
        continue;
      }

      const reexportBlock = reexportLines.join("\n");
      const specifiers = extractSpecifiers(reexportBlock);

      for (const specifier of specifiers) {
        const resolved = resolveSpecifier(file, specifier);
        if (resolved && tainted.has(path.normalize(resolved))) {
          tainted.add(moduleId);
          grew = true;
          break;
        }
      }
    }
  }

  return tainted;
}

describe("M7.1 fixture-evaluation architecture isolation", () => {
  it("keeps fixtureAttestation as an explicit non-crypto developer declaration", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "lib/decision-engine/fixture-evaluation.ts"),
      "utf8",
    );
    const addendum = fs.readFileSync(
      path.join(ROOT, "docs/M7_0_CONTRACT_ADDENDUM.md"),
      "utf8",
    );

    expect(source).toContain(
      'M7_CONTROLLED_LOCAL_FIXTURE_ATTESTATION_V1 =\n  "m7-controlled-local-fixture-v1"',
    );
    expect(source).toContain("NOT cryptographic proof");
    expect(source).toContain("NOT a production authorization mechanism");
    expect(source).toContain("audience: \"local_developer\"");
    expect(source).toContain('evidenceScope: "controlled_fixture_only"');
    expect(addendum).toContain("developer declaration");
    expect(addendum).toContain("cryptographic proof");
    expect(addendum).toContain("production authorization mechanism");
    expect(addendum).toContain("Production forecasts are ineligible");
  });

  it("rejects fixture-evaluation imports from production paths including aliases, relatives, and re-exports", () => {
    const files = collectRepositorySourceFiles();
    const taintedModules = buildFixtureReexportClosure(files);
    const violations: string[] = [];

    for (const file of files) {
      if (isAllowedImporter(file)) {
        continue;
      }

      const source = fs.readFileSync(path.join(ROOT, file), "utf8");
      const specifiers = extractSpecifiers(source);

      for (const specifier of specifiers) {
        const resolved = resolveSpecifier(file, specifier);
        if (!resolved) {
          continue;
        }

        const normalized = path.normalize(resolved);
        if (!taintedModules.has(normalized)) {
          continue;
        }

        if (isUnderForbiddenRoot(file) || !isAllowedImporter(file)) {
          // Forbid any non-test / non-adapter self import of the fixture module
          // or of modules that re-export it. Production roots are the hard gate;
          // other lib/ code must also stay clear for isolation.
          violations.push(
            `${file} imports ${specifier} → ${normalized}`,
          );
        }
      }

      // Catch stringly dynamic side doors that skip static import parsing.
      if (
        isUnderForbiddenRoot(file) &&
        (source.includes("fixture-evaluation") ||
          source.includes("evaluateFixtureInventoryDecision") ||
          source.includes("m7-controlled-local-fixture-v1"))
      ) {
        violations.push(
          `${file} references fixture-evaluation API surface by name`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it("enumerates forbidden roots that must stay fixture-free", () => {
    for (const root of FORBIDDEN_ROOTS) {
      expect(
        fs.existsSync(path.join(ROOT, root)) || root === "workers",
      ).toBe(true);
    }

    const forbiddenFiles = FORBIDDEN_ROOTS.flatMap((root) =>
      listSourceFiles(root),
    );

    for (const file of forbiddenFiles) {
      const source = fs.readFileSync(path.join(ROOT, file), "utf8");
      expect(
        source.includes("lib/decision-engine/fixture-evaluation"),
        `${file} must not mention fixture-evaluation path`,
      ).toBe(false);
      expect(
        source.includes("evaluateFixtureInventoryDecision"),
        `${file} must not call evaluateFixtureInventoryDecision`,
      ).toBe(false);
    }
  });
});
