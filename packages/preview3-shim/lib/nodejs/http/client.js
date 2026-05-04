import { ResourceWorker } from "../workers/resource-worker.js";
import { StreamReader, readableByteStreamFromReader } from "../stream.js";
import { FutureReader, future } from "../future.js";
import { _fieldsFromEntriesChecked } from "./fields.js";
import { HttpError } from "./error.js";
import { _schemeToString, Request } from "./request.js";
import { Response } from "./response.js";

let WORKER = null;
function worker() {
  return (WORKER ??= new ResourceWorker(new URL("../workers/http-worker.js", import.meta.url)));
}

/**
 * HTTP client interface.
 *
 * WIT:
 * ```
 * interface client {
 *   use types.{request, response, error-code};
 *   send: async func(request) -> result<response, error-code>;
 * }
 * ```
 */
export const client = {
  /**
   * Send an HTTP request and return a response.
   *
   * @param {Request} req
   * @returns {Promise<Response>}
   * @throws {HttpError}
   */
  async send(req) {
    const scheme = _schemeToString(req.getScheme()) ?? "http";
    const authority = req.getAuthority();

    if (!authority) {
      throw new HttpError("internal-error", "Request.authority must be set for client.send");
    }

    const path = req.getPathWithQuery() ?? "/";
    const url = `${scheme}://${authority}${path}`;

    const opts = req.getOptions();
    const connectTimeoutNs = opts?.getConnectTimeout() ?? null;
    const firstByteTimeoutNs = opts?.getFirstByteTimeout() ?? null;
    const betweenBytesTimeoutNs = opts?.getBetweenBytesTimeout() ?? null;

    const { rx: resRx } = future();
    const [body, trailers] = Request.consumeBody(req, resRx);
    const { port1: tx, port2: rx } = new MessageChannel();

    const transfer = [rx];
    const stream = body ? readableByteStreamFromReader(body, { name: "request body" }) : undefined;
    if (stream) {
      transfer.unshift(stream);
    }

    trailers
      .read()
      .then((val) => tx.postMessage({ val }))
      .catch((err) => tx.postMessage({ err }))
      .finally(() => tx.close());

    try {
      const method = req.getMethod();
      const parts = await worker().run(
        {
          op: "client-request",
          url,
          method: method.tag === "other" ? method.val : method.tag,
          headers: req.getHeaders().copyAll(),
          timeouts: {
            connectTimeoutNs,
            firstByteTimeoutNs,
            betweenBytesTimeoutNs,
          },
          trailers: rx,
          body: stream,
        },
        transfer,
      );

      return responseFromParts(parts);
    } catch (err) {
      throw HttpError.from(err);
    }
  },
};

const responseFromParts = (parts) => {
  const { headers, body, trailers, statusCode } = parts;

  // Create a promise that resolves when the worker sends a message with trailers
  const promise = new Promise((resolve, reject) => {
    trailers.once("message", ({ val, err }) => {
      trailers.close();
      if (err) {
        reject(err);
      } else {
        resolve(val);
      }
    });
  });

  const future = new FutureReader(promise);
  const contents = new StreamReader(body);
  const fields = _fieldsFromEntriesChecked(headers);

  const [res] = Response.new(fields, contents, future);
  res.setStatusCode(statusCode);
  return res;
};
