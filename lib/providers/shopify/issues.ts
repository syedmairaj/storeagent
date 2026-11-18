import type {
  ProviderNormalizationIssue,
} from "@/lib/providers/types";

export function shopifyIssue(
  code: ProviderNormalizationIssue["code"],
  message: string,
  field: string | null,
): ProviderNormalizationIssue {
  return {
    code,
    message,
    field,
  };
}
