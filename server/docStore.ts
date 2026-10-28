import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FILE_NAME_RE, type Doc, type DocMeta, type DocSummary } from '../shared/doc';
import { referencedFiles } from '../shared/wikiMarkup';
import { BadRequestError, ConflictError, NotFoundError } from './errors';
import { createQueue, isMissing, writeAtomic } from './fsUtil';

const ID_RE = /^[0-9a-f-]{36}$/;
const DIAGRAM_RE = /^diagram-\d+$/;
const PAGE = 'page.wiki';
const META = 'meta.json';
const STATE = 'state.json';
const RESERVED = new Set([PAGE, META]);

export interface DiagramFiles {
  json: string;
  mmd: string;
  png: Uint8Array;
}

// data/docs/<id>/ per doc; data/docs/state.json says which doc is current. Every other doc is the archive.
export function createDocStore(dir: string) {
  const serial = createQueue();

  function docDir(id: string): string {
    if (!ID_RE.test(id)) throw new NotFoundError(`Doc ${id} not found`);
    return path.join(dir, id);
  }

  function filePath(id: string, name: string): string {
    if (!FILE_NAME_RE.test(name) || RESERVED.has(name) || name.endsWith('.tmp')) {
      throw new BadRequestError(`Unsupported file name: ${name}`);
    }
    return path.join(docDir(id), name);
  }

  async function currentId(): Promise<string | null> {
    try {
      return (JSON.parse(await readFile(path.join(dir, STATE), 'utf8')) as { currentId: string | null }).currentId;
    } catch (e) {
      if (isMissing(e)) return null;
      throw e;
    }
  }

  async function setCurrent(id: string): Promise<void> {
    await mkdir(dir, { recursive: true });
    await writeAtomic(path.join(dir, STATE), JSON.stringify({ currentId: id }, null, 2) + '\n');
  }

  async function readMeta(id: string): Promise<DocMeta> {
    try {
      return JSON.parse(await readFile(path.join(docDir(id), META), 'utf8')) as DocMeta;
    } catch (e) {
      if (isMissing(e)) throw new NotFoundError(`Doc ${id} not found`);
      throw e;
    }
  }

  async function writeMeta(id: string, meta: DocMeta): Promise<void> {
    await writeAtomic(path.join(docDir(id), META), JSON.stringify(meta, null, 2) + '\n');
  }

  async function fileNames(id: string): Promise<string[]> {
    const names = await readdir(docDir(id));
    return names.filter((n) => FILE_NAME_RE.test(n) && !RESERVED.has(n) && !n.endsWith('.tmp')).sort();
  }

  async function get(id: string): Promise<Doc> {
    const meta = await readMeta(id);
    const markup = await readFile(path.join(docDir(id), PAGE), 'utf8');
    return { id, ...meta, markup, files: await fileNames(id) };
  }

  // Highest N among <prefix>-N.* files and markup references + 1. Files are never deleted, so a number is never
  // reused. References count too: an import can lack a file the Confluence page already has as an attachment.
  async function nextNumber(id: string, prefix: 'image' | 'diagram'): Promise<number> {
    const markup = await readFile(path.join(docDir(id), PAGE), 'utf8');
    let max = 0;
    for (const name of [...(await fileNames(id)), ...referencedFiles(markup)]) {
      const m = new RegExp(`^${prefix}-(\\d+)\\.`).exec(name);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return max + 1;
  }

  // Meta is written last: a folder without meta.json (an interrupted create) is ignored by list().
  async function createUnqueued(name: string, markup: string, files: { name: string; data: Uint8Array }[]) {
    const id = randomUUID();
    const now = new Date().toISOString();
    await mkdir(docDir(id), { recursive: true });
    for (const f of files) await writeFile(filePath(id, f.name), f.data);
    await writeAtomic(path.join(docDir(id), PAGE), markup);
    await writeMeta(id, { name, createdAt: now, updatedAt: now });
    await setCurrent(id);
    return get(id);
  }

  async function list(): Promise<DocSummary[]> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch (e) {
      if (isMissing(e)) return [];
      throw e;
    }
    const docs: DocSummary[] = [];
    for (const id of entries.filter((e) => ID_RE.test(e))) {
      try {
        docs.push({ id, ...(await readMeta(id)) });
      } catch (e) {
        if (!(e instanceof NotFoundError)) throw e;
      }
    }
    return docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  return {
    get,
    filePath,

    // The current doc; creates an empty one when there is none yet.
    current: () =>
      serial(async () => {
        const id = await currentId();
        if (id) {
          try {
            return await get(id);
          } catch (e) {
            if (!(e instanceof NotFoundError)) throw e;
          }
        }
        return createUnqueued('Untitled doc', '', []);
      }),

    archive: async (): Promise<DocSummary[]> => {
      const id = await currentId();
      return (await list()).filter((d) => d.id !== id);
    },

    // New doc or import: the result becomes current, the previous current doc joins the archive.
    create: (name: string, markup = '', files: { name: string; data: Uint8Array }[] = []) =>
      serial(() => createUnqueued(name, markup, files)),

    update: (id: string, patch: { name?: string; markup?: string }) =>
      serial(async (): Promise<DocSummary> => {
        const meta = await readMeta(id);
        if (patch.markup !== undefined) await writeAtomic(path.join(docDir(id), PAGE), patch.markup);
        const next = { ...meta, ...(patch.name !== undefined && { name: patch.name }), updatedAt: new Date().toISOString() };
        await writeMeta(id, next);
        return { id, ...next };
      }),

    open: (id: string) =>
      serial(async () => {
        const doc = await get(id);
        await setCurrent(id);
        return doc;
      }),

    remove: (id: string) =>
      serial(async () => {
        if (id === (await currentId())) throw new ConflictError('The current doc cannot be deleted');
        await readMeta(id);
        await rm(docDir(id), { recursive: true });
      }),

    addImage: (id: string, png: Uint8Array) =>
      serial(async () => {
        await readMeta(id);
        const name = `image-${await nextNumber(id, 'image')}.png`;
        await writeFile(filePath(id, name), png);
        return name;
      }),

    // diagram is null for a new diagram; an existing one (diagram-N) is overwritten in place.
    saveDiagram: (id: string, diagram: string | null, files: DiagramFiles) =>
      serial(async () => {
        await readMeta(id);
        const name = diagram ?? `diagram-${await nextNumber(id, 'diagram')}`;
        if (!DIAGRAM_RE.test(name)) throw new BadRequestError(`Unsupported diagram name: ${name}`);
        await writeAtomic(filePath(id, `${name}.json`), files.json);
        await writeAtomic(filePath(id, `${name}.mmd`), files.mmd);
        await writeAtomic(filePath(id, `${name}.png`), files.png);
        return name;
      }),
  };
}

export type DocStore = ReturnType<typeof createDocStore>;
