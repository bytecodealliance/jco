import { createReadableStream, getStreamOrThrow } from "./worker-thread.js";
import {
  createServer,
  request as httpRequest,
  Agent as HttpAgent,
} from "node:http";
import { request as httpsRequest, Agent as HttpsAgent } from "node:https";
import { parentPort } from "node:worker_threads";
import { HTTP_SERVER_INCOMING_HANDLER } from "./calls.js";

const agentOptions = {
  keepAlive: true,
};
const httpAgent = new HttpAgent(agentOptions);
const httpsAgent = new HttpsAgent(agentOptions);

const servers = new Map();

let responseCnt = 0;
const responses = new Map();

export async function stopHttpServer(id) {
  await new Promise((resolve) => servers.get(id).close(resolve));
}

export function clearOutgoingResponse(id) {
  responses.delete(id);
}

export async function setOutgoingResponse(
  id,
  { statusCode, headers, streamId }
) {
  const response = responses.get(id);
  const textDecoder = new TextDecoder();
  response.writeHead(
    statusCode,
    Object.fromEntries(
      headers.map(([key, val]) => [key, textDecoder.decode(val)])
    )
  );
  response.flushHeaders();
  const { stream } = getStreamOrThrow(streamId);
  stream.pipe(response);
  responses.delete(id);
}

export async function startHttpServer(id, { port, host }) {
  const server = createServer((req, res) => {
    // create the streams and their ids
    const streamId = createReadableStream(req);
    const responseId = ++responseCnt;
    parentPort.postMessage({
      type: HTTP_SERVER_INCOMING_HANDLER,
      id,
      payload: {
        responseId,
        method: req.method,
        host: req.headers.host || host || "localhost",
        pathWithQuery: req.url,
        headers: Object.entries(req.headersDistinct).flatMap(([key, val]) =>
          val.map((val) => [key, val])
        ),
        streamId,
      },
    });
    responses.set(responseId, res);
  });
  await new Promise((resolve, reject) => {
    server.listen(port, host, resolve);
    server.on("error", reject);
  });
  servers.set(id, server);
}

export async function createHttpRequest(
  method,
  scheme,
  authority,
  pathWithQuery,
  headers,
  bodyId,
  connectTimeout,
  betweenBytesTimeout,
  firstByteTimeout
) {
  let stream = null;
  if (bodyId) {
    try {
      ({ stream } = getStreamOrThrow(bodyId));
    } catch (e) {
      if (e.tag === "closed")
        throw { tag: "internal-error", val: "Unexpected closed body stream" };
      // it should never be possible for the body stream to already
      // be closed, or for there to be a write error
      // we therefore just throw internal error here
      if (e.tag === "last-operation-failed")
        throw {
          tag: "internal-error",
          val: e.val,
        };
      // entirely unknown error -> trap
      throw e;
    }
  }
  try {
    // Make a request
    let req;
    switch (scheme) {
      case "http:":
        req = httpRequest({
          agent: httpAgent,
          method,
          host: authority.split(":")[0],
          port: authority.split(":")[1],
          path: pathWithQuery,
          timeout: connectTimeout && Number(connectTimeout / 1_000_000n),
        });
        break;
      case "https:":
        req = httpsRequest({
          agent: httpsAgent,
          method,
          host: authority.split(":")[0],
          port: authority.split(":")[1],
          path: pathWithQuery,
          timeout: connectTimeout && Number(connectTimeout / 1_000_000n),
        });
        break;
      default:
        throw { tag: "HTTP-protocol-error" };
    }
    for (const [key, value] of headers) {
      req.appendHeader(key, value);
    }
    req.flushHeaders();
    if (stream) {
      stream.pipe(req);
    } else {
      req.end();
    }
    const res = await new Promise((resolve, reject) => {
      req.once('timeout', () => {
        reject({
          tag: "connection-timeout"
        });
        req.destroy();
      });
      req.once("response", resolve);
      req.once("close", () => reject);
      req.once("error", reject);
    });
    if (firstByteTimeout) res.setTimeout(Number(firstByteTimeout / 1_000_000n));
    if (betweenBytesTimeout)
      res.once("readable", () => {
        res.setTimeout(Number(betweenBytesTimeout / 1_000_000n));
      });
    const bodyStreamId = createReadableStream(res);
    return {
      status: res.statusCode,
      headers: Array.from(Object.entries(res.headers)),
      bodyStreamId,
    };
  } catch (e) {
    if (e?.tag) throw e;
    const err = getFirstError(e);
    switch (err.code) {
      case "ECONNRESET":
        throw { tag: "HTTP-protocol-error" };
      case "ENOTFOUND":
        throw {
          tag: "DNS-error",
          val: {
            rcode: err.code,
            infoCode: err.errno < 0 ? -err.errno : err.errno,
          },
        };
      case "ECONNREFUSED":
        throw {
          tag: "connection-refused",
        };
    }
    throw {
      tag: "internal-error",
      val: err.toString(),
    };
  }
}

function getFirstError(e) {
  if (typeof e !== "object" || e === null) return e;
  if (e.cause) return getFirstError(e.cause);
  if (e instanceof AggregateError) return getFirstError(e.errors[0]);
  return e;
}
