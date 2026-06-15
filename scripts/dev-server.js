import { createServer, get } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 1420);

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

function probeExistingDevServer() {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(value);
      request.destroy();
    };

    const request = get(`http://127.0.0.1:${port}/`, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
        if (/NEXUS|nexus-localization-toolkit/i.test(body)) {
          finish(response.statusCode === 200);
        } else if (body.length > 16384) {
          finish(false);
        }
      });
      response.on('end', () => {
        finish(response.statusCode === 200 && /NEXUS|nexus-localization-toolkit/i.test(body));
      });
    });

    request.setTimeout(1200, () => {
      finish(false);
    });
    request.on('error', () => {
      if (!settled) resolve(false);
    });
  });
}

function resolveRequestPath(url) {
  const requestPath = decodeURIComponent(new URL(url, `http://localhost:${port}`).pathname);
  const normalizedPath = normalize(requestPath === '/' ? '/index.html' : requestPath);
  const filePath = join(rootDir, normalizedPath);

  if (!filePath.startsWith(rootDir)) {
    return null;
  }

  return filePath;
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

server.on('error', async error => {
  if (error?.code === 'EADDRINUSE') {
    const existingServerLooksValid = await probeExistingDevServer();
    if (existingServerLooksValid) {
      console.log(`NEXUS web dev server is already running at http://127.0.0.1:${port}`);
      process.exit(0);
    }

    console.error(`Port ${port} is already in use, but it does not look like a NEXUS dev server.`);
    console.error('Close the process using that port, or run with another PORT value.');
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`NEXUS web dev server running at http://127.0.0.1:${port}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
