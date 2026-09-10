import { argv } from "node:process";
import { pathToFileURL } from "node:url";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const { instantiate } = await import(pathToFileURL(argv[2]));
const imports = new WASIShim().getImportObject();
Object.assign(imports["wasi:sockets/instance-network"], imports["wasi:sockets/network"]);
Object.assign(imports["wasi:sockets/ip-name-lookup"], imports["wasi:sockets/network"]);
Object.assign(imports["wasi:sockets/tcp-create-socket"], imports["wasi:sockets/tcp"]);
imports["wasi:sockets/network"].Network.prototype.noop ??= () => {};
imports["wasi:sockets/network"].networkErrorCode ??= () => undefined;
const instance = await instantiate(undefined, imports);

// This does not return. On the `wasi:sockets` transport the accept loop runs inside the
// guest, blocking on a pollable, so the component serves from inside this call. The port it
// chose reaches the caller on stderr instead.
await instance.start();
