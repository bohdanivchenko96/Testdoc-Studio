import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import type { Doc } from '../../shared/doc';
import { docsApi, errorMessage } from '../api';
import { ArchivePanel } from './ArchivePanel';
import { DocEditor } from './DocEditor';
import { blobToBase64, readDrop } from './files';

type Banner = { kind: 'error' | 'info' | 'warning'; text: string; details?: string[] };

const isFileDrag = (e: DragEvent) => e.dataTransfer.types.includes('Files');

// The markup of a dropped export: page.txt, or the only .txt/.wiki file.
function findPage(files: File[]): File | undefined {
  const page = files.find((f) => f.name === 'page.txt');
  if (page) return page;
  const candidates = files.filter((f) => /\.(txt|wiki)$/i.test(f.name));
  return candidates.length === 1 ? candidates[0] : undefined;
}

// One current doc; New doc, Open and Import swap it (the previous one goes to the archive).
export function DocsSection() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [fileOver, setFileOver] = useState(false);
  const flushEditor = useRef<(() => Promise<void>) | null>(null);

  const showError = useCallback((e: unknown) => setBanner({ kind: 'error', text: errorMessage(e) }), []);

  useEffect(() => {
    docsApi.current().then(setDoc, showError);
  }, [showError]);

  // Saves pending edits, then makes another doc current.
  const switchTo = async (load: () => Promise<Doc>) => {
    setBanner(null);
    try {
      await flushEditor.current?.();
      setDoc(await load());
    } catch (e) {
      showError(e);
    }
  };

  const reportWarnings = (text: string, warnings: string[]) =>
    setBanner(warnings.length ? { kind: 'warning', text, details: warnings } : { kind: 'info', text });

  const importDrop = async (entries: (FileSystemEntry | null)[], dropped: File[]) => {
    setBanner(null);
    try {
      const { folderName, files } = await readDrop(entries, dropped);
      const page = findPage(files);
      if (!page) throw new Error('Drop an export folder, or page.txt together with its files');
      const markup = await page.text();
      const attachments = await Promise.all(
        files.filter((f) => f !== page).map(async (f) => ({ name: f.name, data: await blobToBase64(f) })),
      );
      await flushEditor.current?.();
      const { doc: imported, warnings } = await docsApi.importDoc(folderName, markup, attachments);
      setDoc(imported);
      reportWarnings(`Imported "${imported.name}". The previous doc is in the archive.`, warnings);
    } catch (e) {
      showError(e);
    }
  };

  return (
    <div
      className="docs-section"
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setFileOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileOver(false);
      }}
      onDrop={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setFileOver(false);
        void importDrop([...e.dataTransfer.items].map((i) => i.webkitGetAsEntry()), [...e.dataTransfer.files]);
      }}
    >
      {banner && (
        <div className={`banner banner-${banner.kind}`}>
          <div>
            <span>{banner.text}</span>
            {banner.details && (
              <ul className="banner-details">
                {banner.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" title="Dismiss" onClick={() => setBanner(null)}>
            ✕
          </button>
        </div>
      )}
      {doc ? (
        <DocEditor
          key={doc.id}
          doc={doc}
          flushRef={flushEditor}
          onError={showError}
          onExported={(path, warnings) => reportWarnings(`Exported to ${path}`, warnings)}
          actions={
            <>
              <button type="button" className="btn" onClick={() => switchTo(docsApi.create)}>
                New doc
              </button>
              <button type="button" className="btn" onClick={() => setArchiveOpen((o) => !o)}>
                Archive
              </button>
            </>
          }
        />
      ) : (
        <p className="muted">Loading…</p>
      )}
      {archiveOpen && (
        <ArchivePanel
          onError={showError}
          onClose={() => setArchiveOpen(false)}
          onOpen={(id) => {
            setArchiveOpen(false);
            void switchTo(() => docsApi.open(id));
          }}
        />
      )}
      {fileOver && <div className="drop-overlay">Drop an export folder (or page.txt with its files) to import it</div>}
    </div>
  );
}
