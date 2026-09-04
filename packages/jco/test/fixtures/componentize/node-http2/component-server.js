import { argv, stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const { instantiate } = await import(pathToFileURL(argv[2]));
const imports = new WASIShim().getImportObject();
Object.assign(imports["wasi:sockets/instance-network"], imports["wasi:sockets/network"]);
Object.assign(imports["wasi:sockets/ip-name-lookup"], imports["wasi:sockets/network"]);
Object.assign(imports["wasi:sockets/tcp-create-socket"], imports["wasi:sockets/tcp"]);
// ComponentizeJS 0.22 omits bindings for a methodless resource used across WIT interfaces.
// The vendored 0.2.10 WIT adds this unused method to force binding generation, so the
// canonical preview2-shim resource supplies a matching no-op during test instantiation.
imports["wasi:sockets/network"].Network.prototype.noop ??= () => {};
imports["wasi:sockets/network"].networkErrorCode ??= () => undefined;
const instance = await instantiate(undefined, imports);
const port = await instance.startServer();
stdout.write(`${port}\n`);
await instance.serveOne();
