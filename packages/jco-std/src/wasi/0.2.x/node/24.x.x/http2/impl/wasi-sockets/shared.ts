import {
  dispose,
  type WasiInputStream,
  type WasiOutputStream,
  type WasiTcpSocket,
} from "../../../http/impl/wasi-sockets.js";
import type { Http2Settings, HttpHeaderField } from "../../types.js";
import { encodeFrame, FLAG, FRAME, type Http2Frame } from "../frames.js";
import { encodeHeaders } from "../hpack.js";

export const DEFAULT_WINDOW = 65_535;
export const DEFAULT_FRAME_SIZE = 16_384;

export function protocolError(message: string, code = "ERR_HTTP2_ERROR"): Error {
  return Object.assign(new Error(message), { code });
}

export function settingsPayload(settings: Http2Settings): Uint8Array {
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

export function serverSettingsPayload(settings: Http2Settings): Uint8Array {
  // RFC 9113 section 6.5.2: a server MUST NOT send SETTINGS_ENABLE_PUSH.
  const { enablePush: _, ...serverSettings } = settings;
  return settingsPayload(serverSettings);
}

export function parseSettings(payload: Uint8Array, fromServer = false): Http2Settings {
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

export function validateFrame(frame: Http2Frame, maximumFrameSize: number): void {
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

export function increaseWindow(current: number, increment: number): number {
  const value = current + increment;
  if (value > 0x7fff_ffff) {
    throw protocolError("HTTP/2 flow-control window overflow");
  }
  return value;
}

export function mergeSettings(base: Http2Settings, update: Http2Settings): Http2Settings {
  return {
    ...base,
    ...update,
    customSettings: { ...base.customSettings, ...update.customSettings },
  };
}

export function headerFragment(frame: Http2Frame): Uint8Array {
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

export function dataPayload(frame: Http2Frame): Uint8Array {
  if ((frame.flags & FLAG.padded) === 0) {
    return frame.payload;
  }
  const end = frame.payload.byteLength - frame.payload[0];
  if (end < 1) {
    throw protocolError("Invalid padded HTTP/2 DATA frame");
  }
  return frame.payload.slice(1, end);
}

export function write(output: WasiOutputStream, frame: Http2Frame): void {
  output.blockingWriteAndFlush(encodeFrame(frame));
}

export function writeHeaders(
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

export function closeTransport(
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
