import {
  wallClock,
  monotonicClock as monotonicClockV2,
} from "@bytecodealliance/preview2-shim/clocks";

// Re-export wall-clock as system-clock per latest WASI 0.3.0-draft.
export const systemClock = {
  now: wallClock.now,

  /**
   * Query the resolution of the clock.
   *
   * WIT:
   * ```
   * get-resolution: func() -> duration;
   * ```
   *
   * @returns {bigint} The smallest distinguishable duration in nanoseconds.
   */
  getResolution() {
    const dt = wallClock.resolution();
    return BigInt(dt.seconds) * 1_000_000_000n + BigInt(dt.nanoseconds);
  },
};

// eslint-disable-next-line no-unused-vars
const { subscribeInstant, subscribeDuration, ...baseMonotonicClock } = monotonicClockV2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const monotonicClock = {
  ...baseMonotonicClock,

  /**
   * Query the resolution of the clock.
   *
   * WIT:
   * ```
   * get-resolution: func() -> duration;
   * ```
   *
   * @returns {bigint} Duration of a clock tick in nanoseconds.
   */
  getResolution() {
    return baseMonotonicClock.resolution();
  },

  /**
   * Waits until a specific mark (in nanoseconds) is reached
   *
   * WIT:
   * ```
   * wait-until: async func(when: mark);
   * ```
   * @async
   * @param {bigint} targetNs - The target mark in nanoseconds to wait until
   * @returns {Promise<void>} A promise that resolves when the target mark is reached
   * @throws {TypeError} If targetNs is not a bigint
   */
  async waitUntil(targetNs) {
    const nowNs = this.now();
    const diffNs = targetNs - nowNs;

    if (diffNs <= 0n) {
      return;
    }

    const ms = diffNs / 1_000_000n;
    if (ms > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new TypeError(`Cannot wait for ${targetNs} ns, exceeds maximum safe integer`);
    }

    await sleep(Number(ms));
  },

  /**
   * Waits for a specified duration in nanoseconds
   *
   * WIT:
   * ```
   * wait-for: async func(how-long: duration);
   * ```
   * @async
   * @param {bigint} durationNs - The duration to wait in nanoseconds
   * @returns {Promise<void>} A promise that resolves after the specified duration
   * @throws {TypeError} If durationNs is not a bigint
   */
  async waitFor(durationNs) {
    if (durationNs <= 0n) {
      return;
    }

    const ms = durationNs / 1_000_000n;
    if (ms > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new TypeError(`Cannot wait for ${durationNs} ns, exceeds maximum safe integer`);
    }

    await sleep(Number(ms));
  },
};
