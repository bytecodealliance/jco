import { hrtime } from "node:process";

let _hrStart = hrtime.bigint();

export const clocksMonotonicClock = {
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

export const clocksTimezone = {
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

export const clocksWallClock = {
  now() {
    const seconds = BigInt(Math.floor(Date.now() / 1e3));
    const nanoseconds = (Date.now() % 1e3) * 1e6;
    return { seconds, nanoseconds };
  },

  resolution() {
    console.log(`[wall-clock] Wall clock resolution`);
  }
};

export {
  clocksMonotonicClock as monotonicClock,
  clocksTimezone as timezone,
  clocksWallClock as wallClock
}
