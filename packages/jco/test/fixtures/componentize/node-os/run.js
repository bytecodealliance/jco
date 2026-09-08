import { argv, stdout } from "node:process";
import { pathToFileURL } from "node:url";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

const { instantiate } = await import(pathToFileURL(argv[2]));
const hostSpecifier = argv[3];
const host = await import(hostSpecifier);
const imports = { ...new WASIShim().getImportObject(), [hostSpecifier]: host };
const instance = await instantiate(undefined, imports);
stdout.write(`${instance.run(argv[4] === "denied")}\n`);
