import { describe, expect, test } from "vitest";

import streamIter, * as namespace from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/iter/index.js";

const DEFAULT_KEYS = [
  "Broadcast",
  "Share",
  "Stream",
  "SyncShare",
  "array",
  "arrayBuffer",
  "arrayBufferSync",
  "arraySync",
  "broadcast",
  "broadcastProtocol",
  "bytes",
  "bytesSync",
  "drainableProtocol",
  "duplex",
  "from",
  "fromReadable",
  "fromSync",
  "fromWritable",
  "merge",
  "ondrain",
  "pipeTo",
  "pipeToSync",
  "pull",
  "pullSync",
  "push",
  "share",
  "shareProtocol",
  "shareSync",
  "shareSyncProtocol",
  "tap",
  "tapSync",
  "text",
  "textSync",
  "toAsyncStreamable",
  "toReadable",
  "toReadableSync",
  "toStreamable",
  "toWritable",
];

describe("node:stream/iter module", () => {
  test("matches Node 24.20's export keys", () => {
    expect(Object.keys(streamIter).sort()).toEqual(DEFAULT_KEYS);
    expect(
      Object.keys(namespace)
        .filter((key) => key !== "default")
        .sort(),
    ).toEqual(DEFAULT_KEYS);
  });

  test("shares named/default identities and freezes the Stream namespace", () => {
    for (const key of DEFAULT_KEYS) {
      expect(streamIter[key as keyof typeof streamIter]).toBe(
        namespace[key as keyof typeof namespace],
      );
    }
    expect(Object.isFrozen(streamIter.Stream)).toBe(true);
    for (const [key, value] of Object.entries(streamIter.Stream)) {
      expect(value, key).toBe(namespace[key as keyof typeof namespace]);
    }
  });
});
