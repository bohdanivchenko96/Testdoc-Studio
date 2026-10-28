import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import type { Step } from '../shared/testCase';
import { parseSteps, serializeSteps } from '../shared/xrayCsv';
import { prepareExportDir, revealInFileManager, safeFileName } from './exportDir';
import { BadRequestError } from './errors';
import type { TestStore } from './testStore';

function parseName(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new BadRequestError('Name is required');
  return value.trim();
}

function parseStepList(value: unknown): Step[] {
  if (!Array.isArray(value)) throw new BadRequestError('steps must be an array');
  return value.map((s, i) => {
    if (typeof s?.action !== 'string' || typeof s.data !== 'string' || typeof s.expectedResult !== 'string') {
      throw new BadRequestError(`Step ${i + 1} is malformed`);
    }
    return { action: s.action, data: s.data, expectedResult: s.expectedResult };
  });
}

function checkExportable(steps: Step[]): void {
  if (steps.length === 0) throw new BadRequestError('The test has no steps');
  const missing = steps.findIndex((s) => s.action.trim() === '');
  if (missing !== -1) throw new BadRequestError(`Step ${missing + 1}: Action is required`);
}

export function testsRouter(store: TestStore, exportsDir: string): express.Router {
  const router = express.Router();

  router.get('/', async (_req, res) => {
    res.json(await store.list());
  });

  router.post('/', async (req, res) => {
    res.status(201).json(await store.create(parseName(req.body?.name)));
  });

  // Body: { name, csv } where csv is the text of an Xray steps CSV dropped onto the UI.
  router.post('/import', async (req, res) => {
    const name = parseName(req.body?.name);
    if (typeof req.body.csv !== 'string') throw new BadRequestError('csv is required');
    res.status(201).json(await store.create(name, parseSteps(req.body.csv)));
  });

  router.get('/:id', async (req, res) => {
    res.json(await store.get(req.params.id));
  });

  router.put('/:id', async (req, res) => {
    const patch: { name?: string; steps?: Step[] } = {};
    if (req.body?.name !== undefined) patch.name = parseName(req.body.name);
    if (req.body?.steps !== undefined) patch.steps = parseStepList(req.body.steps);
    res.json(await store.update(req.params.id, patch));
  });

  router.delete('/:id', async (req, res) => {
    await store.remove(req.params.id);
    res.status(204).end();
  });

  router.post('/:id/duplicate', async (req, res) => {
    res.status(201).json(await store.duplicate(req.params.id));
  });

  router.post('/:id/export', async (req, res) => {
    const test = await store.get(req.params.id);
    checkExportable(test.steps);
    const dir = await prepareExportDir(exportsDir, test.name);
    const file = path.join(dir, `${safeFileName(test.name)}.csv`);
    await writeFile(file, serializeSteps(test.steps));
    revealInFileManager(dir);
    res.json({ path: file });
  });

  return router;
}
