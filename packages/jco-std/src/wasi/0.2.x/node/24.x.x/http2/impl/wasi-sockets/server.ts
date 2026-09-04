import {
  dispose,
  finishPending,
  localAddress,
  nodeAddress,
  socketError,
  wasiU64,
  type WasiInputStream,
  type WasiNetwork,
  type WasiOutputStream,
  type WasiSocketsProvider,
  type WasiTcpSocket,
} from "../../../http/impl/wasi-sockets.js";
import { unsupported } from "../../errors.js";
import { getDefaultSettings, validateSettings } from "../../settings.js";
import type {
  Http2IncomingStreamData,
  Http2OutgoingResponseData,
  Http2ServerImplementation,
  Http2ServerOptions,
  Http2Settings,
  Http2StreamHandler,
  HttpHeaderField,
  HttpListenOptions,
  HttpServerAddress,
} from "../../types.js";
import {
  CLIENT_PREFACE,
  concat,
  FLAG,
  FRAME,
  FrameReader,
  parseUint32,
  uint32,
  type Http2Frame,
} from "../frames.js";
import { HpackDecoder } from "../hpack.js";
import {
  closeTransport,
  dataPayload,
  DEFAULT_FRAME_SIZE,
  DEFAULT_WINDOW,
  headerFragment,
  increaseWindow,
  mergeSettings,
  parseSettings,
  protocolError,
  serverSettingsPayload,
  validateFrame,
  write,
  writeHeaders,
} from "./shared.js";

interface ServerConnection {
  socket: WasiTcpSocket;
  input: WasiInputStream;
  output: WasiOutputStream;
}

interface RequestState {
  headers?: HttpHeaderField[];
  body: Uint8Array[];
  ended: boolean;
  sendWindow: number;
}

interface ServerFlowState {
  connectionWindow: number;
  remoteSettings: Http2Settings;
  deferred: Http2Frame[];
}

let nextSessionId = 1;

class Http2Server implements Http2ServerImplementation {
  readonly #connections = new Set<ServerConnection>();
  #settings: Http2Settings;
  #network: WasiNetwork | undefined;
  #socket: WasiTcpSocket | undefined;
  #address: HttpServerAddress | null = null;
  #listening = false;

  constructor(
    readonly provider: WasiSocketsProvider,
    options: Http2ServerOptions,
    readonly handler: Http2StreamHandler,
    readonly onError: (error: Error) => void,
  ) {
    this.#settings = mergeSettings(getDefaultSettings(), validateSettings(options.settings ?? {}));
  }

  listen(options: HttpListenOptions): HttpServerAddress {
    if (options.path !== undefined) {
      unsupported("http2.Server.listen path", "wasi:sockets does not expose Unix domain sockets");
    }
    const address = localAddress(options.host ?? "::", options.port ?? 0);
    const network = this.provider.instanceNetwork.instanceNetwork();
    const socket = this.provider.tcpCreateSocket.createTcpSocket(address.tag);
    if (
      !socket.startBind ||
      !socket.finishBind ||
      !socket.startListen ||
      !socket.finishListen ||
      !socket.accept ||
      !socket.localAddress
    ) {
      dispose(socket);
      dispose(network);
      unsupported(
        "http2.Server",
        "the supplied wasi:sockets provider does not expose TCP server operations",
      );
    }
    try {
      if (options.backlog !== undefined) {
        socket.setListenBacklogSize?.(wasiU64(this.provider, options.backlog));
      }
      socket.startBind(network, address);
      finishPending(() => socket.finishBind!(), socket);
      socket.startListen();
      finishPending(() => socket.finishListen!(), socket);
      this.#network = network;
      this.#socket = socket;
      this.#address = nodeAddress(socket.localAddress());
      this.#listening = true;
      this.#scheduleAccept();
      return this.#address;
    } catch (error) {
      dispose(socket);
      dispose(network);
      throw socketError(error, "listen", options.host);
    }
  }

