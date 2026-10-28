import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

// Turns a user-chosen name into a folder/file name that is valid on macOS, Windows and Linux.
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f/\\:*?"<>|]/g, '_')
    .trim()
    .replace(/[. ]+$/, '');
  return cleaned || 'untitled';
}

// Creates exports/<name>/ and returns its path. With clear, files left from an earlier export are removed first.
export async function prepareExportDir(exportsDir: string, name: string, { clear = false } = {}): Promise<string> {
  const dir = path.join(exportsDir, safeFileName(name));
  if (clear) await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  return dir;
}

// Best effort: the export already succeeded, so a failure to open the folder is only logged.
// MOCK_NO_REVEAL=1 skips it (end-to-end runs).
export function revealInFileManager(dir: string): void {
  if (process.env.MOCK_NO_REVEAL) return;
  const command = { darwin: 'open', win32: 'explorer' }[process.platform as string] ?? 'xdg-open';
  execFile(command, [dir], (err) => {
    if (err) console.warn(`Could not open ${dir}: ${err.message}`);
  });
}
