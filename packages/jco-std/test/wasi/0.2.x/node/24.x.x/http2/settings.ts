import * as nodeHttp2 from "node:http2";

import { describe, expect, test } from "vitest";

import {
  getDefaultSettings,
  getPackedSettings,
  getUnpackedSettings,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http2/settings.js";

describe("node:http2 settings", () => {
  test("returns a fresh null-prototype default settings object", () => {
    const first = getDefaultSettings();
    const second = getDefaultSettings();
    expect(first).toEqual(nodeHttp2.getDefaultSettings());
    expect(Object.getPrototypeOf(first)).toBeNull();
    expect(first).not.toBe(second);
  });

  test.each([
    {},
    { enablePush: false },
    { headerTableSize: 4, maxConcurrentStreams: 3 },
    { maxHeaderSize: 9 },
    { enableConnectProtocol: true },
    { customSettings: { 10: 7 } },
  ])("packs settings like Node: %o", (settings) => {
    expect(getPackedSettings(settings)).toEqual(nodeHttp2.getPackedSettings(settings));
  });

  test("unpacks known and custom settings", () => {
    const packed = nodeHttp2.getPackedSettings({
      enablePush: false,
      maxFrameSize: 32_768,
      customSettings: { 10: 7 },
    });
    expect(getUnpackedSettings(packed)).toEqual(nodeHttp2.getUnpackedSettings(packed));
  });

  test("uses Node-style errors for invalid values and packed lengths", () => {
    expect(() => getPackedSettings({ maxFrameSize: 1 })).toThrow(
      expect.objectContaining({ code: "ERR_HTTP2_INVALID_SETTING_VALUE" }),
    );
    expect(() => getPackedSettings({ customSettings: { 10: 0 } })).toThrow(
      expect.objectContaining({ code: "ERR_HTTP2_INVALID_SETTING_VALUE" }),
    );
    expect(() => getUnpackedSettings(new Uint8Array(1))).toThrow(
      expect.objectContaining({ code: "ERR_HTTP2_INVALID_PACKED_SETTINGS_LENGTH" }),
    );
  });
});
