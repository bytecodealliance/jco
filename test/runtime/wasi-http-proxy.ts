import * as assert from 'node:assert';
// @ts-ignore
import { commands, incomingHandler } from '../output/wasi-http-proxy/wasi-http-proxy.js';
// import { types } from '@bytecodealliance/preview2-shim/http';
// const { IncomingRequest, ResponseOutparam } = types;

const defaultHeaders = [
  ['connection', 'keep-alive'],
  ['content-type', 'text/plain'],
  ['date', 'null'],
  ['keep-alive', 'timeout=5'],
  ['transfer-encoding', 'chunked'],
  ['x-wasi', 'mock-server'],
];

assert.equal(
  commands.getExample(),
  JSON.stringify({
    status: 200,
    headers: defaultHeaders,
    body: 'hello world',
  })
);
assert.equal(
  commands.postExample(),
  JSON.stringify({
    status: 200,
    headers: defaultHeaders,
    body: '{"key":"value"}',
  })
);

// const handle = () => incomingHandler.handle(new IncomingRequest(), new ResponseOutparam());
// assert.throws(handle, WebAssembly.RuntimeError('unreachable'));
