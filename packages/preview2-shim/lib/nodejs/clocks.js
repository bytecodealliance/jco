import { hrtime } from "node:process";
import { createPoll, resolvedPoll } from "../io/worker-io.js";
import * as calls from "../io/calls.js";

export const monotonicClock = {
  resolution() {
    return 1n;
  },
  now() {
    return hrtime.bigint();
  },
  subscribeInstant(instant) {
    instant = BigInt(instant);
    const now = hrtime.bigint();
    if (instant <= now) return resolvedPoll();
    return this.subscribeDuration(instant - now);
  },
  subscribeDuration(duration) {
    duration = BigInt(duration);
    if (duration === 0n) return resolvedPoll();
    return createPoll(calls.CLOCKS_DURATION_SUBSCRIBE, null, duration);
  },
};

export const wallClock = {
  now() {
    const seconds = BigInt(Math.floor(Date.now() / 1e3));
    const nanoseconds = (Date.now() % 1e3) * 1e6;
    return { seconds, nanoseconds };
  },
  resolution() {
    return { seconds: 0n, nanoseconds: 1e6 };
  },
};
