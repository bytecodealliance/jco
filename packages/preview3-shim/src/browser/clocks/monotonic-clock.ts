import { Todo } from "../../common/errors.js";
import type { Mark, Duration } from "../../../types/interfaces/wasi-clocks-monotonic-clock.d.ts";

function now(): Mark {
  throw new Todo();
}

function getResolution(): Duration {
  throw new Todo();
}

function waitUntil(when: Mark): Promise<void> {
  throw new Todo();
}

function waitFor(howLong: Duration): Promise<void> {
  throw new Todo();
}

export default {
  now,
  getResolution,
  waitUntil,
  waitFor,
} satisfies typeof import("../../../types/interfaces/wasi-clocks-monotonic-clock.d.ts");
export type * from "../../../types/interfaces/wasi-clocks-monotonic-clock.d.ts";
