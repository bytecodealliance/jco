import { argv, stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const { instantiate } = await import(pathToFileURL(argv[2]));
const imports = new WASIShim().getImportObject();
Object.assign(imports["wasi:sockets/instance-network"], imports["wasi:sockets/network"]);
Object.assign(imports["wasi:sockets/ip-name-lookup"], imports["wasi:sockets/network"]);
Object.assign(imports["wasi:sockets/tcp-create-socket"], imports["wasi:sockets/tcp"]);
imports["wasi:sockets/network"].networkErrorCode ??= () => undefined;
const instance = await instantiate(undefined, imports);
const port = await instance.startServer();
stdout.write(`${port}\n`);
await instance.serveOne();
