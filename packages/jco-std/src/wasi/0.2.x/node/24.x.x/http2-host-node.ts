/**
 * Opt-in Node.js HTTP/2 provider.
 *
 * The operation mapping follows nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/http2.js and
 * lib/internal/http2/core.js (MIT license). Native stream/session events are
 * adapted to typed, buffered WIT resources and guest callback resources.
 */
import { Buffer } from "node:buffer";
import * as nodeHttp2 from "node:http2";

import { rawHeadersToFields, serializeNodeError } from "./internal/http-host.js";
import type {
  DirectHttp2ClientOptions,
  DirectHttp2RequestOptions,
  DirectHttp2Result,
  DirectHttp2ServerAddress,
  DirectHttp2ServerConstructor,
  DirectHttp2ServerErrorListener,
  DirectHttp2ServerOptions,
  DirectHttp2Settings,
  DirectHttp2StreamListener,
  Http2PingResponse,
  Http2ResponseData,
  Http2StreamState,
} from "./http2/types.js";

type AsyncResult<T> = Promise<DirectHttp2Result<T>>;

function nodeSettings(settings: DirectHttp2Settings): nodeHttp2.Settings {
  return {
    headerTableSize: settings.headerTableSize,
    enablePush: settings.enablePush,
    initialWindowSize: settings.initialWindowSize,
    maxFrameSize: settings.maxFrameSize,
    maxConcurrentStreams: settings.maxConcurrentStreams,
    maxHeaderListSize: settings.maxHeaderListSize,
    enableConnectProtocol: settings.enableConnectProtocol,
    customSettings: Object.fromEntries(settings.customSettings.map(({ id, value }) => [id, value])),
  };
}

function directSettings(settings: nodeHttp2.Settings): DirectHttp2Settings {
  return {
    headerTableSize: settings.headerTableSize,
    enablePush: settings.enablePush,
    initialWindowSize: settings.initialWindowSize,
    maxFrameSize: settings.maxFrameSize,
    maxConcurrentStreams: settings.maxConcurrentStreams,
    maxHeaderListSize: settings.maxHeaderListSize,
    enableConnectProtocol: settings.enableConnectProtocol,
    customSettings: Object.entries(settings.customSettings ?? {}).map(([id, value]) => ({
      id: Number(id),
      value,
    })),
  };
}

function headerObject(
  fields: readonly { name: string; value: Uint8Array }[],
): nodeHttp2.OutgoingHttpHeaders {
  const headers: nodeHttp2.OutgoingHttpHeaders = Object.create(
    null,
  ) as nodeHttp2.OutgoingHttpHeaders;
  const decoder = new TextDecoder("latin1");
  for (const { name, value } of fields) {
    const text = decoder.decode(value);
    const current = headers[name];
    if (current === undefined) {
      headers[name] = text;
    } else if (Array.isArray(current)) {
      current.push(text);
    } else {
      headers[name] = [String(current), text];
    }
  }
  return headers;
}

function serverAddress(
  address: Exclude<ReturnType<nodeHttp2.Http2Server["address"]>, null>,
): DirectHttp2ServerAddress {
  return typeof address === "string"
    ? { tag: "pipe", val: address }
    : {
        tag: "tcp",
        val: { address: address.address, family: address.family, port: address.port },
      };
}

class NodeHttp2ClientStream {
  readonly #stream: nodeHttp2.ClientHttp2Stream;
  readonly #response: Promise<DirectHttp2Result<Http2ResponseData>>;
  #ended = false;

  constructor(stream: nodeHttp2.ClientHttp2Stream) {
    this.#stream = stream;
    this.#response = new Promise((resolve) => {
      let headers: Http2ResponseData["headers"] = [];
      let trailers: Http2ResponseData["trailers"] = [];
      const chunks: Uint8Array[] = [];
      let settled = false;
      const finish = (result: DirectHttp2Result<Http2ResponseData>): void => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };
      stream.once("response", (_headers, _flags, rawHeaders) => {
        headers = rawHeadersToFields(rawHeaders);
      });
      stream.once("trailers", (_trailers, _flags, rawHeaders) => {
        trailers = rawHeadersToFields(rawHeaders);
      });
      stream.on("data", (chunk: Uint8Array) => chunks.push(new Uint8Array(chunk)));
      stream.once("error", (error) => finish({ tag: "err", val: serializeNodeError(error) }));
      stream.once("end", () => {
        const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
        const body = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.byteLength;
        }
        finish({ tag: "ok", val: { headers, trailers, body } });
      });
    });
  }

  write(chunk: Uint8Array): DirectHttp2Result<boolean> {
    try {
      return { tag: "ok", val: this.#stream.write(chunk) };
    } catch (error) {
      return { tag: "err", val: serializeNodeError(error) };
    }
  }

  async finish(): AsyncResult<Http2ResponseData> {
    if (!this.#ended) {
      this.#ended = true;
      this.#stream.end();
    }
    return this.#response;
  }

  close(code: number): DirectHttp2Result<undefined> {
    try {
      this.#stream.close(code);
      return { tag: "ok", val: undefined };
    } catch (error) {
      return { tag: "err", val: serializeNodeError(error) };
    }
  }

  id(): number | undefined {
    return this.#stream.id;
  }

  state(): Http2StreamState {
    const state = this.#stream.state;
    return {
      state: state.state,
      localWindowSize: state.localWindowSize,
      localClose: state.localClose,
      remoteClose: state.remoteClose,
    };
  }

  [Symbol.dispose](): void {
    this.#stream.close();
  }
}

