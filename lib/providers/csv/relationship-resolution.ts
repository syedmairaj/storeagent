import type { ProviderResourceType } from "@/lib/commerce-domain/types";

import type { CsvResourcePersistencePort } from "./resource-orchestration";

import type { CsvTrustedImportContext } from "./trusted-context";

export class CsvRelationshipUnresolvedError extends Error {
  readonly code = "RELATIONSHIP_UNRESOLVED";

  constructor(message: string) {
    super(message);
    this.name = "CsvRelationshipUnresolvedError";
  }
}

export async function resolveCsvBinding(
  persistence: CsvResourcePersistencePort,
  context: CsvTrustedImportContext,
  resourceType: ProviderResourceType,
  externalId: string,
): Promise<string> {
  const resolved = await persistence.resolveBinding({
    organizationId: context.organizationId,
    integrationId: context.integrationId,
    provider: "csv",
    resourceType,
    externalId,
  });

  if (resolved === null) {
    throw new CsvRelationshipUnresolvedError(
      `CSV ${resourceType} relationship "${externalId}" could not be resolved.`,
    );
  }

  return resolved.canonicalEntityId;
}

export async function resolveOptionalCsvBinding(
  persistence: CsvResourcePersistencePort,
  context: CsvTrustedImportContext,
  resourceType: ProviderResourceType,
  externalId: string | null,
): Promise<string | null> {
  if (externalId === null) {
    return null;
  }

  return resolveCsvBinding(persistence, context, resourceType, externalId);
}
