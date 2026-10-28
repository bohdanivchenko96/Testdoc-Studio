import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

// Device names Windows reserves, with or without an extension: a file or folder can't be called "CON" or "nul.txt".
const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

// Turns a user-chosen name into a folder/file name that is valid on macOS, Windows and Linux.
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f/\\:*?"<>|]/g, '_')
    .trim()
    .replace(/[. ]+$/, '');
  if (!cleaned) return 'untitled';
  return WINDOWS_RESERVED_RE.test(cleaned) ? `${cleaned}_` : cleaned;
}

// Creates exports/<name>/ and returns its path. With clear, files left from an earlier export are removed first.
export async function prepareExportDir(exportsDir: string, name: string, { clear = false } = {}): Promise<string> {
  const dir = path.join(exportsDir, safeFileName(name));
  // maxRetries: on Windows a file still held by Explorer or an antivirus fails the removal with EBUSY/EPERM.
  if (clear) await rm(dir, { recursive: true, force: true, maxRetries: 5 });
  await mkdir(dir, { recursive: true });
  return dir;
}

// Best effort: the export already succeeded, so a failure to open the folder is only logged.
// MOCK_NO_REVEAL=1 skips it (end-to-end runs).
export function revealInFileManager(dir: string): void {
  if (process.env.MOCK_NO_REVEAL) return;
  const command = { darwin: 'open', win32: 'explorer' }[process.platform as string] ?? 'xdg-open';
  execFile(command, [dir], (err) => {
    // explorer.exe exits with code 1 even when it opened the folder, so its exit code means nothing.
    if (err && process.platform !== 'win32') console.warn(`Could not open ${dir}: ${err.message}`);
  });
}
