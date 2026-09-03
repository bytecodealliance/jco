import {
  connect as connectTcp,
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
} from "../../http/impl/wasi-sockets.js";
import { unsupported } from "../errors.js";
import { getDefaultSettings, validateSettings } from "../settings.js";
import type {
  DirectHttp2RequestOptions,
  Http2ClientOptions,
  Http2ClientSessionImplementation,
  Http2ClientStreamImplementation,
  Http2Implementation,
  Http2IncomingStreamData,
  Http2OutgoingResponseData,
  Http2PingResponse,
  Http2ResponseData,
  Http2ServerImplementation,
  Http2ServerOptions,
  Http2Settings,
  Http2StreamHandler,
  Http2StreamState,
  HttpHeaderField,
  HttpListenOptions,
  HttpServerAddress,
} from "../types.js";
import {
  CLIENT_PREFACE,
  concat,
  encodeFrame,
  FLAG,
  FRAME,
  FrameReader,
  parseUint32,
  uint32,
  type Http2Frame,
} from "./frames.js";
import { encodeHeaders, HpackDecoder } from "./hpack.js";

const DEFAULT_WINDOW = 65_535;
const DEFAULT_FRAME_SIZE = 16_384;

interface StreamState {
  headers: HttpHeaderField[];
  trailers: HttpHeaderField[];
  body: Uint8Array[];
  ended: boolean;
  reset?: number;
  sendWindow: number;
}

function protocolError(message: string, code = "ERR_HTTP2_ERROR"): Error {
  return Object.assign(new Error(message), { code });
}

function settingsPayload(settings: Http2Settings): Uint8Array {
  const known: Array<[keyof Http2Settings, number]> = [
    ["headerTableSize", 1],
    ["enablePush", 2],
    ["maxConcurrentStreams", 3],
    ["initialWindowSize", 4],
    ["maxFrameSize", 5],
    ["maxHeaderListSize", 6],
    ["enableConnectProtocol", 8],
  ];
  const entries: Array<[number, number]> = [];
  for (const [name, id] of known) {
    const value = settings[name];
    if (value !== undefined) {
      entries.push([id, typeof value === "boolean" ? Number(value) : (value as number)]);
    }
  }
  for (const [id, value] of Object.entries(settings.customSettings ?? {})) {
    if (!entries.some(([knownId]) => knownId === Number(id))) {
      entries.push([Number(id), value]);
    }
  }
  const payload = new Uint8Array(entries.length * 6);
  const view = new DataView(payload.buffer);
  entries.forEach(([id, value], index) => {
    view.setUint16(index * 6, id);
    view.setUint32(index * 6 + 2, value);
  });
  return payload;
}

function serverSettingsPayload(settings: Http2Settings): Uint8Array {
  // RFC 9113 section 6.5.2: a server MUST NOT send SETTINGS_ENABLE_PUSH.
  const { enablePush: _, ...serverSettings } = settings;
  return settingsPayload(serverSettings);
}

function parseSettings(payload: Uint8Array, fromServer = false): Http2Settings {
  if (payload.byteLength % 6 !== 0) {
    throw protocolError("Invalid HTTP/2 SETTINGS frame length");
  }
  const result: Http2Settings = {};
  const customSettings: Record<number, number> = {};
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  for (let offset = 0; offset < payload.byteLength; offset += 6) {
    const id = view.getUint16(offset);
    const value = view.getUint32(offset + 2);
    if (id === 1) {
      result.headerTableSize = value;
    } else if (id === 2) {
      if (fromServer || value > 1) {
        throw protocolError("Invalid HTTP/2 SETTINGS_ENABLE_PUSH value");
      }
      result.enablePush = value !== 0;
    } else if (id === 3) {
      result.maxConcurrentStreams = value;
    } else if (id === 4) {
      if (value > 0x7fff_ffff) {
        throw protocolError("Invalid HTTP/2 SETTINGS_INITIAL_WINDOW_SIZE value");
      }
      result.initialWindowSize = value;
    } else if (id === 5) {
      if (value < 16_384 || value > 0xff_ffff) {
        throw protocolError("Invalid HTTP/2 SETTINGS_MAX_FRAME_SIZE value");
      }
      result.maxFrameSize = value;
    } else if (id === 6) {
      result.maxHeaderListSize = result.maxHeaderSize = value;
    } else if (id === 8) {
      if (value > 1) {
        throw protocolError("Invalid HTTP/2 SETTINGS_ENABLE_CONNECT_PROTOCOL value");
      }
      result.enableConnectProtocol = value !== 0;
    } else {
      customSettings[id] = value;
    }
  }
  if (Object.keys(customSettings).length > 0) {
    result.customSettings = customSettings;
  }
  return result;
}

