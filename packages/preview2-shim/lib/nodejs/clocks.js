import { hrtime } from "node:process";

let _hrStart = hrtime.bigint();

export const monotonicClock = {
  resolution () {
    return 1n;
  },

  now () {
    return hrtime.bigint() - _hrStart;
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
    const seconds = BigInt(Math.floor(Date.now() / 1e3));
    const nanoseconds = (Date.now() % 1e3) * 1e6;
    return { seconds, nanoseconds };
  },

  resolution() {
    console.log(`[wall-clock] Wall clock resolution`);
  }
};
