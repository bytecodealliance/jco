// wasi:clocks/timezone@0.2.2 interface

/**
 * @typedef {{
 *    utcOffset: number,
 *    name: string,
 *    inDaylightSavingTime: boolean,
 * }} TimezoneDisplay
 */

/**
 * @param {Datetime} _when
 * @returns {TimezoneDisplay}
 */
export const display = (_when) => {
  throw 'unimplemented';
};

/**
 * @param {Datetime} _when
 * @returns {number}
 */
export const utcOffset = (_when) => {
  throw 'unimplemented';
};
