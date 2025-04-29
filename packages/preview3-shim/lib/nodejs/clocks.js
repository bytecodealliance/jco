export { wallClock } from "@bytecodealliance/preview2-shim/clocks";
import { monotonicClock as monotonicClockV2 } from "@bytecodealliance/preview2-shim/clocks";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { subscribeInstant, subscribeDuration, ...baseMonotonicClock } =
  monotonicClockV2;

export const monotonicClock = {
  ...baseMonotonicClock,

  waitUntil(when) {
    const now = this.now();
    if (when <= now) {
      return Promise.resolve();
    }

    const diffNanos = when - now;
    const diffMillis = Number(diffNanos) / 1e6;
    return new Promise((resolve) => setTimeout(resolve, diffMillis));
  },

  waitFor(howLong) {
    return this.waitUntil(this.now() + howLong);
  },
};
