import { adapterRequired } from "./http/errors.js";
import type { DirectHttpHost } from "./http/types.js";

export const request: DirectHttpHost["request"] = () => adapterRequired();

export const Server: DirectHttpHost["Server"] = class Server {
  constructor() {
    adapterRequired();
  }
} as unknown as DirectHttpHost["Server"];

/** Accepting the component's callbacks costs nothing; using them still needs a provider. */
export const setCallbacks: NonNullable<DirectHttpHost["setCallbacks"]> = () => {};

export default { request, Server, setCallbacks };
