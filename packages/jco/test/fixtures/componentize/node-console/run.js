import { argv, stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const { instantiate } = await import(pathToFileURL(argv[2]));
// Explicit instantiation requires providing the mapped console capability.
const imports = new WASIShim().getImportObject();
imports[argv[3]] = await import(argv[3]);
const instance = await instantiate(undefined, imports);
stdout.write(`RESULT:${JSON.stringify(instance.run())}\n`);