function validateFrame(frame: Http2Frame, maximumFrameSize: number): void {
  if (frame.payload.byteLength > maximumFrameSize) {
    throw protocolError("HTTP/2 frame exceeds MAX_FRAME_SIZE");
  }
  if (frame.type === FRAME.settings) {
    if (frame.streamId !== 0 || frame.payload.byteLength % 6 !== 0) {
      throw protocolError("Invalid HTTP/2 SETTINGS frame");
    }
    if ((frame.flags & FLAG.ack) !== 0 && frame.payload.byteLength !== 0) {
      throw protocolError("SETTINGS ACK has a payload");
    }
  } else if (frame.type === FRAME.ping) {
    if (frame.streamId !== 0 || frame.payload.byteLength !== 8) {
      throw protocolError("Invalid HTTP/2 PING frame");
    }
  } else if (frame.type === FRAME.goaway) {
    if (frame.streamId !== 0 || frame.payload.byteLength < 8) {
      throw protocolError("Invalid HTTP/2 GOAWAY frame");
    }
  } else if (frame.type === FRAME.rstStream) {
    if (frame.streamId === 0 || frame.payload.byteLength !== 4) {
      throw protocolError("Invalid HTTP/2 RST_STREAM frame");
    }
  } else if (frame.type === FRAME.windowUpdate) {
    if (frame.payload.byteLength !== 4) {
      throw protocolError("Invalid HTTP/2 WINDOW_UPDATE frame");
    }
  } else if (
    (frame.type === FRAME.data ||
      frame.type === FRAME.headers ||
      frame.type === FRAME.priority ||
      frame.type === FRAME.pushPromise ||
      frame.type === FRAME.continuation) &&
    frame.streamId === 0
  ) {
    throw protocolError("Stream frame used stream ID zero");
  }
}

function increaseWindow(current: number, increment: number): number {
  const value = current + increment;
  if (value > 0x7fff_ffff) {
    throw protocolError("HTTP/2 flow-control window overflow");
  }
  return value;
}

function mergeSettings(base: Http2Settings, update: Http2Settings): Http2Settings {
  return {
    ...base,
    ...update,
    customSettings: { ...base.customSettings, ...update.customSettings },
  };
}

function headerFragment(frame: Http2Frame): Uint8Array {
  let start = 0;
  let end = frame.payload.byteLength;
  if ((frame.flags & FLAG.padded) !== 0) {
    end -= frame.payload[0];
    start++;
  }
  if ((frame.flags & FLAG.priority) !== 0) {
    start += 5;
  }
  if (start > end) {
    throw protocolError("Invalid padded HTTP/2 HEADERS frame");
  }
  return frame.payload.slice(start, end);
}

function dataPayload(frame: Http2Frame): Uint8Array {
  if ((frame.flags & FLAG.padded) === 0) {
    return frame.payload;
  }
  const end = frame.payload.byteLength - frame.payload[0];
  if (end < 1) {
    throw protocolError("Invalid padded HTTP/2 DATA frame");
  }
  return frame.payload.slice(1, end);
}

function write(output: WasiOutputStream, frame: Http2Frame): void {
  output.blockingWriteAndFlush(encodeFrame(frame));
}

function writeHeaders(
  output: WasiOutputStream,
  streamId: number,
  headers: HttpHeaderField[],
  endStream: boolean,
  maximumFrameSize: number,
): void {
  const block = encodeHeaders(headers);
  if (block.byteLength === 0) {
    write(output, {
      type: FRAME.headers,
      flags: FLAG.endHeaders | Number(endStream),
      streamId,
      payload: block,
    });
  }
  for (let offset = 0; offset < block.byteLength; offset += maximumFrameSize) {
    const first = offset === 0;
    const last = offset + maximumFrameSize >= block.byteLength;
    write(output, {
      type: first ? FRAME.headers : FRAME.continuation,
      flags: (last ? FLAG.endHeaders : 0) | (first && endStream ? FLAG.endStream : 0),
      streamId,
      payload: block.slice(offset, offset + maximumFrameSize),
    });
  }
}

