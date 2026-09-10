/** Adapted from nodejs/node lib/internal/test_runner/test.js (TestContext,
 * SuiteContext, TestPlan, waitFor), v24.20.0,
 * 71b8b174857e25106d39b61a9e6f30d927da8b01, MIT (see LICENSE).
 * Local changes: typed component state, Web timers, no host file/worker lookup. */
import { createAssertions, type TestAssertions } from "./assert.js";
import { MockTracker } from "./mock.js";
import {
  failure,
  invalidArgType,
  milliseconds,
  validateFunction,
  validateObject,
  validateUint32,
  type TestFailure,
} from "./errors.js";
import type {
  HookFn,
  HookOptions,
  PlanOptions,
  TestFn,
  TestOptions,
  WaitForOptions,
} from "./types.js";

export type HookName = "before" | "after" | "beforeEach" | "afterEach";
export interface ContextState {
  name: string;
  fullName: string;
  signal: AbortSignal;
  passed: boolean;
  error: TestFailure | null;
  tags: readonly string[];
  plan: TestPlan | null;
  mock: MockTracker | null;
  runOnly: boolean;
  skipped?: boolean | string;
  todo?: boolean | string;
  add(
    name?: string | TestFn | TestOptions,
    options?: TestOptions | TestFn,
    fn?: TestFn,
  ): Promise<void>;
  hook(name: HookName, fn?: HookFn, options?: HookOptions): void;
  diagnostic(message: unknown): void;
  log(message: string, data?: unknown): void;
}
export class TestPlan {
  expected: number;
  actual = 0;
  readonly wait: boolean | number | undefined;
  #resolve?: () => void;
  #reject?: (error: unknown) => void;
  #timer?: ReturnType<typeof setTimeout>;
  constructor(count: number, options: PlanOptions = {}) {
    validateUint32(count, "count");
    validateObject(options, "options");
    const { wait } = options;
    if (typeof wait === "number") {
      milliseconds(wait, "options.wait");
    } else if (wait !== undefined && typeof wait !== "boolean") {
      throw invalidArgType("options.wait", ["boolean", "number"], wait);
    }
    this.expected = count;
    this.wait = wait;
  }
  count(): void {
    this.actual++;
    if (this.#resolve && this.actual >= this.expected) {
      if (this.actual === this.expected) {
        this.#resolve();
      } else {
        this.#reject?.(this.#error());
      }
      this.dispose();
    }
  }
  #error(): TestFailure {
    return failure(`plan expected ${this.expected} assertions but received ${this.actual}`);
  }
  check(): void | Promise<void> {
    if (this.actual === this.expected) {
      return;
    }
    if (this.actual > this.expected || this.wait === undefined || this.wait === false) {
      throw this.#error();
    }
    return new Promise<void>((resolve, reject): void => {
      this.#resolve = resolve;
      this.#reject = reject;
      if (typeof this.wait === "number") {
        this.#timer = setTimeout((): void => {
          reject(
            failure(
              `plan timed out after ${this.wait}ms with ${this.actual} assertions when expecting ${this.expected}`,
              "testTimeoutFailure",
            ),
          );
        }, this.wait);
      }
    });
  }
  dispose(): void {
    clearTimeout(this.#timer);
    this.#resolve = undefined;
    this.#reject = undefined;
  }
}

