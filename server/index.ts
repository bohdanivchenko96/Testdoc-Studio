import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { CsvError } from '../shared/xrayCsv';
import { createDocStore } from './docStore';
import { docsRouter } from './docsRouter';
import { BadRequestError, ConflictError, NotFoundError } from './errors';
import { createTestStore } from './testStore';
import { testsRouter } from './testsRouter';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 4400);
const ROOT = path.resolve(import.meta.dirname, '..');
// Overridable so an end-to-end run can use throwaway folders.
const DATA_DIR = process.env.MOCK_DATA_DIR ?? path.join(ROOT, 'data');
const EXPORTS_DIR = process.env.MOCK_EXPORTS_DIR ?? path.join(ROOT, 'exports');

// The page may load nothing from outside this server: no external images (an !https://…! reference in markup would
// leak the IP), scripts, fonts or requests. Inline scripts and styles stay allowed: Vite's React refresh preamble
// and the editors' inline styles need them.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ws://${HOST}:${PORT}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const app = express();
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  next();
});
// Doc imports carry their images as base64.
app.use(express.json({ limit: '100mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/tests', testsRouter(createTestStore(path.join(DATA_DIR, 'tests')), EXPORTS_DIR));
app.use('/api/docs', docsRouter(createDocStore(path.join(DATA_DIR, 'docs')), EXPORTS_DIR));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use('/api', (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  let status = 500;
  if (err instanceof NotFoundError) status = 404;
  else if (err instanceof BadRequestError || err instanceof CsvError) status = 400;
  else if (err instanceof ConflictError) status = 409;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.message });
});

// Single process and a single port: Vite serves the UI, and its HMR websocket rides on this server instead of
// opening its own port (which would listen on every network interface).
const server = http.createServer(app);
const vite = await createViteServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
app.use(vite.middlewares);

// Without the exit, a second `npm start` would keep running with no port while the browser still talks to the old
// process.
server.on('error', (err) => {
  console.error(`Could not listen on ${HOST}:${PORT}: ${err.message}. Is another \`npm start\` still running?`);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  console.log(`Testdoc Studio running at http://${HOST}:${PORT}`);
});
