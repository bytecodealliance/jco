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
    .then(() => tx.postMessage({ value: req.trailersDistinct || {} }))
    .catch((err) => tx.postMessage({ error: err }))
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
      await pipeline(Readable.fromWeb(stream), res);
      const fields = await recvTrailers(trailers);
      if (fields) {
        res.addTrailers(toObject(fields));
      }
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

async function handleRequest({ url, method, headers, trailers, body, timeouts }) {
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

  if (body) {
    try {
      const stream = Readable.fromWeb(body);
      await pipeline(stream, req);
      const fields = await recvTrailers(trailers);
      if (fields) {
        req.addTrailers(toObject(fields));
      }
    } catch (err) {
      req.destroy();
      throw err;
    }
  } else {
    req.end();
  }

  const res = await new Promise((resolve, reject) => {
    const onResponse = (response) => {
      cleanup();
      resolve(response);
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const onTimeout = () => {
      cleanup();
      reject(new HttpError("connection-timeout"));
    };
    const onClose = () => {
      cleanup();
      reject(new HttpError("connection-terminated"));
    };

    const cleanup = () => {
      req.off("response", onResponse);
      req.off("error", onError);
      req.off("timeout", onTimeout);
      req.off("close", onClose);
    };

    req.once("response", onResponse);
    req.once("error", onError);
    req.once("timeout", onTimeout);
    req.once("close", onClose);
  });

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
    .then(() => tx.postMessage({ val: res.trailers || {} }))
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

const toObject = (entries) => {
  return Object.fromEntries(entries.map(([key, val]) => [key, decoder.decode(val)]));
};

const encoder = new TextEncoder();

const toEntries = (obj) => {
  return Object.entries(obj).flatMap(([k, v]) =>
    Array.isArray(v) ? v.map((val) => [k, encoder.encode(val)]) : [[k, encoder.encode(v)]],
  );
};
