import { adapterRequired } from "./http/errors.js";
export class Connection {
  constructor() {
    adapterRequired();
  }
}
export class ClientRequest {
  constructor() {
    adapterRequired();
  }
}
import type { DirectHttpHost } from "./http/types.js";

export const request: DirectHttpHost["request"] = () => adapterRequired();

export const Server: DirectHttpHost["Server"] = class Server {
  constructor() {
    adapterRequired();
  }
} as unknown as DirectHttpHost["Server"];

export default { request, Server };
