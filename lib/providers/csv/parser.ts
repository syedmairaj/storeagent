import type {
  CsvRow,
} from "@/lib/providers/types";

export type CsvStructuralErrorCode =
  | "CSV_EMPTY"
  | "CSV_INVALID_UTF8"
  | "CSV_HEADER_EMPTY"
  | "CSV_HEADER_DUPLICATE"
  | "CSV_ROW_WIDTH_MISMATCH"
  | "CSV_QUOTE_UNEXPECTED"
  | "CSV_QUOTE_UNTERMINATED"
  | "CSV_QUOTE_TRAILING_CHAR";

export class CsvStructuralError
  extends Error {
  readonly code:
    CsvStructuralErrorCode;

  readonly rowNumber:
    number | null;

  constructor(
    code:
      CsvStructuralErrorCode,
    message: string,
    rowNumber:
      number | null = null,
  ) {
    super(message);

    this.name =
      "CsvStructuralError";

    this.code = code;
    this.rowNumber =
      rowNumber;
  }
}

export interface ParsedCsvRow {
  /**
   * 1-based source line where this logical CSV
   * record begins.
   *
   * Diagnostic provenance only.
   * Never durable provider identity.
   */
  rowNumber: number;

  row: CsvRow;
}

export interface ParsedCsv {
  headers:
    readonly string[];

  rows:
    readonly ParsedCsvRow[];
}

interface ParsedRecord {
  readonly values:
    readonly string[];

  readonly rowNumber:
    number;
}

function decodeCsvInput(
  input:
    string | Uint8Array,
): string {
  if (
    typeof input ===
    "string"
  ) {
    return input;
  }

  try {
    return new TextDecoder(
      "utf-8",
      {
        fatal: true,
      },
    ).decode(input);
  } catch {
    throw new CsvStructuralError(
      "CSV_INVALID_UTF8",
      "CSV input is not valid UTF-8.",
    );
  }
}

function stripUtf8Bom(
  value: string,
): string {
  if (
    value.charCodeAt(0) ===
    0xfeff
  ) {
    return value.slice(1);
  }

  return value;
}

function recordIsBlank(
  record:
    ParsedRecord,
): boolean {
  return (
    record.values.length === 1 &&
    record.values[0] === ""
  );
}

function parseRecords(
  source: string,
): ParsedRecord[] {
  const records:
    ParsedRecord[] = [];

  let values: string[] = [];
  let field = "";

  let inQuotes = false;
  let justClosedQuote =
    false;

  let sourceLine = 1;
  let recordStartLine = 1;

  const pushField =
    (): void => {
      values.push(field);
      field = "";
      justClosedQuote =
        false;
    };

  const pushRecord =
    (): void => {
      pushField();

      records.push({
        values,
        rowNumber:
          recordStartLine,
      });

      values = [];
    };

  let index = 0;

  while (
    index < source.length
  ) {
    const character =
      source[index];

    if (inQuotes) {
      if (
        character === '"'
      ) {
        if (
          source[
            index + 1
          ] === '"'
        ) {
          field += '"';
          index += 2;
          continue;
        }

        inQuotes = false;
        justClosedQuote =
          true;
        index += 1;
        continue;
      }

      if (
        character === "\r"
      ) {
        if (
          source[
            index + 1
          ] === "\n"
        ) {
          field += "\r\n";
          index += 2;
        } else {
          field += "\r";
          index += 1;
        }

        sourceLine += 1;
        continue;
      }

      if (
        character === "\n"
      ) {
        field += "\n";
        sourceLine += 1;
        index += 1;
        continue;
      }

      field += character;
      index += 1;
      continue;
    }

    if (justClosedQuote) {
      if (
        character === ","
      ) {
        pushField();
        index += 1;
        continue;
      }

      if (
        character === "\r" ||
        character === "\n"
      ) {
        pushRecord();

        if (
          character === "\r" &&
          source[
            index + 1
          ] === "\n"
        ) {
          index += 2;
        } else {
          index += 1;
        }

        sourceLine += 1;
        recordStartLine =
          sourceLine;

        continue;
      }

      throw new CsvStructuralError(
        "CSV_QUOTE_TRAILING_CHAR",
        `CSV row ${recordStartLine} contains an unexpected character after a closing quote.`,
        recordStartLine,
      );
    }

    if (
      character === '"'
    ) {
      if (field.length !== 0) {
        field += character;
        index += 1;
        continue;
      }

      inQuotes = true;
      index += 1;
      continue;
    }

    if (
      character === ","
    ) {
      pushField();
      index += 1;
      continue;
    }

    if (
      character === "\r" ||
      character === "\n"
    ) {
      pushRecord();

      if (
        character === "\r" &&
        source[
          index + 1
        ] === "\n"
      ) {
        index += 2;
      } else {
        index += 1;
      }

      sourceLine += 1;
      recordStartLine =
        sourceLine;

      continue;
    }

    field += character;
    index += 1;
  }

  if (inQuotes) {
    throw new CsvStructuralError(
      "CSV_QUOTE_UNTERMINATED",
      `CSV row ${recordStartLine} contains an unterminated quoted field.`,
      recordStartLine,
    );
  }

  if (
    field.length > 0 ||
    values.length > 0 ||
    justClosedQuote
  ) {
    pushRecord();
  }

  return records;
}

function validateHeaders(
  headers:
    readonly string[],
): void {
  const seen =
    new Set<string>();

  for (
    const header
    of headers
  ) {
    if (
      header.trim()
        .length === 0
    ) {
      throw new CsvStructuralError(
        "CSV_HEADER_EMPTY",
        "CSV header names must not be blank.",
        1,
      );
    }

    if (
      seen.has(header)
    ) {
      throw new CsvStructuralError(
        "CSV_HEADER_DUPLICATE",
        `CSV header "${header}" appears more than once.`,
        1,
      );
    }

    seen.add(header);
  }
}

export function parseCsv(
  input:
    string | Uint8Array,
): ParsedCsv {
  const decoded =
    stripUtf8Bom(
      decodeCsvInput(input),
    );

  const records =
    parseRecords(decoded)
      .filter(
        (
          record,
        ) =>
          !recordIsBlank(
            record,
          ),
      );

  if (
    records.length === 0
  ) {
    throw new CsvStructuralError(
      "CSV_EMPTY",
      "CSV input must contain a header row.",
    );
  }

  const [
    headerRecord,
    ...dataRecords
  ] = records;

  const headers =
    [...headerRecord.values];

  validateHeaders(headers);

  const rows =
    dataRecords.map(
      (
        record,
      ): ParsedCsvRow => {
        if (
          record.values.length !==
          headers.length
        ) {
          throw new CsvStructuralError(
            "CSV_ROW_WIDTH_MISMATCH",
            `CSV row ${record.rowNumber} has ${record.values.length} fields; expected ${headers.length}.`,
            record.rowNumber,
          );
        }

        const row:
          Record<
            string,
            string
          > = {};

        for (
          let column = 0;
          column <
          headers.length;
          column += 1
        ) {
          row[
            headers[column]
          ] =
            record.values[
              column
            ];
        }

        return {
          rowNumber:
            record.rowNumber,
          row,
        };
      },
    );

  return {
    headers,
    rows,
  };
}
