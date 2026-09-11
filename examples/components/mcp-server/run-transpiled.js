import { HTTPServer } from '@bytecodealliance/preview2-shim/http';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import processHost from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/process/host';
import { instantiate } from './dist/transpiled/component.js';

// The SDK imports node:process, but this HTTP server needs none of its host
// operations. Keep the denial provider and preserve the WIT import's name.
const { incomingHandler } = await instantiate(undefined, {
    ...new WASIShim().getImportObject(),
    'jco:node/process@0.1.0': processHost,
});

const server = new HTTPServer(incomingHandler);

server.listen(Number(process.env.PORT ?? 3000), '127.0.0.1');
console.log(`MCP server listening at http://127.0.0.1:${server.address().port}/mcp`);
