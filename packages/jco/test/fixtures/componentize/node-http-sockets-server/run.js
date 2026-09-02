import { argv } from "node:process";
import { pathToFileURL } from "node:url";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const { instantiate } = await import(pathToFileURL(argv[2]));
const instance = await instantiate(undefined, new WASIShim().getImportObject());

// This does not return. On the `wasi:sockets` transport the accept loop runs inside the
// guest, blocking on a pollable, so the component serves from inside this call. The port it
// chose reaches the caller on stderr instead.
await instance.start();
