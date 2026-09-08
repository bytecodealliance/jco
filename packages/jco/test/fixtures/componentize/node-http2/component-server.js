import { argv, stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { withWasiSockets } from "../helpers/wasi-sockets.js";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const { instantiate } = await import(pathToFileURL(argv[2]));
const imports = withWasiSockets(new WASIShim().getImportObject());
const instance = await instantiate(undefined, imports);
const port = await instance.startServer();
stdout.write(`${port}\n`);
await instance.serveOne();
