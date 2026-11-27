/**
 * AI-MKT-1c — citation structure validation and claim-level binding.
 * Validates HTTP(S) shape without fetching. No invented / blanket URLs.
 */

import type {
  MarketResearchAdapterCitation,
  MarketResearchAdapterSnippet,
} from "@/lib/market-research/adapters/types";
import type { CitationBindingResult } from "@/lib/market-research/normalize/types";

const FORBIDDEN_SCHEMES = /^(javascript|data|file|vbscript|blob):/i;

/**
 * Structural HTTP(S) URL check — no network.
 */
export function isValidHttpCitationUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 2048) return false;
  if (FORBIDDEN_SCHEMES.test(trimmed)) return false;
  if (/\s/.test(trimmed)) return false;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  if (!parsed.hostname || parsed.hostname.length < 1) {
    return false;
  }
  // Reject credentials in URL.
  if (parsed.username || parsed.password) {
    return false;
  }
  return true;
}

export function validateCitationList(
  citations: readonly MarketResearchAdapterCitation[] | undefined,
): { ok: true; urls: readonly string[] } | { ok: false; detail: string } {
  if (!Array.isArray(citations)) {
    return { ok: false, detail: "Citations must be an array" };
  }
  const urls: string[] = [];
  for (const citation of citations) {
    if (!citation || typeof citation !== "object") {
      return { ok: false, detail: "Citation entry malformed" };
    }
    if (!isValidHttpCitationUrl(citation.url)) {
      return { ok: false, detail: `Invalid citation URL '${String(citation.url)}'` };
    }
    urls.push(citation.url.trim());
  }
  return { ok: true, urls: Object.freeze(urls) };
}

/**
 * Bind a snippet to supporting citations by explicit indexes only.
 * No blanket assignment of all envelope citations.
 */
export function bindSnippetCitations(input: {
  snippet: MarketResearchAdapterSnippet;
  citations: readonly MarketResearchAdapterCitation[];
  /** When claim requires citations (sourced_signal). */
  requireCitation: boolean;
}): CitationBindingResult {
  const indexes = input.snippet.supportingCitationIndexes;
  const citations = input.citations;

  if (indexes === undefined || indexes === null) {
    if (input.requireCitation) {
      return {
        ok: false,
        code: "CITATION_MISSING",
        detail: `Snippet '${input.snippet.snippetId}' missing supportingCitationIndexes`,
      };
    }
    return { ok: true, urls: Object.freeze([]) };
  }

  if (!Array.isArray(indexes) || indexes.length === 0) {
    if (input.requireCitation) {
      return {
        ok: false,
        code: "CITATION_UNBOUND",
        detail: `Snippet '${input.snippet.snippetId}' has empty citation binding`,
      };
    }
    return { ok: true, urls: Object.freeze([]) };
  }

  const urls: string[] = [];
  const seen = new Set<number>();
  for (const index of indexes) {
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
      return {
        ok: false,
        code: "CITATION_INVALID",
        detail: `Snippet '${input.snippet.snippetId}' has non-integer citation index`,
      };
    }
    if (index >= citations.length) {
      return {
        ok: false,
        code: "CITATION_UNRELATED",
        detail: `Snippet '${input.snippet.snippetId}' citation index ${index} out of range`,
      };
    }
    if (seen.has(index)) {
      continue;
    }
    seen.add(index);
    const citation = citations[index];
    if (!isValidHttpCitationUrl(citation?.url)) {
      return {
        ok: false,
        code: "CITATION_INVALID",
        detail: `Snippet '${input.snippet.snippetId}' bound to invalid citation URL`,
      };
    }
    urls.push(citation.url.trim());
  }

  if (input.requireCitation && urls.length === 0) {
    return {
      ok: false,
      code: "CITATION_MISSING",
      detail: `Snippet '${input.snippet.snippetId}' requires at least one citation`,
    };
  }

  return { ok: true, urls: Object.freeze(urls) };
}
