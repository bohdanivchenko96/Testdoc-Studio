import { copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { FILE_NAME_RE } from '../shared/doc';
import { referencedFiles, tableMerges } from '../shared/wikiMarkup';
import type { DocStore } from './docStore';
import { BadRequestError, NotFoundError } from './errors';
import { prepareExportDir, revealInFileManager } from './exportDir';
import { isMissing } from './fsUtil';
import { tablesPage } from './tablesPage';

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

function parseName(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new BadRequestError('Name is required');
  return value.trim();
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new BadRequestError(`${field} must be a string`);
  return value;
}

function decodePng(base64: unknown, field: string): Buffer {
  const png = Buffer.from(requireString(base64, field), 'base64');
  checkPng(png);
  return png;
}

function checkPng(data: Uint8Array): void {
  if (!PNG_MAGIC.every((b, i) => data[i] === b)) throw new BadRequestError('Expected a PNG image');
}

function parseDiagram(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  return { json: requireString(b.json, 'json'), mmd: requireString(b.mmd, 'mmd'), png: decodePng(b.png, 'png') };
}

export function docsRouter(store: DocStore, exportsDir: string): express.Router {
  const router = express.Router();

  router.get('/current', async (_req, res) => {
    res.json(await store.current());
  });

  router.get('/archive', async (_req, res) => {
    res.json(await store.archive());
  });

  // New doc: the current one goes to the archive.
  router.post('/', async (_req, res) => {
    res.status(201).json(await store.create('Untitled doc'));
  });

  // Body: { name?, markup, files: [{ name, data (base64) }] }, built from a dropped export folder.
  // Only files the markup references are kept; references without a dropped file become warnings.
  router.post('/import', async (req, res) => {
    const markup = requireString(req.body?.markup, 'markup');
    const name = typeof req.body.name === 'string' && req.body.name.trim() ? req.body.name.trim() : 'Imported doc';
    const dropped = new Map<string, Buffer>();
    for (const f of Array.isArray(req.body.files) ? req.body.files : []) {
      if (typeof f?.name === 'string' && typeof f.data === 'string') dropped.set(f.name, Buffer.from(f.data, 'base64'));
    }
    const files: { name: string; data: Buffer }[] = [];
    const warnings: string[] = [];
    for (const ref of referencedFiles(markup)) {
      const data = dropped.get(ref);
      if (!FILE_NAME_RE.test(ref)) warnings.push(`Unsupported file name: ${ref}`);
      else if (!data) warnings.push(`Missing file: ${ref}`);
      else files.push({ name: ref, data });
    }
    res.status(201).json({ doc: await store.create(name, markup, files), warnings });
  });

  router.get('/:id', async (req, res) => {
    res.json(await store.get(req.params.id));
  });

  router.put('/:id', async (req, res) => {
    const patch: { name?: string; markup?: string } = {};
    if (req.body?.name !== undefined) patch.name = parseName(req.body.name);
    if (req.body?.markup !== undefined) patch.markup = requireString(req.body.markup, 'markup');
    res.json(await store.update(req.params.id, patch));
  });

  router.delete('/:id', async (req, res) => {
    await store.remove(req.params.id);
    res.status(204).end();
  });

  router.post('/:id/open', async (req, res) => {
    res.json(await store.open(req.params.id));
  });

  // Body: the PNG bytes (the browser converts other image types first).
  router.post('/:id/images', express.raw({ type: 'image/png', limit: '50mb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body)) throw new BadRequestError('Expected Content-Type image/png');
    checkPng(req.body);
    res.status(201).json({ name: await store.addImage(req.params.id, req.body) });
  });

  // Body: { json, mmd, png (base64) }.
  router.post('/:id/diagrams', async (req, res) => {
    res.status(201).json({ name: await store.saveDiagram(req.params.id, null, parseDiagram(req.body)) });
  });

  router.put('/:id/diagrams/:diagram', async (req, res) => {
    res.json({ name: await store.saveDiagram(req.params.id, req.params.diagram, parseDiagram(req.body)) });
  });

  router.get('/:id/files/:name', (req, res, next) => {
    // Diagram PNGs are overwritten in place, so the browser must not cache them.
    res.sendFile(store.filePath(req.params.id, req.params.name), { headers: { 'Cache-Control': 'no-store' } }, (err) => {
      if (err) next(isMissing(err) ? new NotFoundError(`File ${req.params.name} not found`) : err);
    });
  });

  router.post('/:id/export', async (req, res) => {
    const doc = await store.get(req.params.id);
    const dir = await prepareExportDir(exportsDir, doc.name, { clear: true });
    await writeFile(path.join(dir, 'page.txt'), doc.markup);
    const warnings: string[] = [];
    for (const name of referencedFiles(doc.markup)) {
      if (!FILE_NAME_RE.test(name)) warnings.push(`Unsupported file name: ${name}`);
      else if (!doc.files.includes(name)) warnings.push(`Missing file: ${name}`);
      else await copyFile(store.filePath(doc.id, name), path.join(dir, name));
    }
    // Wiki markup can't carry merged cells: page.html has those tables as HTML to copy and paste into Confluence.
    // The ⇐/⇑ markers stay in page.txt, so merging by hand still works and the mock can import the folder again.
    const merged = tableMerges(doc.markup);
    if (merged.length) await writeFile(path.join(dir, 'page.html'), tablesPage(doc.name, merged));
    for (const { table, merges } of merged) {
      warnings.push(
        `Table ${table} has ${merges} merged cell${merges === 1 ? '' : 's'}: in Confluence, replace it with "Copy table ${table}" ` +
          'from page.html, or merge the cells marked ⇐ (into the left one) and ⇑ (into the one above) by hand.',
      );
    }
    revealInFileManager(dir);
    res.json({ path: dir, warnings });
  });

  return router;
}
