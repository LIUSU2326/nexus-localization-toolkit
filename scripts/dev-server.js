import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 1420);
const host = '127.0.0.1';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function resolveRequestPath(url) {
  const requestPath = decodeURIComponent(new URL(url, `http://localhost:${port}`).pathname);
  const normalizedPath = normalize(requestPath === '/' ? '/index.html' : requestPath);
  const filePath = join(rootDir, normalizedPath);

  if (!filePath.startsWith(rootDir)) {
    return null;
  }

  return filePath;
}

function checkExistingServer() {
  return new Promise((resolveExisting) => {
    const request = globalThis.fetch
      ? fetch(`http://${host}:${port}/index.html`, { signal: AbortSignal.timeout(1500) })
        .then(async (response) => {
          const text = await response.text();
          resolveExisting(response.ok && text.includes('NEXUS'));
        })
        .catch(() => resolveExisting(false))
      : null;

    if (!request) {
      resolveExisting(false);
    }
  });
}

async function handleListenError(error) {
  if (error?.code !== 'EADDRINUSE') {
    throw error;
  }

  const isNexusServer = await checkExistingServer();

  if (isNexusServer) {
    console.log(`NEXUS web dev server is already running at http://${host}:${port}`);
    console.log('Reusing the existing server for this desktop session.');
    process.exit(0);
    return;
  }

  console.error(`[ERROR] Port ${port} is already in use by another app.`);
  console.error(`Close the process using ${host}:${port}, then start NEXUS again.`);
  process.exit(1);
}

const server = createServer((request, response) => {
  const filePath = resolveRequestPath(request.url || '/');

  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream'
  });
  createReadStream(filePath).pipe(response);
});

server.on('error', (error) => {
  handleListenError(error).catch((fatalError) => {
    console.error(fatalError);
    process.exit(1);
  });
});

server.listen(port, host, () => {
  console.log(`NEXUS web dev server running at http://${host}:${port}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
