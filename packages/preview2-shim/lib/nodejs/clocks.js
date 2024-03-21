import { createPoll } from "../io/worker-io.js";
import {
  CLOCKS_INSTANT_SUBSCRIBE,
  CLOCKS_DURATION_SUBSCRIBE,
} from "../io/calls.js";
import { hrtime } from "node:process";

const symbolCabiLower = Symbol.for("cabiLower");

function resolution() {
  return 1n;
}

export const monotonicClock = {
  resolution,
  now() {
    return hrtime.bigint();
  },
  subscribeInstant(instant) {
    return createPoll(CLOCKS_INSTANT_SUBSCRIBE, null, instant);
  },
  subscribeDuration(duration) {
    duration = BigInt(duration);
    return createPoll(CLOCKS_DURATION_SUBSCRIBE, null, duration);
  },
};

export const wallClock = {
  resolution() {
    return { seconds: 0n, nanoseconds: 1e6 };
  },
  now() {
    const seconds = BigInt(Math.floor(Date.now() / 1e3));
    const nanoseconds = (Date.now() % 1e3) * 1e6;
    return { seconds, nanoseconds };
  },
};

monotonicClock.resolution[symbolCabiLower] = () => resolution;
monotonicClock.now[symbolCabiLower] = () => hrtime.bigint;
wallClock.resolution[symbolCabiLower] = ({ memory }) => {
  let buf32 = new Int32Array(memory.buffer);
  return function now(retptr) {
    if (memory.buffer !== buf32.buffer) buf32 = new Int32Array(memory.buffer);
    if (retptr % 4) throw new Error('wasi-io trap: retptr not aligned');
    buf32[(retptr >> 2) + 0] = 0;
    buf32[(retptr >> 2) + 4] = 0;
    buf32[(retptr >> 2) + 8] = 1_000_000;
  };
};

wallClock.now[symbolCabiLower] = ({ memory }) => {
  let buf32 = new Int32Array(memory.buffer);
  let buf64 = new BigInt64Array(memory.buffer);
  return function now(retptr) {
    if (memory.buffer !== buf32.buffer) {
      buf32 = new Int32Array(memory.buffer);
      buf64 = new BigInt64Array(memory.buffer);
    }
    if (retptr % 4) throw new Error('wasi-io trap: retptr not aligned');
    buf64[(retptr >> 2) + 0] = BigInt(Math.floor(Date.now() / 1e3));
    buf32[(retptr >> 2) + 8] = (Date.now() % 1e3) * 1e6;
  };
};
