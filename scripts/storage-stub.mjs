/**
 * A local stand-in for S3, so cheque images work without object storage.
 *
 * The API stores cheque photographs in S3. On a machine with no Docker and no
 * MinIO there is nothing listening, so uploading a cheque fails and eight of
 * the end-to-end tests fail with it. This answers the five requests the API
 * actually makes — HeadBucket, CreateBucket, PutObject, GetObject and
 * DeleteObject — and nothing else.
 *
 * **This is not S3 and must never be pointed at by anything real.** It does no
 * authentication: it does not read the `Authorization` header, so any caller
 * that can reach the port can read or delete every cheque image in it. It
 * binds to 127.0.0.1 only, and refuses to start when `NODE_ENV=production`.
 * Both of those are deliberate and neither should be relaxed.
 *
 * Objects are written to disk rather than held in memory, under
 * `~/ChequeFlowData/storage` — the same place the database lives, and
 * deliberately outside this repository so that a clean checkout, a branch
 * switch or `rm -rf node_modules` cannot reach it. In memory they vanished on
 * every restart, which meant a cheque photographed on Monday was a broken
 * image by Tuesday.
 *
 *   node scripts/storage-stub.mjs
 *   bash scripts/storage.sh start|stop|status
 *
 * Environment: STORAGE_STUB_PORT (9000), STORAGE_STUB_DIR
 * (~/ChequeFlowData/storage).
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

if (process.env.NODE_ENV === 'production') {
  console.error('The storage stub is a development tool and will not run in production.');
  process.exit(1);
}

const PORT = Number(process.env.STORAGE_STUB_PORT ?? 9000);
const ROOT = resolve(
  process.env.STORAGE_STUB_DIR ?? join(homedir(), 'ChequeFlowData', 'storage'),
);

/**
 * Turns a request path into a file path, refusing anything that would escape.
 *
 * A key is attacker-controlled in principle, and `..` in one would otherwise
 * let a caller write anywhere the process can reach. Returns `null` rather
 * than throwing so the caller answers 400 instead of crashing the stub.
 */
function pathFor(key) {
  if (!key) return null;
  const full = resolve(ROOT, key);
  return full === ROOT || full.startsWith(ROOT + sep) ? full : null;
}

/** Buckets are directories; an object key is everything after the first segment. */
function split(key) {
  const slash = key.indexOf('/');
  return slash === -1
    ? { bucket: key, object: '' }
    : { bucket: key.slice(0, slash), object: key.slice(slash + 1) };
}

function read(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolveBody(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

const server = createServer((request, response) => {
  void handle(request, response).catch((error) => {
    console.error(error);
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
});

async function handle(request, response) {
  // The presigned URLs the API hands out carry a query string. It is a
  // signature this stub does not check, so only the path is read.
  const key = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(
    /^\/+/,
    '',
  );
  const target = pathFor(key);
  if (!target) {
    response.writeHead(400, { 'Content-Type': 'application/xml' });
    response.end('<Error><Code>InvalidRequest</Code></Error>');
    return;
  }

  const { object } = split(key);

  switch (request.method) {
    case 'PUT': {
      const body = await read(request);
      // A bucket create is a PUT with no object part. Making the directory is
      // the whole of it — there is nothing to store.
      await mkdir(object ? dirname(target) : target, { recursive: true });
      if (object) await writeFile(target, body);
      response.writeHead(200, { ETag: '"stub"' });
      response.end();
      return;
    }

    case 'HEAD': {
      const found = await stat(target).catch(() => null);
      // HeadBucket asks about the directory; HeadObject about the file.
      if (!found || (object ? !found.isFile() : !found.isDirectory())) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, { 'Content-Length': String(object ? found.size : 0) });
      response.end();
      return;
    }

    case 'GET': {
      const found = await stat(target).catch(() => null);
      if (!found?.isFile()) {
        response.writeHead(404, { 'Content-Type': 'application/xml' });
        response.end('<Error><Code>NoSuchKey</Code></Error>');
        return;
      }
      // The stored bytes are returned as an opaque blob: the API records the
      // content type in the database and sets it on the way out, so guessing
      // one here would only ever be a chance to guess it wrong.
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(found.size),
      });
      createReadStream(target).pipe(response);
      return;
    }

    case 'DELETE': {
      // S3 deletes are idempotent: a missing key is a 204, not a 404.
      await rm(target, { force: true });
      response.writeHead(204);
      response.end();
      return;
    }

    default:
      response.writeHead(405);
      response.end();
  }
}

await mkdir(ROOT, { recursive: true });

// Loopback only. This has no authentication, so it must not be reachable from
// anywhere but this machine.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`storage stub on http://127.0.0.1:${PORT} — objects in ${ROOT}`);
});
