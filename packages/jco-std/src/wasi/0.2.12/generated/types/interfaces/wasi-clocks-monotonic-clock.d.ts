/// <reference path="./wasi-io-poll.d.ts" />
declare module 'wasi:clocks/monotonic-clock@0.2.12' {
  /**
   * Read the current value of the clock.
   * 
   * The clock is monotonic, therefore calling this function repeatedly will
   * produce a sequence of non-decreasing values.
   * 
   * For completeness, this function traps if it's not possible to represent
   * the value of the clock in an `instant`. Consequently, implementations
   * should ensure that the starting time is low enough to avoid the
   * possibility of overflow in practice.
   *
   * @since 0.2.0
   */
  export function now(): Instant;
  /**
   * Query the resolution of the clock. Returns the duration of time
   * corresponding to a clock tick.
   *
   * @since 0.2.0
   */
  export function resolution(): Duration;
  /**
   * Create a `pollable` which will resolve once the specified instant
   * has occurred.
   *
   * @since 0.2.0
   */
  export function subscribeInstant(when: Instant): Pollable;
  /**
   * Create a `pollable` that will resolve after the specified duration has
   * elapsed from the time this function is invoked.
   *
   * @since 0.2.0
   */
  export function subscribeDuration(when: Duration): Pollable;
  /**
   * @since 0.2.0
   */
  export type Pollable = import('wasi:io/poll@0.2.12').Pollable;
  /**
   * An instant in time, in nanoseconds. An instant is relative to an
   * unspecified initial value, and can only be compared to instances from
   * the same monotonic-clock.
   *
   * @since 0.2.0
   */
  export type Instant = bigint;
  /**
   * A duration of time, in nanoseconds.
   *
   * @since 0.2.0
   */
  export type Duration = bigint;
}
