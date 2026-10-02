// Local dev server: serves the static app and the same /api/chat handler used on Netlify.
//   AI_API_KEY=... AI_BASE_URL=... node dev-server.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { handleChat } from './netlify/shared/chat-core.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 8888;

// Load a local .env file if present (KEY=value lines).
try {
  const env = await readFile(path.join(root, '.env'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { /* no .env file */ }

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/assistant.js': ['assistant.js', 'text/javascript; charset=utf-8'],
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/chat') {
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: req.method === 'POST' ? Readable.toWeb(req) : undefined,
      duplex: 'half',
    });
    const abort = new AbortController();
    res.on('close', () => abort.abort());
    const response = await handleChat(new Request(request, { signal: abort.signal }), {
      provider: process.env.AI_PROVIDER === 'anthropic' ? 'anthropic' : 'openai',
      apiKey: process.env.AI_PROVIDER === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.AI_API_KEY,
      baseUrl: process.env.AI_BASE_URL,
      clientIp: req.socket.remoteAddress,
      model: process.env.AI_MODEL,
    });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(res);
    else res.end();
    return;
  }

  const entry = files[url.pathname];
  if (!entry) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': entry[1], 'cache-control': 'no-store' });
  res.end(await readFile(path.join(root, entry[0])));
}).listen(port, () => console.log(`ER Diagram Designer running at http://localhost:${port}`));
