// Xray "Import steps" CSV: one file = the steps of one Test.
// Byte-exact round trip with files exported by Xray DC is a hard requirement (see docs/spec.md).

export interface Step {
  action: string;
  data: string;
  expectedResult: string;
}

export const HEADER = ['Action', 'Data', 'Expected Result'] as const;

export class CsvError extends Error {}

// Apache Commons CSV QuoteMode.MINIMAL, which Xray's Java exporter uses.
function needsQuotes(value: string, firstInRecord: boolean): boolean {
  if (value === '') return firstInRecord;
  if (value.charCodeAt(0) <= 0x23 /* '#' */) return true;
  if (/[,"\r\n]/.test(value)) return true;
  return value.charCodeAt(value.length - 1) <= 0x20;
}

function formatRecord(fields: readonly string[]): string {
  return fields
    .map((f, i) => (needsQuotes(f, i === 0) ? `"${f.replaceAll('"', '""')}"` : f))
    .join(',');
}

export function serializeSteps(steps: readonly Step[]): string {
  const records = [HEADER, ...steps.map((s) => [s.action, s.data, s.expectedResult])];
  return records.map((r) => formatRecord(r) + '\r\n').join('');
}

// RFC 4180 reader. Newlines inside quoted fields are kept verbatim (CRLF and LF both occur in real exports).
function parseRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    let field: string;
    if (text[i] === '"') {
      let end = i + 1;
      field = '';
      for (;;) {
        const q = text.indexOf('"', end);
        if (q === -1) throw new CsvError(`Unterminated quoted field starting at offset ${i}`);
        field += text.slice(end, q);
        if (text[q + 1] === '"') {
          field += '"';
          end = q + 2;
        } else {
          i = q + 1;
          break;
        }
      }
    } else {
      let end = i;
      while (end < n && text[end] !== ',' && text[end] !== '\r' && text[end] !== '\n') end++;
      field = text.slice(i, end);
      i = end;
    }
    record.push(field);

    if (text[i] === ',') {
      i++;
    } else if (i >= n || text[i] === '\r' || text[i] === '\n') {
      if (text[i] === '\r') i++;
      if (text[i] === '\n') i++;
      records.push(record);
      record = [];
    } else {
      throw new CsvError(`Unexpected character after quoted field at offset ${i}`);
    }
  }
  return records;
}

export function parseSteps(text: string): Step[] {
  const [header, ...rows] = parseRecords(text.replace(/^﻿/, ''));
  if (!header || header.join(',') !== HEADER.join(',')) {
    throw new CsvError(`Expected header "${HEADER.join(',')}", got "${header?.join(',') ?? ''}"`);
  }
  return rows.map((r, idx) => {
    if (r.length !== 3) throw new CsvError(`Step ${idx + 1}: expected 3 fields, got ${r.length}`);
    const [action, data, expectedResult] = r;
    return { action, data, expectedResult };
  });
}
