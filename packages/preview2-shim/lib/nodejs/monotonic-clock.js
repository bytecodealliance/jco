import { hrtime } from "node:process";

export function resolution () {
  return 1n;
}

let _hrStart = hrtime.bigint();
export function now () {
  return hrtime.bigint() - _hrStart;
}

export function subscribe (_when, _absolute) {
  console.log(`[monotonic-clock] Subscribe`);
}
