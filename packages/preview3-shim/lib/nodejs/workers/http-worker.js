import { Readable, Writable, PassThrough } from "node:stream";
import { pipeline } from "stream/promises";

import { createServer } from "node:http";
import { request as httpRequest, Agent as HttpAgent } from "node:http";
import { request as httpsRequest, Agent as HttpsAgent } from "node:https";

import { HttpError } from "../http/error.js";
import { Router } from "../workers/resource-worker.js";

// Unique IDs for servers and requests
let NEXT_SERVER_ID = 0n;
let NEXT_REQUEST_ID = 0n;

Router()
  .op("server-start", handleHttpServerStart)
  .op("server-stop", handleHttpServerStop)
  .op("server-next", handleNext)
  .op("server-response", handleResponse)
  .op("server-close", handleHttpServerClose)
  .op("client-request", handleRequest);

class Queue {
  constructor() {
    this._items = [];
    this._resolvers = [];
  }

  push(item) {
    if (this._resolvers.length) {
      const resolve = this._resolvers.shift();
      resolve(item);
    } else {
      this._items.push(item);
    }
  }

  async pop() {
    if (this._items.length) {
      return this._items.shift();
    }

    return new Promise((resolve) => {
      this._resolvers.push(resolve);
    });
  }
}

// Map<serverId, { server, pending: Queue, inflight: Map }>
const servers = new Map();

async function handleHttpServerStart({ port, host }) {
  const serverId = NEXT_SERVER_ID++;
  const pending = new Queue();
  const inflight = new Map();

  const server = createServer((req, res) => {
    const requestId = NEXT_REQUEST_ID++;
    pending.push(requestId);
    inflight.set(requestId, { req, res });
  });

  await new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, host, resolve);
  });

  servers.set(serverId, { server, pending, inflight });
  return serverId;
}

async function handleNext({ serverId }) {
  const srv = servers.get(serverId);
  if (!srv) {
    throw new Error(`No such server: ${serverId}`);
  }

  const requestId = await srv.pending.pop();
  if (requestId == null) {
    return null;
  }

  const { req } = srv.inflight.get(requestId);
  const { port1: tx, port2: trailers } = new MessageChannel();

  const { readable: body, writable } = new TransformStream();
  const stream = Writable.fromWeb(writable);

  pipeline(req, stream)
    .then(() => tx.postMessage({ val: toEntries(req.trailersDistinct || req.trailers || {}) }))
    .catch((err) => tx.postMessage({ err }))
    .finally(() => tx.close());

  const headers = toEntries(req.headersDistinct);
  const { method, url } = req;

  const result = {
    requestId,
    headers,
    body,
    trailers,
    method,
    url,
  };

  return { result, transferable: [body, trailers] };
}

async function handleResponse({ serverId, requestId, statusCode, headers, trailers, stream }) {
  const srv = servers.get(serverId);
  if (!srv) {
    throw new Error(`No such server: ${serverId}`);
  }

  const entry = srv.inflight.get(requestId);
  if (!entry) {
    throw new Error(`No inflight ${requestId}`);
  }
  const { res } = entry;

  try {
    res.writeHead(statusCode, toObject(headers));
    if (stream) {
      await pipeline(Readable.fromWeb(stream), res, { end: false });
      const fields = await recvTrailers(trailers);
      if (fields) {
        res.addTrailers(toObject(fields));
      }
      res.end();
    } else {
      res.end();
    }
  } catch (err) {
    res.destroy(err);
    throw err;
  } finally {
    srv.inflight.delete(requestId);
  }

  return null;
}

async function handleRequest(args) {
  const transmit = transmitReporter(args.transmit);

  try {
    return await doHandleRequest(args, transmit);
  } catch (err) {
    transmit.err(err);
    throw HttpError.from(err).payload;
  }
}

