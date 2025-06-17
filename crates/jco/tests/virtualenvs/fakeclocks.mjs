import "./base.mjs";
import {
  monotonicClock,
  wallClock,
} from "@bytecodealliance/preview2-shim/clocks";

let now = 0n;

monotonicClock.resolution = () => 1_000_000_000n;
monotonicClock.now = () => {
  const then = now;
  now += 42n * 1_000_000_000n;
  return now;
};

wallClock.resolution = () => 1_000_000_000n;
wallClock.now = () => ({ seconds: 1431648000n, nanoseconds: 100 });
