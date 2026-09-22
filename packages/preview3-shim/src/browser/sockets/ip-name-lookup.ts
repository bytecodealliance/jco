import { ipNameLookup } from "@bytecodealliance/preview2-shim/sockets";
import type {
  ErrorCode,
  IpAddress,
} from "../../../types/interfaces/wasi-sockets-ip-name-lookup.d.ts";

class NameLookupError extends Error {
  readonly payload: ErrorCode;

  constructor(payload: ErrorCode) {
    super(payload.tag);
    this.payload = payload;
  }
}

async function resolveAddresses(name: string): Promise<Array<IpAddress>> {
  try {
    const stream = ipNameLookup.resolveAddresses({} as never, name);
    const addresses: IpAddress[] = [];
    while (true) {
      const address = stream.resolveNextAddress();
      if (!address) {
        break;
      }
      addresses.push(address);
    }
    if (addresses.length === 0) {
      throw new NameLookupError({ tag: "name-unresolvable" });
    }
    return addresses;
  } catch (error) {
    if (error instanceof NameLookupError) {
      throw error;
    }
    const tag = typeof error === "string" ? error : (error as { tag?: string })?.tag;
    if (tag === "not-supported") {
      throw new NameLookupError({ tag: "other", val: "not-supported" });
    }
    throw new NameLookupError({ tag: "other", val: String(error) });
  }
}

export default {
  resolveAddresses,
} satisfies typeof import("../../../types/interfaces/wasi-sockets-ip-name-lookup.d.ts");
export type * from "../../../types/interfaces/wasi-sockets-ip-name-lookup.d.ts";
