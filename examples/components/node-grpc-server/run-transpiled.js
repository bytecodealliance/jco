import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { createHttp2Host } from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http2/host/node';
import * as wasiTlsHost from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tls/host';
import tlsHost from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tls/node-host';
import { instantiate } from './dist/transpiled/component.js';

let component;

const http2Host = createHttp2Host(() => component.http2Callbacks);

component = await instantiate(undefined, {
    ...new WASIShim().getImportObject(),
    'jco:node/http2@0.1.0': http2Host,
    'jco:node/tls@0.1.0': tlsHost,
    'wasi:tls/types': wasiTlsHost,
});

const port = await component.start(Number(process.env.PORT ?? 3000));

console.log(`gRPC server listening at http://127.0.0.1:${port}`);
process.once('SIGTERM', () => component.stop());
process.once('SIGINT', () => component.stop());
