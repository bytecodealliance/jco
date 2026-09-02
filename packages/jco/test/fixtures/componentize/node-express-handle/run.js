import { argv, stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const { instantiate } = await import(pathToFileURL(argv[2]));
const imports = new WASIShim().getImportObject();
// Express loads `node:fs` on its way to `res.sendFile()` even when nothing calls it, so the
// import has to be satisfied. The deny-by-default host does that without granting access.
const fsHost = "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/fs/host";
imports[fsHost] = await import(fsHost);

const instance = await instantiate(undefined, imports);

stdout.write(
    `${JSON.stringify({
        root: await instance.handle("GET", "/", "", ""),
        params: await instance.handle("GET", "/items/42?page=3", "", ""),
        raw: await instance.handle("POST", "/raw", "text/plain", "hello-raw"),
        posted: await instance.handle("POST", "/echo", "application/json", JSON.stringify({ hello: "world" })),
        boom: await instance.handle("GET", "/boom", "", ""),
        missing: await instance.handle("GET", "/nope", "", ""),
    })}\n`,
);
