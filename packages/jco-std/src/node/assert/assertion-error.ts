// Adapted from Node.js lib/internal/assert/assertion_error.js at v24.19.0, commit
// cdc1b38d40cb567b7ad0b39c86addf830a0af0ae:
// https://github.com/nodejs/node/blob/cdc1b38d40cb567b7ad0b39c86addf830a0af0ae/lib/internal/assert/assertion_error.js
// Node.js is MIT licensed (https://github.com/nodejs/node/blob/v24.19.0/LICENSE).
// Formatting is made component-portable and does not depend on node:util or TTY
// state; the public error contract is converted to TypeScript.
// Public signatures are adapted from the MIT-licensed @types/node 24.13.3
// assert.d.ts (https://unpkg.com/@types/node@24.13.3/assert.d.ts).

import { inspect } from "./inspect.js";
import { validateObject } from "./errors.js";

export interface AssertionErrorOptions {
  message?: string;
  actual?: unknown;
  expected?: unknown;
  operator?: string;
  stackStartFn?: (...args: never[]) => unknown;
  diff?: "simple" | "full";
}

const readableOperator: Record<string, string> = {
  deepStrictEqual: "Expected values to be strictly deep-equal:",
  partialDeepStrictEqual: "Expected values to be partially and strictly deep-equal:",
  strictEqual: "Expected values to be strictly equal:",
  deepEqual: "Expected values to be loosely deep-equal:",
  notDeepStrictEqual: 'Expected "actual" not to be strictly deep-equal to:',
  notStrictEqual: 'Expected "actual" to be strictly unequal to:',
  notDeepEqual: 'Expected "actual" not to be loosely deep-equal to:',
};

function generatedMessage(
  actual: unknown,
  expected: unknown,
  operator: string,
  diff: "simple" | "full",
): string {
  const left = inspect(actual);
  const right = inspect(expected);
  const heading = readableOperator[operator];
  if (
    operator === "strictEqual" ||
    operator === "deepStrictEqual" ||
    operator === "partialDeepStrictEqual"
  ) {
    if (left.length + right.length <= 12 && !left.includes("\n") && !right.includes("\n")) {
      return `${left} !== ${right}`;
    }
    return `${heading}\n\n+ actual - expected\n\n+ ${left}\n- ${right}\n`;
  }
  if (operator === "notStrictEqual" || operator === "notDeepStrictEqual") {
    return `${heading}${left.length > 5 ? "\n\n" : " "}${diff === "full" ? left : left.slice(0, 512)}`;
  }
  if (operator === "deepEqual") {
    return `${heading}\n\n${left}\n\nshould loosely deep-equal\n\n${right}`;
  }
  if (operator === "notDeepEqual") {
    return `${heading}\n\n${diff === "full" ? left : left.slice(0, 1024)}`;
  }
  return `${left} ${operator} ${right}`;
}

export class AssertionError extends Error {
  declare actual: unknown;
  declare expected: unknown;
  declare operator: string;
  declare generatedMessage: boolean;
  declare code: "ERR_ASSERTION";
  declare diff: "simple" | "full";

  constructor(options: AssertionErrorOptions) {
    const candidate: unknown = options;
    validateObject(candidate, "options");
    const { actual, expected, operator = "fail", diff = "simple" } = options;
    const explicit = options.message !== undefined && options.message !== null;
    const message = explicit
      ? String(options.message)
      : generatedMessage(actual, expected, operator, diff);
    super(message);
    this.generatedMessage = !options.message;
    Object.defineProperty(this, "name", {
      value: "AssertionError [ERR_ASSERTION]",
      enumerable: false,
      writable: true,
      configurable: true,
    });
    this.code = "ERR_ASSERTION";
    this.actual = actual;
    this.expected = expected;
    this.operator = operator;
    const captureStackTrace = (
      Error as ErrorConstructor & {
        captureStackTrace?: (target: object, constructor?: (...args: never[]) => unknown) => void;
      }
    ).captureStackTrace;
    captureStackTrace?.(this, options.stackStartFn);
    // Materialize V8's lazy stack while the coded name is installed, matching
    // Node's stack header, then restore the public `name` field.
    void this.stack;
    this.name = "AssertionError";
    this.diff = diff;
  }

  override toString(): string {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}
