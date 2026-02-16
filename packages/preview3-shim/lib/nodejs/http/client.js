import { ResourceWorker } from "../workers/resource-worker.js";
import { StreamReader } from "../stream.js";
import { FutureReader, future } from "../future.js";
import { _fieldsFromEntriesChecked } from "./fields.js";
import { HttpError } from "./error.js";
import { Request } from "./request.js";
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
    const scheme = req.scheme() ?? "http";
    const authority = req.authority();

    if (!authority) {
      throw new HttpError("internal-error", "Request.authority must be set for client.send");
    }

    const path = req.pathWithQuery() ?? "/";
    const url = `${scheme}://${authority}${path}`;

    const opts = req.options();
    const connectTimeoutNs = opts?.connectTimeout() ?? null;
    const firstByteTimeoutNs = opts?.firstByteTimeout() ?? null;
    const betweenBytesTimeoutNs = opts?.betweenBytesTimeout() ?? null;

    const { rx: resRx } = future();
    const [body, trailers] = Request.consumeBody(req, resRx);
    const { port1: tx, port2: rx } = new MessageChannel();

    const transfer = [rx];
    const stream = body?.intoReadableStream();
    if (stream) {
      transfer.unshift(stream);
    }

    trailers
      .read()
      .then((val) => tx.postMessage({ val }))
      .catch((err) => tx.postMessage({ err }))
      .finally(() => tx.close());

    try {
      const parts = await worker().run(
        {
          op: "client-request",
          url,
          method: req.method().tag,
          headers: req.headers().entries(),
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
