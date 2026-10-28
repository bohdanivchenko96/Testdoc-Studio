import { rename, writeFile } from 'node:fs/promises';

// Writes through a temp file so a crash never leaves a half-written file.
export async function writeAtomic(file: string, data: string | Uint8Array): Promise<void> {
  await writeFile(`${file}.tmp`, data);
  await renameWithRetry(`${file}.tmp`, file);
}

// On Windows an antivirus or the search indexer can hold a file for a moment, and renaming over it fails with
// EPERM, EACCES or EBUSY. Waiting briefly and retrying gets through (graceful-fs does the same).
const BUSY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RENAME_ATTEMPTS = 8;

export async function renameWithRetry(
  from: string,
  to: string,
  // Swappable in tests.
  renameFile: (from: string, to: string) => Promise<void> = rename,
  delayMs = 25,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await renameFile(from, to);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? '';
      if (attempt === RENAME_ATTEMPTS || !BUSY_CODES.has(code)) throw e;
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
}

export function isMissing(e: unknown): boolean {
  return (e as NodeJS.ErrnoException).code === 'ENOENT';
}

// Runs async operations one at a time, so read-modify-write sequences don't interleave.
export function createQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };
}
