import { adapterRequired } from "./http2/errors.js";
import type { DirectHttp2Host } from "./http2/types.js";

export const ClientSession: DirectHttp2Host["ClientSession"] = class ClientSession {
  constructor() {
    adapterRequired();
  }
} as unknown as DirectHttp2Host["ClientSession"];

export const Server: DirectHttp2Host["Server"] = class Server {
  constructor() {
    adapterRequired();
  }
} as unknown as DirectHttp2Host["Server"];

export default { ClientSession, Server };
