import { describe, expect, it } from 'vitest';
import { safeFileName } from './exportDir';

describe('safeFileName', () => {
  it('replaces characters Windows forbids and trims trailing dots and spaces', () => {
    expect(safeFileName('Login: "happy" path?. ')).toBe('Login_ _happy_ path_');
    expect(safeFileName('a/b\\c|d*e<f>g')).toBe('a_b_c_d_e_f_g');
  });

  it("avoids Windows' reserved device names, in any case and with an extension", () => {
    expect(safeFileName('CON')).toBe('CON_');
    expect(safeFileName('nul')).toBe('nul_');
    expect(safeFileName('com1')).toBe('com1_');
    expect(safeFileName('LPT9.txt')).toBe('LPT9.txt_');
    expect(safeFileName('Console')).toBe('Console');
    expect(safeFileName('COM10')).toBe('COM10');
  });

  it('falls back to "untitled"', () => {
    expect(safeFileName(' .. ')).toBe('untitled');
  });
});
