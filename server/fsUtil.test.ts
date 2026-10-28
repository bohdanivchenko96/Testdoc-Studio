import { describe, expect, it } from 'vitest';
import { renameWithRetry } from './fsUtil';

const errno = (code: string) => Object.assign(new Error(code), { code });

// A rename that fails with the given codes first, then succeeds.
function flakyRename(...failures: string[]) {
  const calls: string[] = [];
  const rename = async (from: string, to: string) => {
    calls.push(`${from}->${to}`);
    const code = failures.shift();
    if (code) throw errno(code);
  };
  return { rename, calls };
}

describe('renameWithRetry', () => {
  it('retries while Windows holds the file (EPERM, EBUSY, EACCES)', async () => {
    const { rename, calls } = flakyRename('EPERM', 'EBUSY', 'EACCES');
    await renameWithRetry('a.tmp', 'a', rename, 0);
    expect(calls).toHaveLength(4);
  });

  it('fails at once on other errors', async () => {
    const { rename, calls } = flakyRename('ENOENT');
    await expect(renameWithRetry('a.tmp', 'a', rename, 0)).rejects.toThrow('ENOENT');
    expect(calls).toHaveLength(1);
  });

  it('gives up after 8 attempts', async () => {
    const { rename, calls } = flakyRename(...Array(20).fill('EPERM'));
    await expect(renameWithRetry('a.tmp', 'a', rename, 0)).rejects.toThrow('EPERM');
    expect(calls).toHaveLength(8);
  });
});
