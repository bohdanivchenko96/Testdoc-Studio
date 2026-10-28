import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseSteps, serializeSteps } from '../shared/xrayCsv';
import { EXAMPLE_CSV } from '../shared/xrayCsv.fixture';
import { NotFoundError } from './errors';
import { createTestStore, type TestStore } from './testStore';

let dir: string;
let store: TestStore;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'tests-store-'));
  store = createTestStore(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('test store', () => {
  it('keeps an Xray CSV byte-identical through import, storage and export', async () => {
    const { id } = await store.create('Example', parseSteps(EXAMPLE_CSV));
    const fresh = createTestStore(dir);
    expect(serializeSteps((await fresh.get(id)).steps)).toBe(EXAMPLE_CSV);
  });

  it('lists tests by last modified, newest first', async () => {
    const a = await store.create('A');
    const b = await store.create('B');
    await new Promise((r) => setTimeout(r, 5));
    await store.update(a.id, { name: 'A2' });
    expect((await store.list()).map((t) => t.name)).toEqual(['A2', 'B']);
    expect(b.steps).toEqual([]);
  });

  it('duplicates and removes', async () => {
    const step = { action: 'Do', data: '', expectedResult: 'Done' };
    const a = await store.create('A', [step]);
    const copy = await store.duplicate(a.id);
    expect(copy).toMatchObject({ name: 'A (copy)', steps: [step] });
    await store.remove(a.id);
    await expect(store.get(a.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await store.list()).map((t) => t.id)).toEqual([copy.id]);
  });

  it('rejects ids that are not uuids', async () => {
    await expect(store.get('../secret')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns an empty list before the folder exists', async () => {
    expect(await createTestStore(path.join(dir, 'missing')).list()).toEqual([]);
  });
});
