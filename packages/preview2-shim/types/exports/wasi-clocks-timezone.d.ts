export namespace WasiClocksTimezone {
  /**
   * Return information needed to display the given `datetime`. This includes
   * the UTC offset, the time zone name, and a flag indicating whether
   * daylight saving time is active.
   * 
   * If the timezone cannot be determined for the given `datetime`, return a
   * `timezone-display` for `UTC` with a `utc-offset` of 0 and no daylight
   * saving time.
   */
  export function display(this: Timezone, when: Datetime): TimezoneDisplay;
  /**
   * The same as `display`, but only return the UTC offset.
   */
  export function utcOffset(this: Timezone, when: Datetime): number;
  /**
   * Dispose of the specified input-stream, after which it may no longer
   * be used.
   */
  export function dropTimezone(this: Timezone): void;
}
import type { Datetime } from '../exports/wasi-clocks-wall-clock';
export { Datetime };
/**
 * A timezone.
 * 
 * In timezones that recognize daylight saving time, also known as daylight
 * time and summer time, the information returned from the functions varies
 * over time to reflect these adjustments.
 * 
 * This [represents a resource](https://github.com/WebAssembly/WASI/blob/main/docs/WitInWasi.md#Resources).
 */
export type Timezone = number;
/**
 * Information useful for displaying the timezone of a specific `datetime`.
 * 
 * This information may vary within a single `timezone` to reflect daylight
 * saving time adjustments.
 */
export interface TimezoneDisplay {
  /**
   * The number of seconds difference between UTC time and the local
   * time of the timezone.
   * 
   * The returned value will always be less than 86400 which is the
   * number of seconds in a day (24*60*60).
   * 
   * In implementations that do not expose an actual time zone, this
   * should return 0.
   */
  utcOffset: number,
  /**
   * The abbreviated name of the timezone to display to a user. The name
   * `UTC` indicates Coordinated Universal Time. Otherwise, this should
   * reference local standards for the name of the time zone.
   * 
   * In implementations that do not expose an actual time zone, this
   * should be the string `UTC`.
   * 
   * In time zones that do not have an applicable name, a formatted
   * representation of the UTC offset may be returned, such as `-04:00`.
   */
  name: string,
  /**
   * Whether daylight saving time is active.
   * 
   * In implementations that do not expose an actual time zone, this
   * should return false.
   */
  inDaylightSavingTime: boolean,
}
