import * as denyHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/http-host.js";
import {
  createDirectHttpImplementation,
  httpCallbacks,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/impl/direct.js";
import {
  createWasiHttpImplementation,
  type WasiHttpFields,
  type WasiHttpProvider,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/impl/wasi-http.js";
import {
  createWasiSocketsHttpImplementation,
  type WasiSocketsProvider,
  type WasiTcpSocket,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/impl/wasi-sockets.js";
import {
  parseHttp1Response,
  serializeHttp1Request,
  serializeHttp1Response,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/http1.js";
import type {
  DirectHttpServer,
  DirectHttpServerOptions,
  HttpImplementationResponse,
  HttpIncomingRequestData,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/types.js";
import {
  httpImplementationConformance,
  type HttpConformanceHarness,
} from "./helpers/conformance.js";

const encoder = new TextEncoder();

function clientResponse(): HttpImplementationResponse {
  return {
    statusCode: 201,
    statusMessage: "Created",
    httpVersion: "1.1",
    headers: [{ name: "Content-Type", value: encoder.encode("text/plain") }],
    body: encoder.encode("client response"),
  };
}

function directHarness(): HttpConformanceHarness {
  // The guest sees a WIT `result` as the value or a thrown error, so this host returns
  // values rather than tagged objects.
  let listenerId: bigint | undefined;
  const implementation = createDirectHttpImplementation({
    request: () => clientResponse(),
    Server: class implements DirectHttpServer {
      constructor(_options: DirectHttpServerOptions, id: bigint) {
        listenerId = id;
      }

      listen() {
        return {
          tag: "tcp",
          val: { address: "127.0.0.1", family: "IPv4", port: 8080 },
        } as const;
      }

      close() {
        return true;
      }

      closeAllConnections(): void {}

      closeIdleConnections(): void {}

      getConnections() {
        return 0n;
      }

      address() {
        return {
          tag: "tcp",
          val: { address: "127.0.0.1", family: "IPv4", port: 8080 },
        } as const;
      }

      ref(): void {}

      unref(): void {}

      [Symbol.dispose](): void {}
    },
  });
  return {
    implementation,
    async dispatchServerRequest(request) {
      return await httpCallbacks.handleRequest(listenerId!, request);
    },
  };
}

function wasiHttpHarness(): HttpConformanceHarness {
  let bodyRead = false;
  const response = clientResponse();
  const provider: WasiHttpProvider = {
    outgoingHandler: {
      handle: () => ({
        subscribe: () => ({ block: () => undefined }),
        get: () => ({
          tag: "ok",
          val: {
            tag: "ok",
            val: {
              status: () => response.statusCode,
              headers: () => ({
                entries: () => response.headers.map(({ name, value }) => [name, value]),
              }),
              consume: () => ({
                stream: () => ({
                  blockingRead() {
                    if (bodyRead) {
                      throw { tag: "closed" };
                    }
                    bodyRead = true;
                    return response.body;
                  },
                }),
              }),
            },
          },
        }),
      }),
    },
    types: {
      Fields: { fromList: (entries) => ({ entries: () => entries }) },
      IncomingBody: { finish: () => undefined },
      OutgoingBody: { finish: () => undefined },
      OutgoingRequest: class {
        constructor(_fields: WasiHttpFields) {}

        body() {
          return { write: () => ({ blockingWriteAndFlush: () => undefined }) };
        }

        setMethod(): void {}

        setScheme(): void {}

        setAuthority(): void {}

        setPathWithQuery(): void {}
      },
      RequestOptions: class {
        setConnectTimeout(): void {}

        setFirstByteTimeout(): void {}

        setBetweenBytesTimeout(): void {}
      },
    },
  };
  return { implementation: createWasiHttpImplementation(provider) };
}

function wasiSocketsHarness(): HttpConformanceHarness {
  let resolving = false;
  let scheduled: (() => void | Promise<void>) | undefined;
  let incomingRequest: HttpIncomingRequestData | undefined;
  let outgoingResponse: Uint8Array | undefined;
  const clientSocket: WasiTcpSocket = {
    startConnect: () => undefined,
    finishConnect: () => [
      { blockingRead: () => serializeHttp1Response(clientResponse()) },
      { blockingWriteAndFlush: () => undefined },
    ],
    subscribe: () => ({ block: () => undefined }),
    shutdown: () => undefined,
  };
  const connection: WasiTcpSocket = {
    startConnect: () => undefined,
    finishConnect: () => {
      throw new Error("not used");
    },
    remoteAddress: () => ({
      tag: "ipv4",
      val: { address: [192, 0, 2, 10], port: 1234 },
    }),
    subscribe: () => ({ block: () => undefined }),
    shutdown: () => undefined,
  };
  const listener: WasiTcpSocket = {
    startBind: () => undefined,
    finishBind: () => undefined,
    startConnect: () => undefined,
    finishConnect: () => {
      throw new Error("not used");
    },
    startListen: () => undefined,
    finishListen: () => undefined,
    accept: () => [
      connection,
      {
        blockingRead: () =>
          serializeHttp1Request({
            method: incomingRequest!.method,
            scheme: "http",
            authority: "example.com",
            pathWithQuery: incomingRequest!.url,
            headers: incomingRequest!.headers,
            body: incomingRequest!.body,
          }),
      },
      {
        blockingWriteAndFlush: (contents) => {
          outgoingResponse = contents.slice();
        },
      },
    ],
    localAddress: () => ({
      tag: "ipv4",
      val: { address: [127, 0, 0, 1], port: 8080 },
    }),
    subscribe: () => ({ block: () => undefined }),
    shutdown: () => undefined,
  };
  const provider: WasiSocketsProvider = {
    instanceNetwork: { instanceNetwork: () => ({}) },
    ipNameLookup: {
      resolveAddresses: () => {
        resolving = true;
        let yielded = false;
        return {
          resolveNextAddress() {
            if (yielded) {
              return undefined;
            }
            yielded = true;
            return { tag: "ipv4", val: [192, 0, 2, 1] };
          },
          subscribe: () => ({ block: () => undefined }),
        };
      },
    },
    tcpCreateSocket: {
      createTcpSocket: () => (resolving ? clientSocket : listener),
    },
    schedule: (task) => {
      scheduled = task;
    },
  };
  return {
    implementation: createWasiSocketsHttpImplementation(provider),
    async dispatchServerRequest(request) {
      incomingRequest = request;
      await scheduled?.();
      const parsed = parseHttp1Response(outgoingResponse!, request.method, true);
      if (!parsed) {
        throw new Error("wasi:sockets did not produce a complete HTTP response");
      }
      return parsed;
    },
  };
}

httpImplementationConformance("default-deny", {
  createHarness: () => ({
    implementation: createDirectHttpImplementation(denyHost),
  }),
  client: { supported: false, errorCode: "ERR_JCO_HTTP_ADAPTER_REQUIRED" },
  server: { supported: false, errorCode: "ERR_JCO_HTTP_ADAPTER_REQUIRED" },
});

httpImplementationConformance("direct", {
  createHarness: directHarness,
  client: { supported: true },
  server: { supported: true },
});

httpImplementationConformance("wasi:sockets", {
  createHarness: wasiSocketsHarness,
  client: { supported: true },
  server: { supported: true },
});

httpImplementationConformance("wasi:http", {
  createHarness: wasiHttpHarness,
  client: { supported: true },
  server: { supported: false, errorCode: "ERR_JCO_UNSUPPORTED_NODE_API" },
});
