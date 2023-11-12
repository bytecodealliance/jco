function _hrtimeBigint () {
  // performance.now() is in milliseconds, but we want nanoseconds
  return BigInt(Math.floor(performance.now() * 1e6));
}

const _hrStart = _hrtimeBigint();

export const monotonicClock = {
  resolution() {
    // usually we dont get sub-millisecond accuracy in the browser
    // TODO: better way to determine this?
    return 1e6;
  },
  now () {
    return _hrtimeBigint() - _hrStart;
  },
  subscribeInstant (instant) {
    instant = BigInt(instant);
    if (instant <= _hrStart)
      return this.subscribeDuration(0);
    return this.subscribeDuration(instant - _hrStart);
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
