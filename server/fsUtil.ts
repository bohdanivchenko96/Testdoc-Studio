import { rename, writeFile } from 'node:fs/promises';

// Writes through a temp file so a crash never leaves a half-written file.
export async function writeAtomic(file: string, data: string | Uint8Array): Promise<void> {
  await writeFile(`${file}.tmp`, data);
  await rename(`${file}.tmp`, file);
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
