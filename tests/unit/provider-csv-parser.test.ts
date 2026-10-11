import {
  describe,
  expect,
  it,
} from "vitest";

import {
  CsvStructuralError,
  parseCsv,
} from "@/lib/providers/csv/parser";

describe(
  "CSV structural parser",
  () => {
    it(
      "parses a basic header and rows",
      () => {
        const result =
          parseCsv(
            "ID,SKU,Stock\n1,ABC,4\n2,XYZ,0",
          );

        expect(
          result.headers,
        ).toEqual([
          "ID",
          "SKU",
          "Stock",
        ]);

        expect(
          result.rows,
        ).toEqual([
          {
            rowNumber: 2,
            row: {
              ID: "1",
              SKU: "ABC",
              Stock: "4",
            },
          },
          {
            rowNumber: 3,
            row: {
              ID: "2",
              SKU: "XYZ",
              Stock: "0",
            },
          },
        ]);
      },
    );

    it(
      "accepts CRLF input",
      () => {
        const result =
          parseCsv(
            "ID,SKU\r\n1,ABC\r\n2,XYZ\r\n",
          );

        expect(
          result.rows,
        ).toHaveLength(2);

        expect(
          result.rows[1]
            .rowNumber,
        ).toBe(3);
      },
    );

    it(
      "removes only the leading UTF-8 BOM",
      () => {
        const result =
          parseCsv(
            "\uFEFFID,SKU\n1,ABC",
          );

        expect(
          result.headers,
        ).toEqual([
          "ID",
          "SKU",
        ]);
      },
    );

    it(
      "parses UTF-8 bytes",
      () => {
        const source =
          new TextEncoder()
            .encode(
              "ID,Title\n1,Café",
            );

        const result =
          parseCsv(source);

        expect(
          result.rows[0]
            .row.Title,
        ).toBe("Café");
      },
    );

    it(
      "rejects malformed UTF-8 bytes",
      () => {
        expect(() =>
          parseCsv(
            new Uint8Array([
              0xc3,
              0x28,
            ]),
          ),
        ).toThrow(
          CsvStructuralError,
        );

        try {
          parseCsv(
            new Uint8Array([
              0xc3,
              0x28,
            ]),
          );
        } catch (error) {
          expect(
            error,
          ).toMatchObject({
            code:
              "CSV_INVALID_UTF8",
          });
        }
      },
    );

    it(
      "preserves commas inside quoted cells",
      () => {
        const result =
          parseCsv(
            'ID,Title\n1,"Shirt, Blue"',
          );

        expect(
          result.rows[0]
            .row.Title,
        ).toBe(
          "Shirt, Blue",
        );
      },
    );

    it(
      "unescapes doubled quotes",
      () => {
        const result =
          parseCsv(
            'ID,Title\n1,"The ""Best"" Shirt"',
          );

        expect(
          result.rows[0]
            .row.Title,
        ).toBe(
          'The "Best" Shirt',
        );
      },
    );

    it(
      "preserves embedded newlines inside quoted cells",
      () => {
        const result =
          parseCsv(
            'ID,Title\n1,"Blue\nShirt"\n2,Red',
          );

        expect(
          result.rows[0]
            .row.Title,
        ).toBe(
          "Blue\nShirt",
        );

        expect(
          result.rows[1]
            .rowNumber,
        ).toBe(4);
      },
    );

    it(
      "preserves raw cell whitespace for the mapping layer",
      () => {
        const result =
          parseCsv(
            "ID,SKU\n 1 ,  ABC  ",
          );

        expect(
          result.rows[0]
            .row,
        ).toEqual({
          ID: " 1 ",
          SKU: "  ABC  ",
        });
      },
    );

    it(
      "preserves empty cells",
      () => {
        const result =
          parseCsv(
            "ID,SKU,Stock\n1,,0",
          );

        expect(
          result.rows[0]
            .row,
        ).toEqual({
          ID: "1",
          SKU: "",
          Stock: "0",
        });
      },
    );

    it(
      "ignores blank physical records",
      () => {
        const result =
          parseCsv(
            "ID,SKU\n\n1,ABC\n\n2,XYZ\n",
          );

        expect(
          result.rows,
        ).toHaveLength(2);

        expect(
          result.rows[0]
            .rowNumber,
        ).toBe(3);

        expect(
          result.rows[1]
            .rowNumber,
        ).toBe(5);
      },
    );

    it(
      "rejects an empty file",
      () => {
        expect(() =>
          parseCsv(""),
        ).toThrow(
          "CSV input must contain a header row.",
        );
      },
    );

    it(
      "rejects a blank header name",
      () => {
        expect(() =>
          parseCsv(
            "ID,,SKU\n1,x,ABC",
          ),
        ).toThrow(
          "CSV header names must not be blank.",
        );
      },
    );

    it(
      "rejects duplicate header names",
      () => {
        expect(() =>
          parseCsv(
            "ID,SKU,SKU\n1,A,B",
          ),
        ).toThrow(
          'CSV header "SKU" appears more than once.',
        );
      },
    );

    it(
      "rejects rows wider than the header",
      () => {
        expect(() =>
          parseCsv(
            "ID,SKU\n1,ABC,EXTRA",
          ),
        ).toThrow(
          "CSV row 2 has 3 fields; expected 2.",
        );
      },
    );

    it(
      "rejects rows narrower than the header",
      () => {
        expect(() =>
          parseCsv(
            "ID,SKU,Stock\n1,ABC",
          ),
        ).toThrow(
          "CSV row 2 has 2 fields; expected 3.",
        );
      },
    );

    it(
      "rejects unterminated quoted fields",
      () => {
        expect(() =>
          parseCsv(
            'ID,Title\n1,"Blue Shirt',
          ),
        ).toThrow(
          "CSV row 2 contains an unterminated quoted field.",
        );
      },
    );

    it(
      "rejects characters after a closing quote",
      () => {
        expect(() =>
          parseCsv(
            'ID,Title\n1,"Blue"x',
          ),
        ).toThrow(
          "CSV row 2 contains an unexpected character after a closing quote.",
        );
      },
    );

    it(
      "keeps row number diagnostic only",
      () => {
        const result =
          parseCsv(
            "ID\nabc",
          );

        expect(
          result.rows[0],
        ).toEqual({
          rowNumber: 2,
          row: {
            ID: "abc",
          },
        });

        expect(
          result.rows[0]
            .row,
        ).not.toHaveProperty(
          "rowNumber",
        );
      },
    );
  },
);
