import { _setEnv } from "@bytecodealliance/preview2-shim/cli";
import { _setPreopens } from "@bytecodealliance/preview2-shim/filesystem";
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

export const testDir = await mkdtemp(tmpdir());

_setPreopens({ "/": testDir });

const worker = new Worker(fileURLToPath(import.meta.url).slice(0, -7) + 'http-server.js');
const PORT = await new Promise(resolve => worker.on('message', resolve));

_setEnv({
  'HTTP_SERVER': `localhost:${PORT}`
});

worker.unref();
