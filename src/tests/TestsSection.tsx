import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import type { TestSummary } from '../../shared/testCase';
import { errorMessage, testsApi } from '../api';
import { TestEditor } from './TestEditor';
import { TestList } from './TestList';

type Banner = { kind: 'error' | 'info'; text: string };

const isFileDrag = (e: DragEvent) => e.dataTransfer.types.includes('Files');

export function TestsSection() {
  const [tests, setTests] = useState<TestSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renameRequest, setRenameRequest] = useState({ id: '', count: 0 });
  const [banner, setBanner] = useState<Banner | null>(null);
  const [fileOver, setFileOver] = useState(false);
  const flushEditor = useRef<(() => Promise<void>) | null>(null);

  const showError = useCallback((e: unknown) => setBanner({ kind: 'error', text: errorMessage(e) }), []);
  const showInfo = useCallback((text: string) => setBanner({ kind: 'info', text }), []);
  const refresh = useCallback(() => testsApi.list().then(setTests, showError), [showError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Runs a list action and reports its failure in the banner.
  const run = (action: () => Promise<void>) => () => {
    setBanner(null);
    action().catch(showError);
  };

  const rename = (id: string) => {
    setSelectedId(id);
    setRenameRequest((r) => ({ id, count: r.count + 1 }));
  };

  const create = run(async () => {
    const test = await testsApi.create('Untitled test');
    await refresh();
    rename(test.id);
  });

  const duplicate = (id: string) =>
    run(async () => {
      if (id === selectedId) await flushEditor.current?.();
      const copy = await testsApi.duplicate(id);
      await refresh();
      setSelectedId(copy.id);
    })();

  const remove = (test: TestSummary) => {
    if (!window.confirm(`Delete test "${test.name}"? This cannot be undone.`)) return;
    run(async () => {
      if (test.id === selectedId) {
        await flushEditor.current?.();
        setSelectedId(null);
      }
      await testsApi.remove(test.id);
      await refresh();
    })();
  };

  const importFiles = (files: File[]) =>
    run(async () => {
      let last: string | null = null;
      for (const file of files) {
        if (!/\.csv$/i.test(file.name)) throw new Error(`${file.name} is not a .csv file`);
        try {
          last = (await testsApi.importCsv(file.name.replace(/\.csv$/i, ''), await file.text())).id;
        } catch (e) {
          throw new Error(`${file.name}: ${errorMessage(e)}`);
        } finally {
          await refresh();
        }
      }
      if (last) setSelectedId(last);
      showInfo(files.length === 1 ? `Imported ${files[0].name}` : `Imported ${files.length} files`);
    })();

  return (
    <div
      className="tests-section"
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
        importFiles([...e.dataTransfer.files]);
      }}
    >
      <TestList
        tests={tests}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={create}
        onRename={rename}
        onDuplicate={duplicate}
        onDelete={remove}
      />
      <div className="tests-main">
        {banner && (
          <div className={`banner banner-${banner.kind}`}>
            <span>{banner.text}</span>
            <button type="button" title="Dismiss" onClick={() => setBanner(null)}>
              ✕
            </button>
          </div>
        )}
        {selectedId ? (
          <TestEditor
            key={selectedId}
            id={selectedId}
            focusTitle={renameRequest.id === selectedId ? renameRequest.count : 0}
            flushRef={flushEditor}
            onSaved={refresh}
            onError={showError}
            onInfo={showInfo}
          />
        ) : (
          <p className="muted">Select a test, create one, or drop an Xray steps CSV anywhere here to import it.</p>
        )}
      </div>
      {fileOver && <div className="drop-overlay">Drop Xray CSV files to import</div>}
    </div>
  );
}
