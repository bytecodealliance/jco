import { wallClock } from "@bytecodealliance/preview2-shim/clocks";
import type { Instant, Duration } from "../../../types/interfaces/wasi-clocks-system-clock.d.ts";

function now(): Instant {
  return wallClock.now();
}

function getResolution(): Duration {
  const resolution = wallClock.resolution();
  return resolution.seconds * 1_000_000_000n + BigInt(resolution.nanoseconds);
}

export default {
  now,
  getResolution,
} satisfies typeof import("../../../types/interfaces/wasi-clocks-system-clock.d.ts");
export type * from "../../../types/interfaces/wasi-clocks-system-clock.d.ts";
