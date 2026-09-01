import http from "node:http";
import { argv, stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const server = http.createServer((_request, response) => {
    response.setHeader("Content-Type", "text/plain");
    response.end("hello from node:http");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
    const address = server.address();
    const { instantiate } = await import(pathToFileURL(argv[2]));
    const imports = new WASIShim().getImportObject();
    if (argv[3]) {
        imports[argv[3]] = await import(argv[3]);
    }
    const instance = await instantiate(undefined, imports);
    stdout.write(`${JSON.stringify(await instance.run(`http://127.0.0.1:${address.port}/`))}\n`);
} finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
