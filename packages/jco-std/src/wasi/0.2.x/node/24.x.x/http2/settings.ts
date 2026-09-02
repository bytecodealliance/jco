/**
 * Settings packing follows nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/internal/http2/core.js and
 * lib/internal/http2/util.js (MIT license). Native buffer state is replaced by
 * a portable RFC 9113 six-byte SETTINGS payload implementation.
 */
import { Buffer } from "node:buffer";

import { constants } from "./constants.js";
import { invalidArgType, invalidPackedSettingsLength, invalidSetting } from "./errors.js";
import type { DirectHttp2Settings, Http2Settings } from "./types.js";

const settingIds = {
  headerTableSize: constants.NGHTTP2_SETTINGS_HEADER_TABLE_SIZE,
  enablePush: constants.NGHTTP2_SETTINGS_ENABLE_PUSH,
  maxConcurrentStreams: constants.NGHTTP2_SETTINGS_MAX_CONCURRENT_STREAMS,
  initialWindowSize: constants.NGHTTP2_SETTINGS_INITIAL_WINDOW_SIZE,
  maxFrameSize: constants.NGHTTP2_SETTINGS_MAX_FRAME_SIZE,
  maxHeaderListSize: constants.NGHTTP2_SETTINGS_MAX_HEADER_LIST_SIZE,
  enableConnectProtocol: constants.NGHTTP2_SETTINGS_ENABLE_CONNECT_PROTOCOL,
} as const;

type NumericSetting =
  | "headerTableSize"
  | "initialWindowSize"
  | "maxFrameSize"
  | "maxConcurrentStreams"
  | "maxHeaderListSize";

function validateNumber(name: NumericSetting, value: unknown): number {
  const minimum = name === "maxFrameSize" ? constants.MIN_MAX_FRAME_SIZE : 0;
  const maximum =
    name === "initialWindowSize"
      ? constants.MAX_INITIAL_WINDOW_SIZE
      : name === "maxFrameSize"
        ? constants.MAX_MAX_FRAME_SIZE
        : 0xffff_ffff;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw invalidSetting(name, value);
  }
  return Math.trunc(value);
}

function validateBoolean(name: "enablePush" | "enableConnectProtocol", value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw invalidSetting(name, value);
  }
  return value;
}

export function validateSettings(settings: Http2Settings): Http2Settings {
  if (typeof settings !== "object" || settings === null) {
    throw invalidArgType("settings", "object", settings);
  }
  const result: Http2Settings = {};
  for (const name of [
    "headerTableSize",
    "initialWindowSize",
    "maxFrameSize",
    "maxConcurrentStreams",
    "maxHeaderListSize",
  ] as const) {
    if (settings[name] !== undefined) {
      result[name] = validateNumber(name, settings[name]);
    }
  }
  if (settings.maxHeaderSize !== undefined) {
    result.maxHeaderListSize = validateNumber("maxHeaderListSize", settings.maxHeaderSize);
  }
  for (const name of ["enablePush", "enableConnectProtocol"] as const) {
    if (settings[name] !== undefined) {
      result[name] = validateBoolean(name, settings[name]);
    }
  }
  if (settings.customSettings !== undefined) {
    if (typeof settings.customSettings !== "object" || settings.customSettings === null) {
      throw invalidSetting("customSettings", settings.customSettings);
    }
    result.customSettings = {};
    for (const [idText, rawValue] of Object.entries(settings.customSettings)) {
      const id = Number(idText);
      if (!Number.isInteger(id) || id < 1 || id > 0xffff) {
        throw invalidSetting(`customSettings.${idText}`, rawValue);
      }
      const value = validateNumber("headerTableSize", rawValue);
      if (value === 0) {
        throw invalidSetting(`customSettings.${idText}`, rawValue);
      }
      result.customSettings[id] = value;
    }
  }
  return result;
}

export function getDefaultSettings(): Http2Settings {
  return Object.assign(Object.create(null) as Http2Settings, {
    headerTableSize: constants.DEFAULT_SETTINGS_HEADER_TABLE_SIZE,
    enablePush: Boolean(constants.DEFAULT_SETTINGS_ENABLE_PUSH),
    initialWindowSize: constants.DEFAULT_SETTINGS_INITIAL_WINDOW_SIZE,
    maxFrameSize: constants.DEFAULT_SETTINGS_MAX_FRAME_SIZE,
    maxConcurrentStreams: constants.DEFAULT_SETTINGS_MAX_CONCURRENT_STREAMS,
    maxHeaderSize: constants.DEFAULT_SETTINGS_MAX_HEADER_LIST_SIZE,
    maxHeaderListSize: constants.DEFAULT_SETTINGS_MAX_HEADER_LIST_SIZE,
    enableConnectProtocol: Boolean(constants.DEFAULT_SETTINGS_ENABLE_CONNECT_PROTOCOL),
  });
}

