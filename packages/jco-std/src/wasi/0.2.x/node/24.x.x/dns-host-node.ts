import { MessageChannel, Worker, receiveMessageOnPort } from "node:worker_threads";

import type { DnsHost, DnsResponse } from "./dns/types.js";

const WORKER_SOURCE = String.raw`
const { workerData } = require("node:worker_threads");
const signal = new Int32Array(workerData.signal);
const port = workerData.port;
const replacer = (_key, value) => value instanceof ArrayBuffer
  ? { __jcoDnsArrayBuffer: Buffer.from(value).toString("base64") }
  : value;
const serializeError = (error) => ({
  name: error?.name ?? "Error",
  message: error?.message ?? String(error),
  code: error?.code,
  errno: error?.errno,
  syscall: error?.syscall,
  hostname: error?.hostname,
});
(async () => {
  let response;
  try {
    const request = JSON.parse(workerData.request);
    const dns = require("node:dns");
    if (request.operation === "getServers") {
      response = { ok: true, value: dns.getServers() };
    } else if (request.operation === "validateServers") {
      const resolver = new dns.Resolver();
      resolver.setServers(request.args[0]);
      response = { ok: true, value: resolver.getServers() };
    } else {
      const api = dns.promises;
      const allowed = new Set([
        "lookup", "lookupService", "resolve4", "resolve6", "resolveAny", "resolveCaa",
        "resolveCname", "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr", "resolveSoa",
        "resolveSrv", "resolveTlsa", "resolveTxt", "reverse"
      ]);
      if (!allowed.has(request.operation)) throw Object.assign(new Error("Unsupported DNS operation: " + request.operation), { code: "ERR_JCO_UNSUPPORTED_NODE_API" });
      let target = api;
      if (request.resolver) {
        target = new api.Resolver(request.resolver.options);
        if (request.resolver.servers) target.setServers(request.resolver.servers);
        if (request.resolver.localAddress) target.setLocalAddress(...request.resolver.localAddress);
      }
      if (request.operation === "lookup" && request.args[1]) {
        const options = request.args[1];
        let hints = 0;
        if (options.hints & 32) hints |= dns.ADDRCONFIG;
        if (options.hints & 16) hints |= dns.ALL;
        if (options.hints & 8) hints |= dns.V4MAPPED;
        request.args[1] = { ...options, hints };
      }
      const operation = target[request.operation];
      if (typeof operation !== "function") throw Object.assign(new Error("Unsupported DNS operation: " + request.operation), { code: "ERR_JCO_UNSUPPORTED_NODE_API" });
      response = { ok: true, value: await operation.apply(target, request.args) };
    }
  } catch (error) {
    response = { ok: false, error: serializeError(error) };
  }
  port.postMessage(JSON.stringify(response, replacer));
  Atomics.store(signal, 0, 1);
  Atomics.notify(signal, 0);
})().catch((error) => {
  port.postMessage(JSON.stringify({ ok: false, error: serializeError(error) }, replacer));
  Atomics.store(signal, 0, 1);
  Atomics.notify(signal, 0);
});
`;

/**
 * Opt-in provider that delegates to Node's real `node:dns` implementation.
 * A worker permits the preview2 WIT import to remain synchronous while c-ares
 * completes asynchronously without deadlocking the calling Node event loop.
 */
export const query: DnsHost["query"] = (request) => {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(WORKER_SOURCE, {
    eval: true,
    workerData: { request, signal: signal.buffer, port: port2 },
    transferList: [port2],
  });
  worker.unref();
  const wait = Atomics.wait(signal, 0, 0, 30_000);
  if (wait === "timed-out") {
    void worker.terminate();
    const response: DnsResponse = {
      ok: false,
      error: { name: "Error", message: "node:dns host query timed out", code: "ETIMEOUT" },
    };
    return JSON.stringify(response);
  }
  const received = receiveMessageOnPort(port1);
  void worker.terminate();
  if (!received || typeof received.message !== "string") {
    throw new TypeError("node:dns worker returned no response");
  }
  return received.message;
};

export default { query };