class TestContextImplementation {
  readonly #test: ContextState;
  #assert?: TestAssertions;
  constructor(test: ContextState) {
    this.#test = test;
  }
  get signal(): AbortSignal {
    return this.#test.signal;
  }
  get name(): string {
    return this.#test.name;
  }
  get filePath(): string | undefined {
    return undefined;
  }
  get fullName(): string {
    return this.#test.fullName;
  }
  get error(): TestFailure | null {
    return this.#test.error;
  }
  get passed(): boolean {
    return this.#test.passed;
  }
  get attempt(): number {
    return 0;
  }
  get tags(): readonly string[] {
    return this.#test.tags;
  }
  get workerId(): number | undefined {
    return undefined;
  }
  diagnostic(message: string): void {
    this.#test.diagnostic(message);
  }
  log(message: string, data?: unknown): void {
    this.#test.log(message, data);
  }
  plan(count: number, options?: PlanOptions): void {
    if (this.#test.plan !== null) {
      throw failure("cannot set plan more than once");
    }
    this.#test.plan = new TestPlan(count, options);
  }
  get assert(): TestAssertions {
    // Node captures the plan when the assertion object is first accessed.
    const plan = this.#test.plan;
    return (this.#assert ??= createAssertions(this, (): void => {
      plan?.count();
    }));
  }
  get mock(): MockTracker {
    return (this.#test.mock ??= new MockTracker());
  }
  runOnly(value: boolean): void {
    this.#test.runOnly = !!value;
  }
  skip(message?: string): void {
    this.#test.skipped = message ?? true;
  }
  todo(message?: string): void {
    this.#test.todo = message ?? true;
  }
  test(name?: string, fn?: TestFn): Promise<void>;
  test(name?: string, options?: TestOptions, fn?: TestFn): Promise<void>;
  test(options?: TestOptions, fn?: TestFn): Promise<void>;
  test(fn?: TestFn): Promise<void>;
  test(
    name?: string | TestOptions | TestFn,
    options?: TestOptions | TestFn,
    fn?: TestFn,
  ): Promise<void> {
    this.#test.plan?.count();
    return this.#test.add(name, options, fn);
  }
  before(fn?: HookFn, options?: HookOptions): void {
    this.#test.hook("before", fn, options);
  }
  after(fn?: HookFn, options?: HookOptions): void {
    this.#test.hook("after", fn, options);
  }
  beforeEach(fn?: HookFn, options?: HookOptions): void {
    this.#test.hook("beforeEach", fn, options);
  }
  afterEach(fn?: HookFn, options?: HookOptions): void {
    this.#test.hook("afterEach", fn, options);
  }
  waitFor<T>(condition: () => T | PromiseLike<T>, options: WaitForOptions = {}): Promise<T> {
    validateFunction(condition, "condition");
    validateObject(options, "options");
    const { interval = 50, timeout = 1000 } = options;
    milliseconds(interval, "options.interval");
    milliseconds(timeout, "options.timeout");
    return new Promise<T>((resolve, reject): void => {
      const noError = Symbol();
      let cause: unknown = noError;
      let poller: ReturnType<typeof setTimeout> | undefined;
      let ended = false;
      const timer = setTimeout((): void => {
        ended = true;
        clearTimeout(poller);
        const error = new Error("waitFor() timed out");
        if (cause !== noError) {
          error.cause = cause;
        }
        reject(error);
      }, timeout);
      const poll = async (): Promise<void> => {
        try {
          const result = await condition();
          if (ended) {
            return;
          }
          ended = true;
          clearTimeout(timer);
          resolve(result);
        } catch (error) {
          if (ended) {
            return;
          }
          cause = error;
          poller = setTimeout(poll, interval);
        }
      };
      void poll();
    });
  }
}
// TypeScript does not narrow assertion calls through class getters (TS2775).
// The public interface declares assert as a readonly property, as @types/node
// does, while the implementation retains Node's lazy prototype getter.
export interface TestContext extends Omit<TestContextImplementation, "assert"> {
  readonly assert: TestAssertions;
}
Object.defineProperty(TestContextImplementation, "name", {
  value: "TestContext",
  configurable: true,
});
export const TestContext: {
  new (state: ContextState): TestContext;
  readonly prototype: TestContext;
} = TestContextImplementation;

// Keep the public suite context prototype separate from the test context.
export class SuiteContext {
  readonly #suite: ContextState;
  constructor(suite: ContextState) {
    this.#suite = suite;
  }
  get signal(): AbortSignal {
    return this.#suite.signal;
  }
  get name(): string {
    return this.#suite.name;
  }
  get filePath(): string | undefined {
    return undefined;
  }
  get fullName(): string {
    return this.#suite.fullName;
  }
  get passed(): boolean {
    return this.#suite.passed;
  }
  get attempt(): number {
    return 0;
  }
  diagnostic(message: string): void {
    this.#suite.diagnostic(message);
  }
  log(message: string, data?: unknown): void {
    this.#suite.log(message, data);
  }
}
