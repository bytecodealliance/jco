import { ioCall, createPoll, resolvedPoll } from "../io/worker-io.js";
import {
  CLOCKS_NOW,
  CLOCKS_INSTANT_SUBSCRIBE,
  CLOCKS_DURATION_SUBSCRIBE,
} from "../io/calls.js";

export const monotonicClock = {
  resolution() {
    return 1n;
  },
  now() {
    return ioCall(CLOCKS_NOW, null, null);
  },
  subscribeInstant(instant) {
    return createPoll(CLOCKS_INSTANT_SUBSCRIBE, null, instant);
  },
  subscribeDuration(duration) {
    duration = BigInt(duration);
    if (duration === 0n) return resolvedPoll;
    return createPoll(CLOCKS_DURATION_SUBSCRIBE, null, duration);
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
