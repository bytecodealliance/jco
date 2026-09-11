import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { createHttpHost } from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http/host/node';
import processHost from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/process/host';
import { instantiate } from './dist/transpiled/component.js';

// HTTP callbacks run inside the guest. The provider only supplies Node I/O.
let component;

const httpHost = createHttpHost(() => component.httpCallbacks);

component = await instantiate(undefined, {
    ...new WASIShim().getImportObject(),
    'jco:node/http@0.1.0': httpHost,
    'jco:node/process@0.1.0': processHost,
});

const port = await component.start(Number(process.env.PORT ?? 3000));

console.log(`MCP server listening at http://127.0.0.1:${port}/mcp`);
process.once('SIGTERM', () => component.stop());
process.once('SIGINT', () => component.stop());
