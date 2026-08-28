import { deprecatedNodeApi } from "./errors.js";

// Public signatures are adapted from the MIT-licensed @types/node 24.13.3
// assert.d.ts (https://unpkg.com/@types/node@24.13.3/assert.d.ts). This file
// intentionally does not copy Node's deprecated runtime implementation.

export interface CallTrackerCall {
  thisArg: object;
  arguments: unknown[];
}

export interface CallTrackerReportInformation {
  message: string;
  actual: number;
  expected: number;
  operator: string;
  stack: object;
}

/**
 * Compatibility stub for Node's deprecated assert.CallTracker API (DEP0173).
 * Deprecated APIs intentionally fail before performing any work.
 */
export class CallTracker {
  constructor() {
    throw deprecatedNodeApi("assert.CallTracker (DEP0173)");
  }

  calls(exact?: number): () => void;
  calls(fn: undefined, exact?: number): () => void;
  calls<This, Args extends unknown[], Result>(
    fn: (this: This, ...args: Args) => Result,
    exact?: number,
  ): (this: This, ...args: Args) => Result;
  calls(): never {
    throw deprecatedNodeApi("assert.CallTracker.calls() (DEP0173)");
  }

  getCalls<This, Args extends unknown[], Result>(
    _fn: (this: This, ...args: Args) => Result,
  ): CallTrackerCall[] {
    throw deprecatedNodeApi("assert.CallTracker.getCalls() (DEP0173)");
  }

  report(): CallTrackerReportInformation[] {
    throw deprecatedNodeApi("assert.CallTracker.report() (DEP0173)");
  }

  reset<This, Args extends unknown[], Result>(_fn?: (this: This, ...args: Args) => Result): void {
    throw deprecatedNodeApi("assert.CallTracker.reset() (DEP0173)");
  }

  verify(): void {
    throw deprecatedNodeApi("assert.CallTracker.verify() (DEP0173)");
  }
}
