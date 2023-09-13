// Flags: --instantiation

import * as assert from 'node:assert';
// @ts-ignore
import { importObject, WasiHttp } from '@bytecodealliance/preview2-shim';

// @ts-ignore
import { instantiate } from '../output/wasi-http-proxy/wasi-http-proxy.js';
import * as helpers from './helpers.js';

async function run() {
  const wasiHttp = new WasiHttp();
  importObject['http'] = {
    ...importObject['http'],
    outgoingHandler: wasiHttp,
    types: wasiHttp,
  };
  importObject['io'] = {
    ...importObject['io'],
    streams: {
      ...importObject['io']['streams'],
      ...wasiHttp,
    },
  };
  const m = await instantiate(
    helpers.loadWasm,
    importObject
  );
  const commands = m['test:jco/commands'];
  const incomingHandler = m['wasi:http/incoming-handler'];

  assert.equal(
    commands.getExample(),
    JSON.stringify({
      status: 200,
      headers: [
        ['connection', 'keep-alive'],
        ['content-type', 'text/plain'],
        ['date', 'null'],
        ['keep-alive', 'timeout=5'],
        ['transfer-encoding', 'chunked'],
        ['x-wasi', 'mock-server'],
      ],
      body: 'hello world',
    })
  );

  const handle = () => incomingHandler.handle(0, 1);
  assert.throws(handle, WebAssembly.RuntimeError('unreachable'));
}

await run();
