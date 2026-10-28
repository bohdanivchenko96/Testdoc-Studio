// Browser-side file helpers for Docs: PNG conversion, base64, and reading a dropped folder.

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

// Attachments are always PNG (image-N.png), so other image types are redrawn as PNG.
export async function toPng(image: Blob): Promise<Blob> {
  if (image.type === 'image/png') return image;
  const bitmap = await createImageBitmap(image);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((png) => (png ? resolve(png) : reject(new Error('Could not convert the image to PNG'))), 'image/png'),
  );
}

export interface DroppedFiles {
  // Set when a single folder was dropped.
  folderName: string | null;
  files: File[];
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

// DataTransfer items are only readable during the drop event, so the caller grabs entries and files synchronously.
export async function readDrop(entries: (FileSystemEntry | null)[], files: File[]): Promise<DroppedFiles> {
  const [only] = entries;
  if (entries.length !== 1 || !only?.isDirectory) return { folderName: null, files };

  const reader = (only as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  // readEntries returns batches until it returns an empty one.
  for (let batch = await readEntries(reader); batch.length; batch = await readEntries(reader)) children.push(...batch);
  const folderFiles = await Promise.all(children.filter((c) => c.isFile).map((c) => entryFile(c as FileSystemFileEntry)));
  return { folderName: only.name, files: folderFiles };
}
