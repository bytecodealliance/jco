import { createStream, getStreamOrThrow } from "./worker-thread.js";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { parentPort } from "node:worker_threads";
import { HTTP_SERVER_INCOMING_HANDLER } from "./calls.js";

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
  const { stream } = getStreamOrThrow(streamId);
  stream.pipe(response);
  responses.delete(id);
}

export async function startHttpServer(id, { port, host }) {
  const server = createServer((req, res) => {
    // create the streams and their ids
    const streamId = createStream(req);
    const responseId = ++responseCnt;
    parentPort.postMessage({
      type: HTTP_SERVER_INCOMING_HANDLER,
      id,
      payload: {
        responseId,
        method: req.method,
        pathWithQuery: req.url,
        headers: Object.entries(req.headers),
        streamId,
      },
    });
    res.on('data', chunk => {
      process._rawDebug(chunk);
    });
    responses.set(responseId, res);
  });
  await new Promise((resolve, reject) => {
    server.listen(port, host, resolve);
    server.on("error", reject);
  });
  servers.set(id, server);
}

export async function createHttpRequest(method, url, headers, bodyId) {
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
    const parsedUrl = new URL(url);
    let req;
    switch (parsedUrl.protocol) {
      case 'http:':
        req = httpRequest({
          method,
          host: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.pathname + parsedUrl.search,
          headers
        });
        break;
      case 'https:':
        req = httpsRequest({
          method,
          host: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.pathname + parsedUrl.search,
          headers
        });
        break;
      default:
        throw { tag: 'HTTP-protocol-error' };
    }
    if (stream) {
      stream.pipe(req);
    } else {
      req.end();
    }
    const res = await new Promise((resolve, reject) => {
      req.on('response', resolve);
      req.on('close', () => reject);
      req.on('error', reject);
    });
    res.on('end', () => void res.emit("readable"));
    const bodyStreamId = createStream(res);
    return {
      status: res.statusCode,
      headers: Array.from(Object.entries(res.headers)),
      bodyStreamId: bodyStreamId,
    };
  } catch (e) {
    if (e?.tag)
      throw e;
    const err = getFirstError(e);
    switch (err.code) {
      case "ECONNRESET":
        throw { tag: "HTTP-protocol-error" };
      case "ENOTFOUND":
        throw {
          tag: "DNS-error",
          val: {
            rcode: err.code,
            infoCode: err.errno,
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

function getFirstError (e) {
  if (typeof e !== 'object' || e === null)
    return e;
  if (e.cause)
    return getFirstError(e.cause);
  if (e instanceof AggregateError)
    return getFirstError(e.errors[0]);
  return e;
}