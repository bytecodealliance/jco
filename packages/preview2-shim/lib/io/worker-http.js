import { Readable } from "node:stream";
import { createStream, getStreamOrThrow } from "./worker-thread.js";

export async function createHttpRequest(method, url, headers, bodyId) {
  let body = null;
  if (bodyId) {
    try {
      const { stream } = getStreamOrThrow(bodyId);
      body = stream.readableBodyStream;
      // this indicates we're attached
      stream.readableBodyStream = null;
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
      body,
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
