function _hrtimeBigint () {
  // performance.now() is in milliseconds, but we want nanoseconds
  return BigInt(Math.floor(performance.now() * 1e6));
}

let _hrStart = _hrtimeBigint();

export const monotonicClock = {
  resolution() {
    return 1n;
  },
  now () {
    return _hrtimeBigint() - _hrStart;
  },
  subscribe (_when, _absolute) {
    console.log(`[monotonic-clock] Subscribe`);
  }
};

export const timezone = {
  display (timezone, when) {
    console.log(`[timezone] DISPLAY ${timezone} ${when}`);
  },

  utcOffset (timezone, when) {
    console.log(`[timezone] UTC OFFSET ${timezone} ${when}`);
    return 0;
  },

  dropTimezone (timezone) {
    console.log(`[timezone] DROP ${timezone}`);
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
    console.log(`[wall-clock] Wall clock resolution`);
  }
};
