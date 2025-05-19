/// <reference path="./wasi-io-poll.d.ts" />
declare module 'wasi:clocks/monotonic-clock@0.2.3' {
  export function now(): Instant;
  export function resolution(): Duration;
  export function subscribeInstant(when: Instant): Pollable;
  export function subscribeDuration(when: Duration): Pollable;
  export type Pollable = import('wasi:io/poll@0.2.3').Pollable;
  export type Instant = bigint;
  export type Duration = bigint;
}