function entries(settings: Http2Settings): Array<[number, number]> {
  const value = validateSettings(settings);
  const result: Array<[number, number]> = [];
  for (const name of Object.keys(settingIds) as Array<keyof typeof settingIds>) {
    const setting = value[name];
    if (setting !== undefined) {
      result.push([settingIds[name], typeof setting === "boolean" ? Number(setting) : setting]);
    }
  }
  for (const [id, setting] of Object.entries(value.customSettings ?? {})) {
    const numericId = Number(id);
    if (!result.some(([known]) => known === numericId)) {
      result.push([numericId, setting]);
    }
  }
  return result.sort(([left], [right]) => left - right);
}

export function getPackedSettings(settings: Http2Settings = {}): Buffer {
  const values = entries(settings);
  const packed = new Uint8Array(values.length * 6);
  const view = new DataView(packed.buffer);
  values.forEach(([id, value], index) => {
    view.setUint16(index * 6, id);
    view.setUint32(index * 6 + 2, value);
  });
  return Buffer.from(packed);
}

export function getUnpackedSettings(buffer: Uint8Array): Http2Settings {
  if (!ArrayBuffer.isView(buffer) || !("length" in buffer)) {
    throw invalidArgType("buf", "Buffer or TypedArray", buffer);
  }
  if (buffer.byteLength % 6 !== 0) {
    throw invalidPackedSettingsLength();
  }
  const settings: Http2Settings = {};
  const customSettings: Record<number, number> = {};
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  for (let offset = 0; offset < buffer.byteLength; offset += 6) {
    const id = view.getUint16(offset);
    const value = view.getUint32(offset + 2);
    switch (id) {
      case constants.NGHTTP2_SETTINGS_HEADER_TABLE_SIZE:
        settings.headerTableSize = value;
        break;
      case constants.NGHTTP2_SETTINGS_ENABLE_PUSH:
        settings.enablePush = value !== 0;
        break;
      case constants.NGHTTP2_SETTINGS_MAX_CONCURRENT_STREAMS:
        settings.maxConcurrentStreams = value;
        break;
      case constants.NGHTTP2_SETTINGS_INITIAL_WINDOW_SIZE:
        settings.initialWindowSize = value;
        break;
      case constants.NGHTTP2_SETTINGS_MAX_FRAME_SIZE:
        settings.maxFrameSize = value;
        break;
      case constants.NGHTTP2_SETTINGS_MAX_HEADER_LIST_SIZE:
        settings.maxHeaderListSize = value;
        settings.maxHeaderSize = value;
        break;
      case constants.NGHTTP2_SETTINGS_ENABLE_CONNECT_PROTOCOL:
        settings.enableConnectProtocol = value !== 0;
        break;
      default:
        customSettings[id] = value;
    }
  }
  if (Object.keys(customSettings).length > 0) {
    settings.customSettings = customSettings;
  }
  return settings;
}

export function toDirectSettings(settings: Http2Settings = {}): DirectHttp2Settings {
  const value = validateSettings(settings);
  return {
    headerTableSize: value.headerTableSize,
    enablePush: value.enablePush,
    initialWindowSize: value.initialWindowSize,
    maxFrameSize: value.maxFrameSize,
    maxConcurrentStreams: value.maxConcurrentStreams,
    maxHeaderListSize: value.maxHeaderListSize,
    enableConnectProtocol: value.enableConnectProtocol,
    customSettings: Object.entries(value.customSettings ?? {}).map(([id, setting]) => ({
      id: Number(id),
      value: setting,
    })),
  };
}

export function fromDirectSettings(settings: DirectHttp2Settings): Http2Settings {
  const result: Http2Settings = {
    headerTableSize: settings.headerTableSize,
    enablePush: settings.enablePush,
    initialWindowSize: settings.initialWindowSize,
    maxFrameSize: settings.maxFrameSize,
    maxConcurrentStreams: settings.maxConcurrentStreams,
    maxHeaderListSize: settings.maxHeaderListSize,
    maxHeaderSize: settings.maxHeaderListSize,
    enableConnectProtocol: settings.enableConnectProtocol,
  };
  if (settings.customSettings.length > 0) {
    result.customSettings = Object.fromEntries(
      settings.customSettings.map(({ id, value }) => [id, value]),
    );
  }
  return result;
}