class NodeHttp2ClientSession {
  readonly #session: nodeHttp2.ClientHttp2Session;
  readonly #ready: Promise<DirectHttp2Result<undefined>>;
  #lastError: unknown;

  constructor(authority: string, options: DirectHttp2ClientOptions) {
    this.#session = nodeHttp2.connect(authority, {
      settings: nodeSettings(options.settings),
      rejectUnauthorized: options.rejectUnauthorized,
      servername: options.serverName,
      ca: options.ca === undefined ? undefined : Buffer.from(options.ca),
    });
    this.#ready = new Promise((resolve) => {
      let settled = false;
      const finish = (result: DirectHttp2Result<undefined>): void => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };
      this.#session.once("connect", () => finish({ tag: "ok", val: undefined }));
      this.#session.on("error", (error) => {
        this.#lastError = error;
        finish({ tag: "err", val: serializeNodeError(error) });
      });
    });
  }

  async ready(): AsyncResult<import("./http2/types.js").DirectHttp2SessionInfo> {
    const result = await this.#ready;
    if (result.tag === "err") {
      return result;
    }
    return {
      tag: "ok",
      val: {
        alpnProtocol: this.#session.alpnProtocol,
        encrypted: Boolean(this.#session.encrypted),
        localSettings: directSettings(this.#session.localSettings),
        remoteSettings: directSettings(this.#session.remoteSettings),
      },
    };
  }

  request(
    headers: Parameters<typeof headerObject>[0],
    options: DirectHttp2RequestOptions,
  ): DirectHttp2Result<NodeHttp2ClientStream> {
    try {
      return {
        tag: "ok",
        val: new NodeHttp2ClientStream(this.#session.request(headerObject(headers), options)),
      };
    } catch (error) {
      return { tag: "err", val: serializeNodeError(error) };
    }
  }

  async close(): AsyncResult<undefined> {
    try {
      await new Promise<void>((resolve) => this.#session.close(resolve));
      return { tag: "ok", val: undefined };
    } catch (error) {
      return { tag: "err", val: serializeNodeError(error) };
    }
  }

  destroy(code: number): DirectHttp2Result<undefined> {
    try {
      this.#session.destroy(undefined, code);
      return { tag: "ok", val: undefined };
    } catch (error) {
      return { tag: "err", val: serializeNodeError(error) };
    }
  }

  async settings(settings: DirectHttp2Settings): AsyncResult<DirectHttp2Settings> {
    return new Promise((resolve) => {
      this.#session.settings(nodeSettings(settings), (error, accepted) => {
        resolve(
          error
            ? { tag: "err", val: serializeNodeError(error) }
            : { tag: "ok", val: directSettings(accepted) },
        );
      });
    });
  }

  async ping(payload: Uint8Array): AsyncResult<Http2PingResponse> {
    return new Promise((resolve) => {
      this.#session.ping(payload, (error, duration, responsePayload) => {
        resolve(
          error
            ? { tag: "err", val: serializeNodeError(error) }
            : {
                tag: "ok",
                val: { durationMs: duration, payload: new Uint8Array(responsePayload) },
              },
        );
      });
    });
  }

  goaway(
    code: number,
    lastStreamId: number | undefined,
    opaqueData: Uint8Array,
  ): DirectHttp2Result<undefined> {
    try {
      this.#session.goaway(code, lastStreamId, opaqueData);
      return { tag: "ok", val: undefined };
    } catch (error) {
      return { tag: "err", val: serializeNodeError(error) };
    }
  }

  ref(): void {
    this.#session.ref();
  }

  unref(): void {
    this.#session.unref();
  }

  [Symbol.dispose](): void {
    this.#session.destroy(this.#lastError instanceof Error ? this.#lastError : undefined);
  }
}

class NodeHttp2Server {
  readonly #errorListener: DirectHttp2ServerErrorListener;
  readonly #listener: DirectHttp2StreamListener;
  readonly #server: nodeHttp2.Http2Server | nodeHttp2.Http2SecureServer;
  readonly #sessionIds = new WeakMap<nodeHttp2.Http2Session, number>();
  #nextSessionId = 1;

