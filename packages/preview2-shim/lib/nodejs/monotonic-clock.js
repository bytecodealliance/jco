import { hrtime } from "node:process";

export function resolution(clock) {
  console.log(`[clocks] Monotonic clock resolution ${clock}`);
}

let hrStart = hrtime.bigint();

export function now(clock) {
  if (clock === 0) {
    return hrtime.bigint() - hrStart;
  }
  console.log("[clocks] UNKNOWN CLOCK");
}
