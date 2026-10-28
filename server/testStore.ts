import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Step, TestCase, TestSummary } from '../shared/testCase';
import { NotFoundError } from './errors';
import { isMissing, writeAtomic } from './fsUtil';

const ID_RE = /^[0-9a-f-]{36}$/;

// One JSON file per test under `dir`.
export function createTestStore(dir: string) {
  function fileOf(id: string): string {
    if (!ID_RE.test(id)) throw new NotFoundError(`Test ${id} not found`);
    return path.join(dir, `${id}.json`);
  }

  async function write(test: TestCase): Promise<TestCase> {
    await mkdir(dir, { recursive: true });
    await writeAtomic(fileOf(test.id), JSON.stringify(test, null, 2) + '\n');
    return test;
  }

  async function get(id: string): Promise<TestCase> {
    try {
      return JSON.parse(await readFile(fileOf(id), 'utf8')) as TestCase;
    } catch (e) {
      if (isMissing(e)) throw new NotFoundError(`Test ${id} not found`);
      throw e;
    }
  }

  async function list(): Promise<TestSummary[]> {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (e) {
      if (isMissing(e)) return [];
      throw e;
    }
    const tests = await Promise.all(
      names.filter((n) => n.endsWith('.json')).map((n) => get(n.slice(0, -'.json'.length))),
    );
    return tests
      .map(({ id, name, updatedAt, steps }) => ({ id, name, updatedAt, stepCount: steps.length }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  function create(name: string, steps: Step[] = []): Promise<TestCase> {
    return write({ id: randomUUID(), name, updatedAt: new Date().toISOString(), steps });
  }

  async function update(id: string, patch: { name?: string; steps?: Step[] }): Promise<TestCase> {
    const test = await get(id);
    return write({ ...test, ...patch, updatedAt: new Date().toISOString() });
  }

  async function duplicate(id: string): Promise<TestCase> {
    const test = await get(id);
    return create(`${test.name} (copy)`, test.steps);
  }

  async function remove(id: string): Promise<void> {
    await get(id);
    await rm(fileOf(id));
  }

  return { list, get, create, update, duplicate, remove };
}

export type TestStore = ReturnType<typeof createTestStore>;
