import { Todo } from "../../common/errors.js";
import type { Instant, Duration } from "../../../types/interfaces/wasi-clocks-system-clock.d.ts";

function now(): Instant {
  throw new Todo();
}

function getResolution(): Duration {
  throw new Todo();
}

export default {
  now,
  getResolution,
} satisfies typeof import("../../../types/interfaces/wasi-clocks-system-clock.d.ts");
export type * from "../../../types/interfaces/wasi-clocks-system-clock.d.ts";
