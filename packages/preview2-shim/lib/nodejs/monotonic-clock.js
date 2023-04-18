import { hrtime } from "node:process";

export function resolution() {
  console.log(`[monotonic-clock] Monotonic clock resolution`);
}

let hrStart = hrtime.bigint();
export function now() {
  return hrtime.bigint() - hrStart;
}

export function subscribe (_when, _absolute) {
  console.log(`[monotonic-clock] Subscribe`);
}
