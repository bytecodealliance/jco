import { preopens } from "@bytecodealliance/preview2-shim/filesystem";
import type { Descriptor } from "../../../types/interfaces/wasi-filesystem-preopens.d.ts";
import { wrapDescriptor } from "./types.js";

function getDirectories(): Array<[Descriptor, string]> {
  return preopens.getDirectories().map(([descriptor, path]) => [wrapDescriptor(descriptor), path]);
}

export default {
  getDirectories,
} satisfies typeof import("../../../types/interfaces/wasi-filesystem-preopens.d.ts");
export type * from "../../../types/interfaces/wasi-filesystem-preopens.d.ts";
