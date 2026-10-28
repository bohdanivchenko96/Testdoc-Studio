import type { Doc, DocSummary } from '../shared/doc';
import type { Step, TestCase, TestSummary } from '../shared/testCase';

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `${res.status} ${res.statusText}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const testsApi = {
  list: () => request<TestSummary[]>('GET', '/api/tests'),
  get: (id: string) => request<TestCase>('GET', `/api/tests/${id}`),
  create: (name: string) => request<TestCase>('POST', '/api/tests', { name }),
  update: (id: string, patch: { name?: string; steps?: Step[] }) => request<TestCase>('PUT', `/api/tests/${id}`, patch),
  duplicate: (id: string) => request<TestCase>('POST', `/api/tests/${id}/duplicate`),
  remove: (id: string) => request<void>('DELETE', `/api/tests/${id}`),
  importCsv: (name: string, csv: string) => request<TestCase>('POST', '/api/tests/import', { name, csv }),
  exportCsv: (id: string) => request<{ path: string }>('POST', `/api/tests/${id}/export`),
};

export interface DiagramPayload {
  json: string;
  mmd: string;
  // PNG bytes as base64.
  png: string;
}

export interface ImportedFile {
  name: string;
  // base64
  data: string;
}

export const docsApi = {
  current: () => request<Doc>('GET', '/api/docs/current'),
  archive: () => request<DocSummary[]>('GET', '/api/docs/archive'),
  create: () => request<Doc>('POST', '/api/docs'),
  update: (id: string, patch: { name?: string; markup?: string }) => request<DocSummary>('PUT', `/api/docs/${id}`, patch),
  open: (id: string) => request<Doc>('POST', `/api/docs/${id}/open`),
  remove: (id: string) => request<void>('DELETE', `/api/docs/${id}`),
  exportDoc: (id: string) => request<{ path: string; warnings: string[] }>('POST', `/api/docs/${id}/export`),
  importDoc: (name: string | null, markup: string, files: ImportedFile[]) =>
    request<{ doc: Doc; warnings: string[] }>('POST', '/api/docs/import', { name, markup, files }),
  saveDiagram: (id: string, diagram: string | null, payload: DiagramPayload) =>
    diagram
      ? request<{ name: string }>('PUT', `/api/docs/${id}/diagrams/${diagram}`, payload)
      : request<{ name: string }>('POST', `/api/docs/${id}/diagrams`, payload),
  fileUrl: (id: string, name: string, version = 0) => `/api/docs/${id}/files/${encodeURIComponent(name)}?v=${version}`,

  async addImage(id: string, png: Blob): Promise<string> {
    const res = await fetch(`/api/docs/${id}/images`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? `${res.status} ${res.statusText}`);
    }
    return ((await res.json()) as { name: string }).name;
  },
};

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
