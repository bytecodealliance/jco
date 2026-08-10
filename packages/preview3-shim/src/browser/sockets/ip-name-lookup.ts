import { Todo } from "../../common/errors.js";
import type { IpAddress } from "../../../types/interfaces/wasi-sockets-ip-name-lookup.d.ts";

function resolveAddresses(name: string): Promise<Array<IpAddress>> {
  throw new Todo();
}

export default {
  resolveAddresses,
} satisfies typeof import("../../../types/interfaces/wasi-sockets-ip-name-lookup.d.ts");
export type * from "../../../types/interfaces/wasi-sockets-ip-name-lookup.d.ts";