async function doHandleRequest({ url, method, headers, trailers, body, timeouts }, transmit) {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new HttpError("HTTP-protocol-error");
  }

  const { connectTimeoutNs, firstByteTimeoutNs, betweenBytesTimeoutNs } = timeouts;
  const isHttps = parsed.protocol === "https:";

  const AgentClass = isHttps ? HttpsAgent : HttpAgent;
  const agent = new AgentClass({ keepAlive: true });

  const request = isHttps ? httpsRequest : httpRequest;
  const reqOpts = {
    agent,
    method,
    host: parsed.hostname,
    port: parsed.port,
    path: parsed.pathname + parsed.search,
    headers: toObject(headers),
    timeout: connectTimeoutNs ? msecs(connectTimeoutNs) : undefined,
  };

  const req = request(reqOpts);

  if (firstByteTimeoutNs) {
    req.setTimeout(msecs(firstByteTimeoutNs));
  }

  let resStarted = false;
  const response = new Promise((resolve, reject) => {
    const onResponse = (response) => {
      resStarted = true;
      cleanup();
      resolve(response);
    };
    const onConnect = (_response, socket) => {
      cleanup();
      socket.destroy();
      reject(new HttpError("HTTP-protocol-error"));
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const onTimeout = () => {
      cleanup();
      req.on("error", () => {});
      req.destroy();
      reject(new HttpError("connection-timeout"));
    };
    const onClose = () => {
      cleanup();
      reject(new HttpError("connection-terminated"));
    };

    const cleanup = () => {
      req.off("response", onResponse);
      req.off("connect", onConnect);
      req.off("error", onError);
      req.off("timeout", onTimeout);
      req.off("close", onClose);
    };

    req.once("response", onResponse);
    req.once("connect", onConnect);
    req.once("error", onError);
    req.once("timeout", onTimeout);
    req.once("close", onClose);
  });

  const expectedLength = contentLength(headers);
  const upload = body
    ? sendRequestBody(req, body, trailers, () => resStarted, expectedLength)
    : endRequest(req);

  upload.then(
    () => transmit.ok(),
    (err) => transmit.err(err),
  );

  let res;
  try {
    res = await response;
  } catch (err) {
    req.destroy();
    throw err;
  }

  if (betweenBytesTimeoutNs) {
    res.once("readable", () =>
      res.setTimeout(msecs(betweenBytesTimeoutNs), () => {
        res.destroy(new HttpError("connection-timeout"));
      }),
    );
  }

  const pass = new PassThrough();
  const web = Readable.toWeb(pass);

  const { port1: tx, port2: rx } = new MessageChannel();

  pipeline(res, pass)
    .then(() => tx.postMessage({ val: toEntries(res.trailersDistinct || res.trailers || {}) }))
    .catch((err) => tx.postMessage({ err }))
    .finally(() => tx.close());

  const result = {
    statusCode: res.statusCode,
    headers: toEntries(res.headersDistinct),
    body: web,
    trailers: rx,
  };

  return { result, transferable: [web, rx] };
}

function handleHttpServerStop({ serverId }) {
  const srv = servers.get(serverId);
  if (!srv) {
    throw new Error(`No such server: ${serverId}`);
  }

  srv.pending.push(null);
  return serverId;
}

async function handleHttpServerClose({ serverId }) {
  const srv = servers.get(serverId);
  if (!srv) {
    throw new Error(`No such server: ${serverId}`);
  }

  await new Promise((resolve) => srv.server.close(resolve));
  servers.delete(serverId);

  return serverId;
}

async function sendRequestBody(req, body, trailers, resStarted, expectedLength) {
  try {
    req.flushHeaders();
    await pipeline(validateRequestBody(Readable.fromWeb(body), expectedLength), req, {
      end: false,
    });
    const fields = await recvTrailers(trailers);
    if (fields) {
      req.addTrailers(toObject(fields));
    }
    await endRequest(req);
  } catch (err) {
    if (!resStarted()) {
      req.destroy(err);
    }
    throw err;
  }
}

async function* validateRequestBody(body, expectedLength) {
  let bytes = 0n;
  for await (const chunk of body) {
    bytes += BigInt(chunk.byteLength);
    if (expectedLength !== null && bytes > expectedLength) {
      throw new HttpError("HTTP-request-body-size", undefined, bytes);
    }
    yield chunk;
  }

  if (expectedLength !== null && bytes < expectedLength) {
    throw new HttpError("HTTP-request-body-size", undefined, bytes);
  }
}

function endRequest(req) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, value) => {
      if (settled) {
        return;
      }
      settled = true;
      req.off("error", onError);
      req.off("close", onClose);
      fn(value);
    };
    const onError = (err) => settle(reject, err);
    const onClose = () => settle(reject, new HttpError("connection-terminated"));

    req.once("error", onError);
    req.once("close", onClose);

    try {
      req.end(() => settle(resolve));
    } catch (err) {
      settle(reject, err);
    }
  });
}

function transmitReporter(port) {
  let settled = false;
  const send = (msg) => {
    if (settled || !port) {
      return;
    }
    settled = true;
    port.postMessage(msg);
    port.close();
  };

  return {
    ok() {
      send({ val: undefined });
    },
    err(err) {
      send({ err: HttpError.from(err).payload });
    },
  };
}

async function recvTrailers(port) {
  if (!port) {
    return null;
  }

  return new Promise((resolve, reject) => {
    port.once("message", ({ val, err }) => {
      port.close();
      if (err) {
        reject(err);
      } else {
        resolve(val);
      }
    });
  });
}

const msecs = (time) => {
  return typeof time === "bigint" ? Number(time / 1_000_000n) : time / 1e6;
};

const decoder = new TextDecoder();

const contentLength = (entries) => {
  const entry = entries.findLast(([name]) => name.toLowerCase() === "content-length");
  if (!entry) {
    return null;
  }

  const value = decoder.decode(entry[1]);
  return /^\d+$/.test(value) ? BigInt(value) : null;
};

const toObject = (entries) => {
  return Object.fromEntries(entries.map(([key, val]) => [key, decoder.decode(val)]));
};

const encoder = new TextEncoder();

const toEntries = (obj) => {
  return Object.entries(obj).flatMap(([k, v]) =>
    Array.isArray(v) ? v.map((val) => [k, encoder.encode(val)]) : [[k, encoder.encode(v)]],
  );
};
