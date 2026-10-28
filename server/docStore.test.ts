import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDocStore, type DocStore } from './docStore';
import { BadRequestError, ConflictError, NotFoundError } from './errors';

let dir: string;
let store: DocStore;
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'doc-store-'));
  store = createDocStore(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('doc store', () => {
  it('creates an empty current doc on first use and returns the same one after', async () => {
    const first = await store.current();
    expect(first).toMatchObject({ name: 'Untitled doc', markup: '', files: [] });
    expect((await store.current()).id).toBe(first.id);
    expect(await store.archive()).toEqual([]);
  });

  it('stores markup verbatim', async () => {
    const { id } = await store.current();
    const markup = 'h1. Title\r\n\r\n* a b\n';
    await store.update(id, { markup, name: 'Spec' });
    expect(await readFile(path.join(dir, id, 'page.wiki'), 'utf8')).toBe(markup);
    expect(await store.get(id)).toMatchObject({ markup, name: 'Spec' });
  });

  it('moves the current doc to the archive on create and swaps on open', async () => {
    const a = await store.current();
    const b = await store.create('B');
    expect((await store.current()).id).toBe(b.id);
    expect((await store.archive()).map((d) => d.id)).toEqual([a.id]);

    await store.open(a.id);
    expect((await store.current()).id).toBe(a.id);
    expect((await store.archive()).map((d) => d.id)).toEqual([b.id]);
  });

  it('deletes only archived docs', async () => {
    const a = await store.current();
    const b = await store.create('B');
    await expect(store.remove(b.id)).rejects.toBeInstanceOf(ConflictError);
    await store.remove(a.id);
    await expect(store.get(a.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('numbers images and diagrams separately and continues after the highest number', async () => {
    const { id } = await store.create('Doc', '', [{ name: 'image-4.png', data: png }]);
    expect(await Promise.all([store.addImage(id, png), store.addImage(id, png)])).toEqual(['image-5.png', 'image-6.png']);

    const files = { json: '{}', mmd: 'flowchart TD', png };
    expect(await store.saveDiagram(id, null, files)).toBe('diagram-1');
    expect(await store.saveDiagram(id, 'diagram-1', { ...files, mmd: 'flowchart LR' })).toBe('diagram-1');
    expect(await readFile(store.filePath(id, 'diagram-1.mmd'), 'utf8')).toBe('flowchart LR');
    expect((await store.get(id)).files).toEqual([
      'diagram-1.json',
      'diagram-1.mmd',
      'diagram-1.png',
      'image-4.png',
      'image-5.png',
      'image-6.png',
    ]);
  });

  it('skips numbers the markup references even when their files are missing', async () => {
    const markup = '!image-3.png!\n\n{info}MERMAID → diagram-2.mmd{info}\n';
    const { id } = await store.create('Imported doc', markup, [{ name: 'image-1.png', data: png }]);
    expect(await store.addImage(id, png)).toBe('image-4.png');
    const files = { json: '{}', mmd: 'flowchart TD', png };
    expect(await store.saveDiagram(id, null, files)).toBe('diagram-3');
  });

  it('rejects unsafe file names and ids', async () => {
    const { id } = await store.current();
    expect(() => store.filePath(id, '../state.json')).toThrow(BadRequestError);
    expect(() => store.filePath(id, 'page.wiki')).toThrow(BadRequestError);
    await expect(store.get('../x')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('recovers when state.json points at a missing doc', async () => {
    const a = await store.current();
    await rm(path.join(dir, a.id), { recursive: true });
    expect((await store.current()).id).not.toBe(a.id);
  });
});
