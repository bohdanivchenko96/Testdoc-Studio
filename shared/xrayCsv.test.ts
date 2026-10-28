import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EXAMPLE_CSV, EXAMPLE_STEPS } from './xrayCsv.fixture';
import { CsvError, parseSteps, serializeSteps } from './xrayCsv';

// A real Xray export, kept out of git (company data). Present only on the author's machine.
const PRIVATE_EXPORT = fileURLToPath(new URL('../private/csv_example.csv', import.meta.url));

describe('xrayCsv', () => {
  it('reads and writes the example byte for byte', () => {
    expect(parseSteps(EXAMPLE_CSV)).toEqual(EXAMPLE_STEPS);
    expect(serializeSteps(EXAMPLE_STEPS)).toBe(EXAMPLE_CSV);
  });

  it.skipIf(!existsSync(PRIVATE_EXPORT))('round-trips the real Xray export in private/ byte for byte', () => {
    const real = readFileSync(PRIVATE_EXPORT, 'utf8');
    const steps = parseSteps(real);
    expect(steps.length).toBeGreaterThan(0);
    expect(serializeSteps(steps)).toBe(real);
  });

  it('quotes like Commons CSV MINIMAL', () => {
    const csv = serializeSteps([
      { action: 'Plain', data: '', expectedResult: '# list' },
      { action: '', data: 'a,b', expectedResult: 'say "hi"' },
      { action: 'trailing ', data: 'x\ny', expectedResult: 'ok' },
    ]);
    expect(csv).toBe(
      'Action,Data,Expected Result\r\n' +
        'Plain,,"# list"\r\n' +
        '"","a,b","say ""hi"""\r\n' +
        '"trailing ","x\ny",ok\r\n',
    );
  });

  it('accepts LF record separators and a BOM', () => {
    expect(parseSteps('﻿Action,Data,Expected Result\nA,B,C\n')).toEqual([
      { action: 'A', data: 'B', expectedResult: 'C' },
    ]);
  });

  it('rejects a wrong header', () => {
    expect(() => parseSteps('Step,Data,Result\r\n')).toThrow(CsvError);
  });
});
