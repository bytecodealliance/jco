import { hrtime } from "node:process";

export function wallClockNow(clock) {
  if (clock === 1) {
    const seconds = BigInt(Math.floor(Date.now() / 1000));
    const nanoseconds = (Date.now() % 1000) * 1000 * 1000;
    return { seconds, nanoseconds };
  }
  console.log("[clocks] UNKNOWN CLOCK");
}

export function monotonicClockResolution(clock) {
  console.log(`[clocks] Monotonic clock resolution ${clock}`);
}

export function wallClockResolution(clock) {
  console.log(`[clocks] Wall clock resolution ${clock}`);
}

let hrStart = hrtime.bigint();

export function monotonicClockNow(clock) {
  if (clock === 0) {
    return hrtime.bigint() - hrStart;
  }
  console.log("[clocks] UNKNOWN CLOCK");
}