  close(): boolean {
    const wasListening = this.#listening;
    this.#listening = false;
    for (const connection of this.#connections) {
      closeTransport(connection.socket, connection.input, connection.output);
    }
    this.#connections.clear();
    dispose(this.#socket);
    dispose(this.#network);
    this.#socket = undefined;
    this.#network = undefined;
    this.#address = null;
    return wasListening;
  }

  address(): HttpServerAddress | null {
    return this.#address;
  }

  updateSettings(settings: Http2Settings): void {
    const validated = validateSettings(settings);
    this.#settings = mergeSettings(this.#settings, validated);
    for (const { output } of this.#connections) {
      write(output, {
        type: FRAME.settings,
        flags: 0,
        streamId: 0,
        payload: serverSettingsPayload(validated),
      });
    }
  }

  ref(): void {}
  unref(): void {}

  async #accept(): Promise<void> {
    const listener = this.#socket;
    if (!this.#listening || !listener?.accept) {
      return;
    }
    try {
      let accepted: [WasiTcpSocket, WasiInputStream, WasiOutputStream];
      for (;;) {
        try {
          accepted = listener.accept();
          break;
        } catch (error) {
          const isWouldBlock =
            typeof error === "object" &&
            error !== null &&
            "tag" in error &&
            error.tag === "would-block";
          if (!isWouldBlock) {
            throw error;
          }
          const pollable = listener.subscribe();
          try {
            pollable.block();
          } finally {
            dispose(pollable);
          }
        }
      }
      const connection = { socket: accepted[0], input: accepted[1], output: accepted[2] };
      this.#connections.add(connection);
      this.#schedule(async () => {
        try {
          await this.#serve(connection);
        } catch (error) {
          this.onError(error instanceof Error ? error : socketError(error, "read"));
        } finally {
          this.#connections.delete(connection);
          closeTransport(connection.socket, connection.input, connection.output);
          if (this.#listening) {
            this.#schedule(() => this.#scheduleAccept());
          }
        }
      });
    } catch (error) {
      this.onError(error instanceof Error ? error : socketError(error, "accept"));
      if (this.#listening) {
        this.#schedule(() => this.#scheduleAccept());
      }
    }
  }

  async #serve(connection: ServerConnection): Promise<void> {
    const reader = new FrameReader(connection.input, (value) => wasiU64(this.provider, value));
    const preface = reader.readBytes(CLIENT_PREFACE.byteLength);
    if (!preface.every((byte, index) => byte === CLIENT_PREFACE[index])) {
      throw protocolError("Invalid HTTP/2 client preface");
    }
    write(connection.output, {
      type: FRAME.settings,
      flags: 0,
      streamId: 0,
      payload: serverSettingsPayload(this.#settings),
    });
    const hpack = new HpackDecoder();
    const streams = new Map<number, RequestState>();
    const flow: ServerFlowState = {
      connectionWindow: DEFAULT_WINDOW,
      remoteSettings: getDefaultSettings(),
      deferred: [],
    };
    let continuation: { streamId: number; endStream: boolean; chunks: Uint8Array[] } | undefined;
    const sessionId = nextSessionId++;

    for (;;) {
      const frame = flow.deferred.shift() ?? reader.readFrame();
      validateFrame(frame, this.#settings.maxFrameSize ?? DEFAULT_FRAME_SIZE);
      if (
        continuation &&
        (frame.type !== FRAME.continuation || frame.streamId !== continuation.streamId)
      ) {
        throw protocolError("Expected HTTP/2 CONTINUATION frame");
      }
      if (frame.type === FRAME.settings) {
        if ((frame.flags & FLAG.ack) === 0) {
          this.#applyRemoteSettings(flow, streams, parseSettings(frame.payload));
          write(connection.output, {
            type: FRAME.settings,
            flags: FLAG.ack,
            streamId: 0,
            payload: new Uint8Array(),
          });
        }
        continue;
      }
      if (frame.type === FRAME.ping) {
        if ((frame.flags & FLAG.ack) === 0) {
          write(connection.output, { ...frame, flags: FLAG.ack });
        }
        continue;
      }
      if (frame.type === FRAME.goaway) {
        return;
      }
      if (frame.type === FRAME.rstStream) {
        streams.delete(frame.streamId);
        continue;
      }
      if (frame.type === FRAME.windowUpdate) {
        this.#applyWindowUpdate(flow, streams, frame);
        continue;
      }
      if (frame.type === FRAME.priority) {
        continue;
      }

      if (frame.type === FRAME.headers) {
        const state = streams.get(frame.streamId) ?? {
          body: [],
          ended: false,
          sendWindow: flow.remoteSettings.initialWindowSize ?? DEFAULT_WINDOW,
        };
        streams.set(frame.streamId, state);
        const pending = {
          streamId: frame.streamId,
          endStream: (frame.flags & FLAG.endStream) !== 0,
          chunks: [headerFragment(frame)],
        };
        if ((frame.flags & FLAG.endHeaders) !== 0) {
          state.headers = hpack.decode(concat(pending.chunks));
          state.ended ||= pending.endStream;
        } else {
          continuation = pending;
        }
      } else if (frame.type === FRAME.continuation) {
        continuation!.chunks.push(frame.payload);
        if ((frame.flags & FLAG.endHeaders) !== 0) {
          const state = streams.get(frame.streamId)!;
          state.headers = hpack.decode(concat(continuation!.chunks));
          state.ended ||= continuation!.endStream;
          continuation = undefined;
        }
      } else if (frame.type === FRAME.data) {
        const state = streams.get(frame.streamId);
        if (!state) {
          throw protocolError("DATA received for an idle HTTP/2 stream");
        }
        const data = dataPayload(frame);
        if (data.byteLength > 0) {
          state.body.push(data);
          write(connection.output, {
            type: FRAME.windowUpdate,
            flags: 0,
            streamId: 0,
            payload: uint32(frame.payload.byteLength),
          });
          write(connection.output, {
            type: FRAME.windowUpdate,
            flags: 0,
            streamId: frame.streamId,
            payload: uint32(frame.payload.byteLength),
          });
        }
        state.ended ||= (frame.flags & FLAG.endStream) !== 0;
      }

      const state = streams.get(frame.streamId);
      if (state?.headers && state.ended) {
        const remote = connection.socket.remoteAddress?.();
        const remoteInfo = remote ? nodeAddress(remote) : undefined;
        const response = await this.handler({
          sessionId,
          id: frame.streamId,
          headers: state.headers,
          body: concat(state.body),
          remoteAddress: remoteInfo?.address,
          remotePort: remoteInfo?.port,
        } satisfies Http2IncomingStreamData);
        this.#writeResponse(connection, reader, flow, streams, frame.streamId, response);
        streams.delete(frame.streamId);
      }
    }
  }

  #writeResponse(
    connection: ServerConnection,
    reader: FrameReader,
    flow: ServerFlowState,
    streams: Map<number, RequestState>,
    streamId: number,
    response: Http2OutgoingResponseData,
  ): void {
    const maximumFrameSize = flow.remoteSettings.maxFrameSize ?? DEFAULT_FRAME_SIZE;
    writeHeaders(
      connection.output,
      streamId,
      response.headers,
      response.body.byteLength === 0,
      maximumFrameSize,
    );
    const state = streams.get(streamId);
    if (!state) {
      return;
    }
    let offset = 0;
    while (offset < response.body.byteLength) {
      while (flow.connectionWindow <= 0 || state.sendWindow <= 0) {
        const frame = reader.readFrame();
        validateFrame(frame, this.#settings.maxFrameSize ?? DEFAULT_FRAME_SIZE);
        if (frame.type === FRAME.windowUpdate) {
          this.#applyWindowUpdate(flow, streams, frame);
        } else if (frame.type === FRAME.settings && (frame.flags & FLAG.ack) === 0) {
          this.#applyRemoteSettings(flow, streams, parseSettings(frame.payload));
          write(connection.output, {
            type: FRAME.settings,
            flags: FLAG.ack,
            streamId: 0,
            payload: new Uint8Array(),
          });
        } else if (frame.type === FRAME.ping && (frame.flags & FLAG.ack) === 0) {
          write(connection.output, { ...frame, flags: FLAG.ack });
        } else if (frame.type === FRAME.rstStream && frame.streamId === streamId) {
          return;
        } else if (frame.type === FRAME.goaway) {
          return;
        } else {
          flow.deferred.push(frame);
        }
      }
      const length = Math.min(
        response.body.byteLength - offset,
        maximumFrameSize,
        flow.connectionWindow,
        state.sendWindow,
      );
      const last = offset + length === response.body.byteLength;
      write(connection.output, {
        type: FRAME.data,
        flags: last ? FLAG.endStream : 0,
        streamId,
        payload: response.body.slice(offset, offset + length),
      });
      offset += length;
      flow.connectionWindow -= length;
      state.sendWindow -= length;
    }
  }

  #applyRemoteSettings(
    flow: ServerFlowState,
    streams: Map<number, RequestState>,
    settings: Http2Settings,
  ): void {
    const oldWindow = flow.remoteSettings.initialWindowSize ?? DEFAULT_WINDOW;
    flow.remoteSettings = mergeSettings(flow.remoteSettings, settings);
    const delta = (flow.remoteSettings.initialWindowSize ?? DEFAULT_WINDOW) - oldWindow;
    for (const state of streams.values()) {
      state.sendWindow += delta;
    }
  }

  #applyWindowUpdate(
    flow: ServerFlowState,
    streams: Map<number, RequestState>,
    frame: Http2Frame,
  ): void {
    const increment = parseUint32(frame.payload) & 0x7fff_ffff;
    if (increment === 0) {
      throw protocolError("Zero HTTP/2 flow-control increment");
    }
    if (frame.streamId === 0) {
      flow.connectionWindow = increaseWindow(flow.connectionWindow, increment);
    } else {
      const state = streams.get(frame.streamId);
      if (state) {
        state.sendWindow = increaseWindow(state.sendWindow, increment);
      }
    }
  }

  #scheduleAccept(): void {
    this.#schedule(() => this.#accept());
  }

  #schedule(task: () => void | Promise<void>): void {
    if (this.provider.schedule) {
      this.provider.schedule(task);
    } else {
      queueMicrotask(() => void task());
    }
  }
}

export function createWasiSocketsHttp2Server(
  provider: WasiSocketsProvider,
  secure: boolean,
  options: Http2ServerOptions,
  handler: Http2StreamHandler,
  onError: (error: Error) => void,
): Http2ServerImplementation {
  if (secure) {
    unsupported(
      "http2.createSecureServer via wasi-sockets",
      "a guest TLS provider has not been configured",
    );
  }
  return new Http2Server(provider, options, handler, onError);
}