function closeTransport(
  socket: WasiTcpSocket,
  input: WasiInputStream,
  output: WasiOutputStream,
): void {
  try {
    socket.shutdown("both");
  } catch {
    /* Peer already closed. */
  }
  dispose(output);
  dispose(input);
  dispose(socket);
}

class ClientStream implements Http2ClientStreamImplementation {
  readonly #body: Uint8Array[] = [];
  #closed = false;

  constructor(
    readonly session: ClientSession,
    readonly streamId: number,
    readonly headers: HttpHeaderField[],
    readonly options: DirectHttp2RequestOptions,
  ) {}

  write(chunk: Uint8Array): boolean {
    if (this.#closed) {
      throw protocolError("The HTTP/2 stream is closed", "ERR_HTTP2_INVALID_STREAM");
    }
    this.#body.push(chunk.slice());
    return true;
  }

  finish(): Http2ResponseData {
    if (this.#closed) {
      throw protocolError("The HTTP/2 stream is closed", "ERR_HTTP2_INVALID_STREAM");
    }
    this.#closed = true;
    return this.session.finishStream(
      this.streamId,
      this.headers,
      concat(this.#body),
      Boolean(this.options.endStream),
    );
  }

  close(code: number): void {
    if (!this.#closed) {
      this.session.reset(this.streamId, code);
    }
    this.#closed = true;
  }

  id(): number {
    return this.streamId;
  }
  state(): Http2StreamState {
    return this.session.streamState(this.streamId);
  }
}

class ClientSession implements Http2ClientSessionImplementation {
  readonly #socket: WasiTcpSocket;
  readonly #input: WasiInputStream;
  readonly #output: WasiOutputStream;
  readonly #reader: FrameReader;
  readonly #decoder = new HpackDecoder();
  readonly #streams = new Map<number, StreamState>();
  #localSettings: Http2Settings;
  #remoteSettings = getDefaultSettings();
  #nextStreamId = 1;
  #sendWindow = DEFAULT_WINDOW;
  #ready = false;
  #closed = false;
  #continuation: { streamId: number; endStream: boolean; chunks: Uint8Array[] } | undefined;
  #settingsAcknowledged = false;
  #pingAcknowledgement: Uint8Array | undefined;

