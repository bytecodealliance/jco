import { monotonicClock } from "@bytecodealliance/preview2-shim/clocks";
import type { Mark, Duration } from "../../../types/interfaces/wasi-clocks-monotonic-clock.d.ts";

function now(): Mark {
  return monotonicClock.now();
}

function getResolution(): Duration {
  return monotonicClock.resolution();
}

async function waitUntil(when: Mark): Promise<void> {
  await monotonicClock.subscribeInstant(when).block();
}

async function waitFor(howLong: Duration): Promise<void> {
  await monotonicClock.subscribeDuration(howLong).block();
}

export default {
  now,
  getResolution,
  waitUntil,
  waitFor,
} satisfies typeof import("../../../types/interfaces/wasi-clocks-monotonic-clock.d.ts");
export type * from "../../../types/interfaces/wasi-clocks-monotonic-clock.d.ts";
