import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The JSON dictionaries are shipped as-is next to the compiled output so that
// bundlers (Next.js, Metro) can import them without going through TypeScript.
const here = path.dirname(fileURLToPath(import.meta.url));
const from = path.join(here, '..', 'src', 'messages');
const to = path.join(here, '..', 'dist', 'messages');

await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });
