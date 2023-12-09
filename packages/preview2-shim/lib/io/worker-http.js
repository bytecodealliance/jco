import { Readable } from "node:stream";
import { createStream, getStreamOrThrow } from "./worker-thread.js";
import { createServer } from "node:http";
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
    const res = await fetch(url, {
      method,
      headers: new Headers(headers),
      body: stream ? Readable.toWeb(stream) : null,
      redirect: "manual",
      duplex: "half",
    });
    const bodyStreamId = createStream(Readable.fromWeb(res.body));
    return {
      status: res.status,
      headers: Array.from(res.headers),
      bodyStreamId: bodyStreamId,
    };
  } catch (e) {
    if (e?.cause) {
      let err = e.cause;
      if (e.cause instanceof AggregateError) err = e.cause.errors[0];
      if (err.message === "unknown scheme")
        throw {
          tag: "HTTP-protocol-error",
        };
      switch (err.syscall) {
        case "connect": {
          if (err.code === "ECONNREFUSED")
            throw {
              tag: "connection-refused",
            };
          break;
        }
        case "getaddrinfo": {
          const { errno, code } = err;
          throw {
            tag: "DNS-error",
            val: {
              rcode: code,
              infoCode: errno,
            },
          };
        }
      }
    }
    if (e?.message?.includes("Failed to parse URL")) {
      throw {
        tag: "HTTP-request-URI-invalid",
        val: undefined,
      };
    }
    if (e?.message?.includes("HTTP")) {
      switch (e?.message.replace(/'[^']+'/, "'{}'")) {
        case "'{}' HTTP method is unsupported.":
          throw {
            tag: "HTTP-protocol-error",
            val: undefined,
          };
        case "'{}' is not a valid HTTP method.":
          throw {
            tag: "HTTP-request-method-invalid",
            val: undefined,
          };
      }
      throw {
        tag: "internal-error",
        val: e.toString(),
      };
    }
    throw e;
  }
}
