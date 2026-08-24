import { mkdtemp } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { fileURLToPath, URL } from 'node:url';

import { _setEnv } from '@bytecodealliance/preview2-shim/cli';
import { _setPreopens } from '@bytecodealliance/preview2-shim/filesystem';
import { _forbiddenHeaders } from '@bytecodealliance/preview2-shim/http';

export const testDir = await mkdtemp('./tests/output/http');

_setPreopens({ '/': testDir });
_forbiddenHeaders.add('custom-forbidden-header');

const worker = new Worker(
    fileURLToPath(new URL('./http-server.mjs', import.meta.url))
);
const PORT = await new Promise((resolve) => worker.on('message', resolve));

_setEnv({
    HTTP_SERVER: `localhost:${PORT}`,
});

if (worker.unref) worker.unref();
