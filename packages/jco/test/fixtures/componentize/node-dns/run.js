import { argv, stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const { instantiate } = await import(pathToFileURL(argv[2]));
const instance = await instantiate(undefined, new WASIShim().getImportObject());
stdout.write(`${JSON.stringify(instance.run())}\n`);