  constructor(
    options: DirectHttp2ServerOptions,
    listener: DirectHttp2StreamListener,
    errorListener: DirectHttp2ServerErrorListener,
  ) {
    this.#errorListener = errorListener;
    this.#listener = listener;
    const common = {
      settings: nodeSettings(options.settings),
      allowHTTP1: options.allowHttp1,
      strictFieldWhitespaceValidation: options.strictFieldWhitespaceValidation,
    };
    this.#server = options.secure
      ? nodeHttp2.createSecureServer({
          ...common,
          key: options.key === undefined ? undefined : Buffer.from(options.key),
          cert: options.cert === undefined ? undefined : Buffer.from(options.cert),
        })
      : nodeHttp2.createServer(common);
    this.#server.on("session", (session) => {
      this.#sessionIds.set(session, this.#nextSessionId++);
    });
    this.#server.on("error", (error) => errorListener.handle(serializeNodeError(error)));
    const onStream = async (
      stream: nodeHttp2.ServerHttp2Stream,
      _headers: nodeHttp2.IncomingHttpHeaders,
      _flags: number,
      rawHeaders: string[],
    ): Promise<void> => {
      try {
        const chunks: Uint8Array[] = [];
        for await (const chunk of stream) {
          chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
        }
        const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
        const body = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.byteLength;
        }
        const session = stream.session;
        const result = await listener.handle({
          sessionId: session ? (this.#sessionIds.get(session) ?? 0) : 0,
          id: stream.id ?? 0,
          headers: rawHeadersToFields(rawHeaders),
          body,
          remoteAddress: session?.socket.remoteAddress,
          remotePort: session?.socket.remotePort,
        });
        if (result.tag === "err") {
          throw Object.assign(new Error(result.val.message), result.val);
        }
        stream.respond(headerObject(result.val.headers));
        stream.end(result.val.body);
      } catch (error) {
        if (!stream.headersSent) {
          stream.respond({ ":status": 500, "content-type": "text/plain; charset=utf-8" });
          stream.end(error instanceof Error ? error.message : String(error));
        } else {
          stream.destroy(error instanceof Error ? error : new Error(String(error)));
        }
      }
    };
    this.#server.on("stream", onStream);
  }

  async listen(
    options: import("./http2/types.js").HttpListenOptions,
  ): AsyncResult<DirectHttp2ServerAddress> {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => reject(error);
        this.#server.once("error", onError);
        const done = (): void => {
          this.#server.off("error", onError);
          resolve();
        };
        if (options.path !== undefined) {
          this.#server.listen(
            { path: options.path, backlog: options.backlog, exclusive: options.exclusive },
            done,
          );
        } else {
          this.#server.listen(
            {
              port: options.port ?? 0,
              host: options.host,
              backlog: options.backlog,
              exclusive: options.exclusive,
              ipv6Only: options.ipv6Only,
              reusePort: options.reusePort,
            },
            done,
          );
        }
      });
      const address = this.#server.address();
      if (address === null) {
        throw new Error("HTTP/2 server started without a listening address");
      }
      return { tag: "ok", val: serverAddress(address) };
    } catch (error) {
      return { tag: "err", val: serializeNodeError(error) };
    }
  }

  async close(): AsyncResult<boolean> {
    const wasListening = this.#server.listening;
    if (!wasListening) {
      return { tag: "ok", val: false };
    }
    try {
      await new Promise<void>((resolve, reject) => {
        this.#server.close((error) => (error ? reject(error) : resolve()));
      });
      return { tag: "ok", val: true };
    } catch (error) {
      return { tag: "err", val: serializeNodeError(error) };
    }
  }

  address(): DirectHttp2ServerAddress | undefined {
    const address = this.#server.address();
    return address === null ? undefined : serverAddress(address);
  }

  updateSettings(settings: DirectHttp2Settings): DirectHttp2Result<undefined> {
    try {
      this.#server.updateSettings(nodeSettings(settings));
      return { tag: "ok", val: undefined };
    } catch (error) {
      return { tag: "err", val: serializeNodeError(error) };
    }
  }

  ref(): void {
    this.#server.ref();
  }

  unref(): void {
    this.#server.unref();
  }

  [Symbol.dispose](): void {
    this.#server.close();
    this.#errorListener[Symbol.dispose]();
    this.#listener[Symbol.dispose]();
  }
}

export const ClientSession =
  NodeHttp2ClientSession as unknown as import("./http2/types.js").DirectHttp2ClientSessionConstructor;
export const Server = NodeHttp2Server as unknown as DirectHttp2ServerConstructor;

export default { ClientSession, Server };
