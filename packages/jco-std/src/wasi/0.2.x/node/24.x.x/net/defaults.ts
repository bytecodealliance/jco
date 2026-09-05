/** Module-local defaults from nodejs/node v24.19.0 `lib/net.js`, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae (MIT license). Native flags become local state. */

import { invalidArgType, outOfRange } from "./errors.js";

let autoSelectFamily = true;
let autoSelectFamilyAttemptTimeout = 250;

export function getDefaultAutoSelectFamily(): boolean {
  return autoSelectFamily;
}

export function setDefaultAutoSelectFamily(value: boolean): void {
  if (typeof value !== "boolean") {
    throw invalidArgType("value", "boolean", value);
  }
  autoSelectFamily = value;
}

export function getDefaultAutoSelectFamilyAttemptTimeout(): number {
  return autoSelectFamilyAttemptTimeout;
}

export function setDefaultAutoSelectFamilyAttemptTimeout(value: number): void {
  if (typeof value !== "number") {
    throw invalidArgType("value", "number", value);
  }
  if (!Number.isInteger(value) || value < 1 || value > 0x7fff_ffff) {
    throw outOfRange("value", "an integer >= 1 and <= 2147483647", value);
  }
  autoSelectFamilyAttemptTimeout = Math.max(value, 10);
}
