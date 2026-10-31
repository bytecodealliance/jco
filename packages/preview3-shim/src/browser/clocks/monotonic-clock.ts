import { monotonicClock } from "@bytecodealliance/preview2-shim/clocks";
import type { Mark, Duration } from "../../../types/interfaces/wasi-clocks-monotonic-clock.d.ts";

function now(): Mark {
  return monotonicClock.now();
}

function getResolution(): Duration {
  return monotonicClock.resolution();
}

function waitUntil(when: Mark): void | Promise<void> {
  const pollable = monotonicClock.subscribeInstant(when);
  if (!pollable.ready()) {
    return pollable.block();
  }
}

function waitFor(howLong: Duration): void | Promise<void> {
  const pollable = monotonicClock.subscribeDuration(howLong);
  if (!pollable.ready()) {
    return pollable.block();
  }
}

export default {
  now,
  getResolution,
  waitUntil,
  waitFor,
} satisfies typeof import("../../../types/interfaces/wasi-clocks-monotonic-clock.d.ts");
export type * from "../../../types/interfaces/wasi-clocks-monotonic-clock.d.ts";
