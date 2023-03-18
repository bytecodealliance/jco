export namespace Timezone {
  export function display(this: Timezone, when: Datetime): TimezoneDisplay;
  export function utcOffset(this: Timezone, when: Datetime): number;
  export function dropTimezone(this: Timezone): void;
}
export type Timezone = number;
export type Datetime = Datetime;
export interface TimezoneDisplay {
  utcOffset: number,
  name: string,
  inDaylightSavingTime: boolean,
}
