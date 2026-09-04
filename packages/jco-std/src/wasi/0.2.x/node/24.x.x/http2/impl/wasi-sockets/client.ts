import {
  connect as connectTcp,
  wasiU64,
  type WasiInputStream,
  type WasiOutputStream,
  type WasiSocketsProvider,
  type WasiTcpSocket,
} from "../../../http/impl/wasi-sockets.js";
import { unsupported } from "../../errors.js";
import { getDefaultSettings, validateSettings } from "../../settings.js";
import type {
  DirectHttp2RequestOptions,
  Http2ClientOptions,
  Http2ClientSessionImplementation,
  Http2ClientStreamImplementation,
  Http2PingResponse,
  Http2ResponseData,
  Http2Settings,
  Http2StreamState,
  HttpHeaderField,
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
  settingsPayload,
  validateFrame,
  write,
  writeHeaders,
} from "./shared.js";

interface StreamState {
  headers: HttpHeaderField[];
  trailers: HttpHeaderField[];
  body: Uint8Array[];
  ended: boolean;
  reset?: number;
  sendWindow: number;
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

export function createWasiSocketsHttp2Client(
  provider: WasiSocketsProvider,
  authority: string,
  options: Http2ClientOptions,
): Http2ClientSessionImplementation {
  return new ClientSession(provider, authority, options);
}