  constructor(provider: WasiSocketsProvider, authority: string, options: Http2ClientOptions) {
    const url = new URL(authority);
    if (url.protocol !== "http:") {
      unsupported(
        "http2.connect HTTPS via wasi-sockets",
        "a guest TLS provider has not been configured",
      );
    }
    if (
      options.ca !== undefined ||
      options.servername !== undefined ||
      options.rejectUnauthorized !== undefined
    ) {
      unsupported(
        "http2.connect TLS options via wasi-sockets",
        "cleartext h2 does not use TLS options",
      );
    }
    const transport = connectTcp(
      provider,
      url.hostname.replace(/^\[|\]$/g, ""),
      Number(url.port || 80),
    );
    this.#socket = transport.socket;
    this.#input = transport.input;
    this.#output = transport.output;
    this.#reader = new FrameReader(transport.input, (value) => wasiU64(provider, value));
    this.#localSettings = mergeSettings(
      getDefaultSettings(),
      validateSettings(options.settings ?? {}),
    );
    this.#output.blockingWriteAndFlush(CLIENT_PREFACE);
    write(this.#output, {
      type: FRAME.settings,
      flags: 0,
      streamId: 0,
      payload: settingsPayload(options.settings ?? {}),
    });
  }

  ready() {
    while (!this.#ready) {
      this.#process(this.#reader.readFrame());
    }
    return {
      alpnProtocol: "h2c",
      encrypted: false,
      localSettings: this.#localSettings,
      remoteSettings: this.#remoteSettings,
    };
  }

  request(headers: HttpHeaderField[], options: DirectHttp2RequestOptions): ClientStream {
    if (this.#closed) {
      throw protocolError("The HTTP/2 session is closed", "ERR_HTTP2_INVALID_SESSION");
    }
    const streamId = this.#nextStreamId;
    this.#nextStreamId += 2;
    this.#streams.set(streamId, {
      headers: [],
      trailers: [],
      body: [],
      ended: false,
      sendWindow: this.#remoteSettings.initialWindowSize ?? DEFAULT_WINDOW,
    });
    return new ClientStream(this, streamId, headers, options);
  }

  finishStream(
    streamId: number,
    headers: HttpHeaderField[],
    body: Uint8Array,
    endStreamAtHeaders: boolean,
  ): Http2ResponseData {
    this.ready();
    writeHeaders(
      this.#output,
      streamId,
      headers,
      endStreamAtHeaders || body.byteLength === 0,
      this.#remoteSettings.maxFrameSize ?? DEFAULT_FRAME_SIZE,
    );
    if (!endStreamAtHeaders && body.byteLength > 0) {
      this.#sendData(streamId, body);
    }
    const state = this.#streams.get(streamId)!;
    while (!state.ended && state.reset === undefined) {
      this.#process(this.#reader.readFrame());
    }
    if (state.reset !== undefined) {
      throw protocolError(`HTTP/2 stream ${streamId} reset with code ${state.reset}`);
    }
    this.#streams.delete(streamId);
    return { headers: state.headers, trailers: state.trailers, body: concat(state.body) };
  }

  close(): void {
    if (!this.#closed) {
      this.goaway(0, undefined, new Uint8Array());
      this.#close();
    }
  }
  destroy(code: number): void {
    if (!this.#closed) {
      this.goaway(code, undefined, new Uint8Array());
      this.#close();
    }
  }

  settings(settings: Http2Settings): Http2Settings {
    const validated = validateSettings(settings);
    this.#settingsAcknowledged = false;
    write(this.#output, {
      type: FRAME.settings,
      flags: 0,
      streamId: 0,
      payload: settingsPayload(validated),
    });
    while (!this.#settingsAcknowledged) {
      this.#process(this.#reader.readFrame());
    }
    return (this.#localSettings = mergeSettings(this.#localSettings, validated));
  }

  ping(payload: Uint8Array): Http2PingResponse {
    const started = Date.now();
    this.#pingAcknowledgement = undefined;
    write(this.#output, { type: FRAME.ping, flags: 0, streamId: 0, payload });
    while (!this.#pingAcknowledgement) {
      this.#process(this.#reader.readFrame());
    }
    return { durationMs: Date.now() - started, payload: this.#pingAcknowledgement };
  }

  goaway(code: number, lastStreamId: number | undefined, opaqueData: Uint8Array): void {
    write(this.#output, {
      type: FRAME.goaway,
      flags: 0,
      streamId: 0,
      payload: concat([
        // A client's last-stream-id describes peer-initiated streams, not its own odd-numbered
        // request streams.  We do not accept server push, so the default is always zero.
        uint32(lastStreamId ?? 0),
        uint32(code),
        opaqueData,
      ]),
    });
  }

  ref(): void {}
  unref(): void {}

  reset(streamId: number, code: number): void {
    write(this.#output, { type: FRAME.rstStream, flags: 0, streamId, payload: uint32(code) });
    this.#streams.delete(streamId);
  }

  streamState(streamId: number): Http2StreamState {
    const state = this.#streams.get(streamId);
    return state ? { state: state.ended ? 6 : 2, localWindowSize: state.sendWindow } : { state: 7 };
  }

  #sendData(streamId: number, body: Uint8Array): void {
    const state = this.#streams.get(streamId)!;
    let offset = 0;
    while (offset < body.byteLength) {
      while (this.#sendWindow <= 0 || state.sendWindow <= 0) {
        this.#process(this.#reader.readFrame());
      }
      const length = Math.min(
        body.byteLength - offset,
        this.#remoteSettings.maxFrameSize ?? DEFAULT_FRAME_SIZE,
        this.#sendWindow,
        state.sendWindow,
      );
      const last = offset + length === body.byteLength;
      write(this.#output, {
        type: FRAME.data,
        flags: last ? FLAG.endStream : 0,
        streamId,
        payload: body.slice(offset, offset + length),
      });
      offset += length;
      this.#sendWindow -= length;
      state.sendWindow -= length;
    }
  }

  #process(frame: Http2Frame): void {
    validateFrame(frame, this.#localSettings.maxFrameSize ?? DEFAULT_FRAME_SIZE);
    if (
      this.#continuation &&
      (frame.type !== FRAME.continuation || frame.streamId !== this.#continuation.streamId)
    ) {
      throw protocolError("Expected HTTP/2 CONTINUATION frame");
    }
    if (frame.type === FRAME.settings) {
      if (frame.streamId !== 0) {
        throw protocolError("SETTINGS frame used a stream ID");
      }
      if ((frame.flags & FLAG.ack) !== 0) {
        if (frame.payload.byteLength !== 0) {
          throw protocolError("SETTINGS ACK has a payload");
        }
        this.#settingsAcknowledged = true;
      } else {
        const oldWindow = this.#remoteSettings.initialWindowSize ?? DEFAULT_WINDOW;
        this.#remoteSettings = mergeSettings(
          this.#remoteSettings,
          parseSettings(frame.payload, true),
        );
        const delta = (this.#remoteSettings.initialWindowSize ?? DEFAULT_WINDOW) - oldWindow;
        for (const state of this.#streams.values()) {
          state.sendWindow += delta;
        }
        write(this.#output, {
          type: FRAME.settings,
          flags: FLAG.ack,
          streamId: 0,
          payload: new Uint8Array(),
        });
        this.#ready = true;
      }
    } else if (frame.type === FRAME.headers) {
      const pending = {
        streamId: frame.streamId,
        endStream: (frame.flags & FLAG.endStream) !== 0,
        chunks: [headerFragment(frame)],
      };
      if ((frame.flags & FLAG.endHeaders) !== 0) {
        this.#finishHeaders(pending);
      } else {
        this.#continuation = pending;
      }
    } else if (frame.type === FRAME.continuation) {
      this.#continuation!.chunks.push(frame.payload);
      if ((frame.flags & FLAG.endHeaders) !== 0) {
        const pending = this.#continuation;
        this.#continuation = undefined;
        this.#finishHeaders(pending!);
      }
    } else if (frame.type === FRAME.data) {
      const state = this.#streams.get(frame.streamId);
      if (!state) {
        return;
      }
      const data = dataPayload(frame);
      if (data.byteLength > 0) {
        state.body.push(data);
        write(this.#output, {
          type: FRAME.windowUpdate,
          flags: 0,
          streamId: 0,
          payload: uint32(frame.payload.byteLength),
        });
        write(this.#output, {
          type: FRAME.windowUpdate,
          flags: 0,
          streamId: frame.streamId,
          payload: uint32(frame.payload.byteLength),
        });
      }
      if ((frame.flags & FLAG.endStream) !== 0) {
        state.ended = true;
      }
    } else if (frame.type === FRAME.windowUpdate) {
      const increment = parseUint32(frame.payload) & 0x7fff_ffff;
      if (increment === 0) {
        throw protocolError("Zero HTTP/2 flow-control increment");
      }
      if (frame.streamId === 0) {
        this.#sendWindow = increaseWindow(this.#sendWindow, increment);
      } else {
        const state = this.#streams.get(frame.streamId);
        if (state) {
          state.sendWindow = increaseWindow(state.sendWindow, increment);
        }
      }
    } else if (frame.type === FRAME.ping) {
      if ((frame.flags & FLAG.ack) !== 0) {
        this.#pingAcknowledgement = frame.payload.slice();
      } else {
        write(this.#output, { ...frame, flags: FLAG.ack });
      }
    } else if (frame.type === FRAME.rstStream) {
      const state = this.#streams.get(frame.streamId);
      if (state) {
        state.reset = parseUint32(frame.payload);
      }
    } else if (frame.type === FRAME.goaway) {
      const last = parseUint32(frame.payload) & 0x7fff_ffff;
      for (const [id, state] of this.#streams) {
        if (id > last) {
          state.reset = parseUint32(frame.payload, 4);
        }
      }
    } else if (frame.type === FRAME.pushPromise) {
      throw protocolError("HTTP/2 server push is not supported", "ERR_HTTP2_STREAM_CANCEL");
    }
  }

  #finishHeaders(pending: { streamId: number; endStream: boolean; chunks: Uint8Array[] }): void {
    const state = this.#streams.get(pending.streamId);
    if (!state) {
      return;
    }
    const headers = this.#decoder.decode(concat(pending.chunks));
    if (state.headers.length === 0) {
      state.headers = headers;
    } else {
      state.trailers.push(...headers);
    }
    if (pending.endStream) {
      state.ended = true;
    }
  }

  #close(): void {
    this.#closed = true;
    closeTransport(this.#socket, this.#input, this.#output);
  }
}

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

/** Implements cleartext, prior-knowledge HTTP/2 directly over Preview 2 TCP streams. */
export function createWasiSocketsHttp2Implementation(
  provider: WasiSocketsProvider,
): Http2Implementation {
  return {
    connect: (authority, options) => new ClientSession(provider, authority, options),
    createServer(secure, options, handler, onError) {
      if (secure) {
        unsupported(
          "http2.createSecureServer via wasi-sockets",
          "a guest TLS provider has not been configured",
        );
      }
      return new Http2Server(provider, options, handler, onError);
    },
  };
}
