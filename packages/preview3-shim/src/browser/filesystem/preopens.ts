import { Todo } from "../../common/errors.js";
import type { Descriptor } from "../../../types/interfaces/wasi-filesystem-preopens.d.ts";

function getDirectories(): Array<[Descriptor, string]> {
  throw new Todo();
}

export default {
  getDirectories,
} satisfies typeof import("../../../types/interfaces/wasi-filesystem-preopens.d.ts");
export type * from "../../../types/interfaces/wasi-filesystem-preopens.d.ts";
