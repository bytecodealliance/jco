import { fromTransportError } from "../errors.js";
import type { DirectHttpHost, HttpTransport } from "../types.js";

export function createDirectHttpTransport(host: DirectHttpHost): HttpTransport {
  return {
    request(options) {
      const result = host.request(options);
      if (result.tag === "err") {
        throw fromTransportError(result.val);
      }
      return result.val;
    },
  };
}
