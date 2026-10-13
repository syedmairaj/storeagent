export const CSV_RECONCILIATION_CONFLICT_SQLSTATE = "SA001";

export class CsvPersistenceConflictError extends Error {
  readonly sqlState = CSV_RECONCILIATION_CONFLICT_SQLSTATE;

  readonly reasonCode = "BINDING_CONFLICT" as const;

  readonly rpcName: string;

  constructor(rpcName: string) {
    super(`CSV persistence reconciliation conflict in "${rpcName}".`);

    this.name = "CsvPersistenceConflictError";

    this.rpcName = rpcName;
  }
}

export const CSV_HISTORY_CONFLICT_SQLSTATE = "SA002";

export class CsvPersistenceHistoryConflictError extends Error {
  readonly reasonCode = "HISTORY_CONFLICT" as const;

  readonly rpcName: string;

  constructor(rpcName: string) {
    super("CSV immutable history conflicts with an existing observation.");

    this.name = "CsvPersistenceHistoryConflictError";
    this.rpcName = rpcName;
  }
}
