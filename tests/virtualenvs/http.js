import { _setEnv } from "@bytecodealliance/preview2-shim/cli";
import { _setPreopens } from "@bytecodealliance/preview2-shim/filesystem";
import { mkdtemp } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { _forbiddenHeaders } from '@bytecodealliance/preview2-shim/http';

export const testDir = await mkdtemp('./tests/output/http');

_setPreopens({ "/": testDir });
_forbiddenHeaders.add('custom-forbidden-header');

const worker = new Worker(fileURLToPath(import.meta.url).slice(0, -7) + 'http-server.js');
const PORT = await new Promise(resolve => worker.on('message', resolve));

_setEnv({
  'HTTP_SERVER': `localhost:${PORT}`
});

if (worker.unref)
  worker.unref();
