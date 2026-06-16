import type {
  monotonicClock as MonotonicClockNamespace,
  wallClock as WallClockNamespace,
} from "../../types/clocks.js";
import { pollableCreate } from "./io.js";

export const monotonicClock: typeof MonotonicClockNamespace = {
  resolution(): bigint {
    // usually we dont get sub-millisecond accuracy in the browser
    // Note: is there a better way to determine this?
    return BigInt(1e6);
  },
  now(): bigint {
    // performance.now() is in milliseconds, but we want nanoseconds
    return BigInt(Math.floor(performance.now() * 1e6));
  },
  subscribeInstant(instant: bigint) {
    instant = BigInt(instant);
    const now = monotonicClock.now();
    if (instant <= now) {
      return pollableCreate(new Promise((resolve) => setTimeout(resolve, 0)));
    }
    return monotonicClock.subscribeDuration(instant - now);
  },
  subscribeDuration(duration: bigint) {
    duration = BigInt(duration);
    const ms = duration <= 0n ? 0 : Number(duration / 1_000_000n);
    return pollableCreate(new Promise((resolve) => setTimeout(resolve, ms)));
  },
};

export const wallClock: typeof WallClockNamespace = {
  now() {
    let now = Date.now(); // in milliseconds
    const seconds = BigInt(Math.floor(now / 1e3));
    const nanoseconds = (now % 1e3) * 1e6;
    return { seconds, nanoseconds };
  },
  resolution() {
    return { seconds: 0n, nanoseconds: 1e6 };
  },
};
