import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'failed';

export const SAVE_STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'All changes saved',
  pending: 'Unsaved changes',
  saving: 'Saving…',
  failed: 'Save failed',
};

const SAVE_DELAY_MS = 600;

// Collects patches and saves them shortly after the last change. Pending changes are flushed on unmount,
// so the owning component should be keyed by the record it edits.
export function useAutosave<P extends object>(save: (patch: P) => Promise<void>, onError: (e: unknown) => void) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const pending = useRef<P | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const patch = pending.current;
    if (!patch) return;
    pending.current = null;
    setStatus('saving');
    try {
      await saveRef.current(patch);
      setStatus(pending.current ? 'pending' : 'saved');
    } catch (e) {
      // Edits made while the request was in flight win over the failed patch.
      pending.current = { ...patch, ...(pending.current as P | null) };
      setStatus('failed');
      onError(e);
    }
  }, [onError]);

  const schedule = useCallback(
    (patch: P) => {
      pending.current = { ...pending.current, ...patch };
      setStatus('pending');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  useEffect(
    () => () => {
      void flush();
    },
    [flush],
  );

  return { status, schedule, flush };
}
