export const monotonicClock = {
  resolution() {
    // usually we dont get sub-millisecond accuracy in the browser
    // Note: is there a better way to determine this?
    return 1e6;
  },
  now () {
    // performance.now() is in milliseconds, but we want nanoseconds
    return BigInt(Math.floor(performance.now() * 1e6));
  },
  subscribeInstant (instant) {
    instant = BigInt(instant);
    const now = this.now();
    if (instant <= now)
      return this.subscribeDuration(0);
    return this.subscribeDuration(instant - now);
  },
  subscribeDuration (_duration) {
    _duration = BigInt(_duration);
    console.log(`[monotonic-clock] subscribe`);
  }
};

export const wallClock = {
  now() {
    let now = Date.now(); // in milliseconds
    const seconds = BigInt(Math.floor(now / 1e3));
    const nanoseconds = (now % 1e3) * 1e6;
    return { seconds, nanoseconds };
  },
  resolution() {
    return { seconds: 0n, nanoseconds: 1e6 };
  }
};
