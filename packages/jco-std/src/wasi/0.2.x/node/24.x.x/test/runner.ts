/**
 * Component scheduler adapted from nodejs/node lib/internal/test_runner/
 * {harness,test,tag_filter}.js at v24.20.0,
 * 71b8b174857e25106d39b61a9e6f30d927da8b01, MIT (see LICENSE).
 * Keeps Node argument normalization, hook phases, test-failure resolution,
 * expected failures and scoped contexts. Replaces process/AsyncResource bootstrap
 * with a serial microtask queue. No implicit context propagation across await,
 * file discovery, process exit handlers, or engine instrumentation is claimed.
 */
import { AbortController } from "../abort-globals.js";
import { isPromiseLike as thenable, validateAbortSignal } from "../stream/shared.js";
import nodeAssert, { type AssertPredicate } from "../assert/index.js";
import { assert, snapshot } from "./assert.js";
import {
  TestContext,
  SuiteContext,
  TestPlan,
  type ContextState,
  type HookName,
} from "./context.js";
import { MockTracker } from "./mock.js";
import {
  failure,
  invalidArgType,
  invalidArgValue,
  milliseconds,
  unsupported,
  validateFunction,
  validateObject,
  validateUint32,
  type TestFailure,
} from "./errors.js";
import type {
  Done,
  ExpectFailure,
  Hook,
  HookFn,
  HookOptions,
  RunOptions,
  SuiteFn,
  TestEvent,
  TestFn,
  TestFunction,
  TestModule,
  TestOptions,
  TestResult,
  TestsStream,
} from "./types.js";

type Body = TestFn | SuiteFn;
type Arguments = [name?: string | TestOptions | Body, options?: TestOptions | Body, fn?: Body];
interface HookRecord {
  fn: HookFn;
  options: HookOptions;
}
export interface HarnessOptions {
  report?: (event: TestEvent) => void;
  only?: boolean;
}
export interface TestHarness {
  module: TestModule;
  drain(): Promise<void>;
}
function normalize(
  [name, options, fn]: Arguments,
  overrides: TestOptions,
): { name: string; fn: Body; options: TestOptions } {
  if (typeof name === "function") {
    fn = name;
  } else if (name !== null && typeof name === "object") {
    fn = typeof options === "function" ? options : undefined;
    options = name;
  } else if (typeof options === "function") {
    fn = options;
  }
  if (options === null || typeof options !== "object") {
    options = {};
  }
  if (typeof fn !== "function") {
    fn = (): void => {};
  }
  return {
    name: typeof name === "string" && name !== "" ? name : fn.name || "<anonymous>",
    fn,
    options: { ...options, ...overrides },
  };
}
function tags(value: unknown, inherited: readonly string[]): readonly string[] {
  if (value === undefined) {
    return inherited;
  }
  if (!Array.isArray(value)) {
    throw invalidArgType("options.tags", "Array", value);
  }
  const result = new Set(inherited);
  for (let i = 0; i < value.length; i++) {
    const tag: unknown = value[i];
    if (typeof tag !== "string") {
      throw invalidArgType(`options.tags[${i}]`, "string", tag);
    }
    if (tag.length === 0) {
      throw invalidArgValue(`options.tags[${i}]`, tag, "must not be empty");
    }
    result.add(tag.toLowerCase());
  }
  return Object.freeze([...result]);
}
function isFailure(error: unknown): error is TestFailure {
  return error instanceof Error && "code" in error && error.code === "ERR_TEST_FAILURE";
}
function expectFailure(
  value: ExpectFailure | undefined,
): { label?: string; match?: AssertPredicate } | undefined {
  if (value === undefined || value === false) {
    return undefined;
  }
  if (typeof value === "string") {
    return { label: value };
  }
  if (typeof value === "function" || value instanceof RegExp) {
    return { match: value };
  }
  if (typeof value !== "object") {
    return {};
  }
  if (value === null || Object.keys(value).length === 0) {
    throw invalidArgValue("options.expectFailure", value, "must not be an empty object");
  }
  if ("label" in value || "match" in value) {
    return value as { label?: string; match?: AssertPredicate };
  }
  return { match: value };
}

export function createTestHarness(options: HarnessOptions = {}): TestHarness {
  let current: TestNode | undefined;
  let currentContext: TestContext | SuiteContext | undefined;
  let asyncBodies = 0;
  let drainPromise: Promise<void> | undefined;
  let rootBefore = false;
  let rootBeforeError: TestFailure | undefined;
  let rootAfter = false;
  const pending: TestNode[] = [];
  const rootHooks: Record<HookName, HookRecord[]> = {
    before: [],
    after: [],
    beforeEach: [],
    afterEach: [],
  };
  const report = options.report ?? ((): void => {});
  const globalMock = new MockTracker();
  const counts = {
    tests: 0,
    passed: 0,
    failed: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0,
    suites: 0,
    topLevel: 0,
  };
  let globalNumber = 0;
  const start = Date.now();

  function scope<T>(
    node: TestNode | undefined,
    context: TestContext | SuiteContext | undefined,
    fn: () => T,
  ): T {
    const previous = current;
    const previousContext = currentContext;
    current = node;
    currentContext = context;
    try {
      return fn();
    } finally {
      current = previous;
      currentContext = previousContext;
    }
  }
  function registrationParent(): TestNode | undefined {
    if (!current && asyncBodies) {
      unsupported(
        "implicit test context",
        "use t.test() and t hooks after await; the engine cannot propagate async context",
      );
    }
    return current;
  }
  function registerHook(target: HookRecord[], fn?: HookFn, hookOptions: HookOptions = {}): void {
    if (fn === undefined) {
      fn = (): void => {};
    }
    validateFunction(fn, "fn");
    validateObject(hookOptions, "options");
    validateAbortSignal(hookOptions.signal);
    if (hookOptions.timeout !== undefined && hookOptions.timeout !== Infinity) {
      milliseconds(hookOptions.timeout, "options.timeout");
    }
    target.push({ fn, options: hookOptions });
  }
  async function invoke(
    node: TestNode,
    context: TestContext,
    fn: HookFn | TestFn,
    hookOptions?: HookOptions,
    cleanup = false,
  ): Promise<void> {
    let callbackResolve!: () => void;
    let callbackReject!: (reason: unknown) => void;
    let calls = 0;
    const callback = new Promise<void>((resolve, reject): void => {
      callbackResolve = resolve;
      callbackReject = reject;
    });
    // Always observe callback rejections, including a callback + promise conflict.
    void callback.catch((): void => {});
    const done: Done = (error?: unknown): void => {
      if (++calls > 1) {
        node.fail(failure("callback invoked multiple times", "multipleCallbackInvocations"));
        return;
      }
      if (error) {
        callbackReject(error);
      } else {
        callbackResolve();
      }
    };
    const result = scope(node, context, (): unknown =>
      Reflect.apply(fn, context, fn.length === 2 ? [context, done] : [context]),
    );
    let promise: Promise<unknown>;
    if (fn.length === 2) {
      if (thenable(result)) {
        void Promise.resolve(result).catch((): void => {});
        throw failure("passed a callback but also returned a Promise", "callbackAndPromisePresent");
      }
      promise = callback;
    } else {
      promise = Promise.resolve(result);
    }
    asyncBodies++;
    try {
      await node.interruptible(promise, hookOptions, cleanup);
    } finally {
      asyncBodies--;
    }
  }
  async function hooks(
    node: TestNode,
    records: readonly HookRecord[],
    cleanup = false,
  ): Promise<void> {
    for (const hook of records) {
      try {
        await invoke(node, node.context, hook.fn, hook.options, cleanup);
      } catch (error) {
        throw failure(error, "hookFailed");
      }
    }
  }

  class TestNode implements ContextState {
    readonly name: string;
    readonly fullName: string;
    readonly parent?: TestNode;
    readonly suite: boolean;
    readonly body: Body;
    readonly config: TestOptions;
    readonly controller = new AbortController();
    readonly signal = this.controller.signal;
    readonly context: TestContext;
    readonly suiteContext: SuiteContext;
    readonly children: TestNode[] = [];
    readonly hooks: Record<HookName, HookRecord[]> = {
      before: [],
      after: [],
      beforeEach: [],
      afterEach: [],
    };
    readonly tags: readonly string[];
    readonly expected?: { label?: string; match?: AssertPredicate };
    readonly number: number;
    readonly nesting: number;
    readonly done: Promise<void>;
    readonly diagnostics: TestEvent[] = [];
    #resolve!: () => void;
    #childrenTail: Promise<void> = Promise.resolve();
    #beforePromise?: Promise<void>;
    #outerAbort?: () => void;
    #deadline?: number;
    running = false;
    finished = false;
    passed = false;
    error: TestFailure | null = null;
    plan: TestPlan | null = null;
    mock: MockTracker | null = null;
    runOnly = false;
    skipped?: boolean | string;
    todo?: boolean | string;
    constructor(args: Arguments, isSuite: boolean, overrides: TestOptions = {}, parent?: TestNode) {
      const parsed = normalize(args, overrides);
      this.config = parsed.options;
      this.name = parsed.name;
      this.body = parsed.fn;
      this.suite = isSuite;
      this.parent = parent;
      this.fullName = parent ? `${parent.fullName} > ${this.name}` : this.name;
      this.nesting = parent ? parent.nesting + 1 : 0;
      this.number = parent ? parent.children.length + 1 : ++globalNumber;
      const { concurrency, timeout, signal, skip, todo, plan } = this.config;
      if (concurrency != null) {
        if (typeof concurrency === "number") {
          validateUint32(concurrency, "options.concurrency", true);
        } else if (typeof concurrency !== "boolean") {
          throw invalidArgType("options.concurrency", ["boolean", "number"], concurrency);
        }
        if (concurrency === true || (typeof concurrency === "number" && concurrency > 1)) {
          unsupported(
            "options.concurrency",
            "concurrent tests require engine async-context support",
          );
        }
      }
      if (timeout != null && timeout !== Infinity) {
        milliseconds(timeout, "options.timeout");
      }
      validateAbortSignal(signal);
      this.tags = tags(this.config.tags, parent?.tags ?? Object.freeze([]));
      this.expected = expectFailure(this.config.expectFailure) ?? parent?.expected;
      this.skipped = skip !== undefined && skip !== false ? skip : undefined;
      this.todo = todo !== undefined && todo !== false ? todo : parent?.todo;
      if (options.only && !this.config.only && (parent?.runOnly || !parent)) {
        this.skipped = "'only' option not set";
      }
      if (!options.only && (this.config.only || parent?.runOnly)) {
        this.diagnostic("'only' and 'runOnly' require the --test-only command-line option.");
      }
      if (plan !== undefined) {
        this.plan = new TestPlan(plan);
      }
      this.context = new TestContext(this);
      this.suiteContext = new SuiteContext(this);
      this.done = new Promise<void>((resolve): void => {
        this.#resolve = resolve;
      });
      if (signal) {
        this.#outerAbort = (): void => {
          this.controller.abort(signal.reason);
        };
        if (signal.aborted) {
          this.#outerAbort();
        } else {
          signal.addEventListener("abort", this.#outerAbort, { once: true });
        }
      }
      report({ type: "test:enqueue", data: this.location() });
    }
    location(): { name: string; nesting: number } {
      return { name: this.name, nesting: this.nesting };
    }
    build(): void {
      if (!this.suite || this.skipped !== undefined) {
        return;
      }
      try {
        const result = scope(this, this.suiteContext, (): unknown =>
          Reflect.apply(this.body, this.suiteContext, [this.suiteContext]),
        );
        if (thenable(result)) {
          void Promise.resolve(result).catch((): void => {});
          unsupported(
            "async suite callback",
            "declare suites synchronously and use async test bodies with explicit contexts",
          );
        }
      } catch (error) {
        this.fail(failure(error));
      }
    }
    add(
      name?: string | TestOptions | TestFn,
      options?: TestOptions | TestFn,
      fn?: TestFn,
    ): Promise<void> {
      return add([name, options, fn], false, {}, this);
    }
    hook(name: HookName, fn?: HookFn, options?: HookOptions): void {
      if (this.finished) {
        throw failure(
          "test could not be started because its parent finished",
          "parentAlreadyFinished",
        );
      }
      registerHook(this.hooks[name], fn, options);
      if (name === "before" && this.running) {
        const record = this.hooks.before.at(-1)!;
        const running = hooks(this, [record]);
        const prior = this.#beforePromise;
        this.#beforePromise = prior ? Promise.all([prior, running]).then((): void => {}) : running;
        void this.#beforePromise.catch((error: unknown): void => {
          this.fail(isFailure(error) ? error : failure(error));
        });
      }
    }
    diagnostic(message: unknown): void {
      this.diagnostics.push({
        type: "test:diagnostic",
        data: { nesting: this.nesting, message: String(message) },
      });
    }
    log(message: string, data?: unknown): void {
      if (typeof message !== "string") {
        throw invalidArgType("message", "string", message);
      }
      this.diagnostics.push({ type: "test:log", data: { nesting: this.nesting, message, data } });
    }
    fail(error: TestFailure): void {
      if (this.error) {
        return;
      }
      this.error = error;
      this.passed = false;
      if (this.expected) {
        if (this.expected.match !== undefined) {
          try {
            nodeAssert.throws((): never => {
              throw error.cause ?? error;
            }, this.expected.match);
          } catch (cause) {
            this.error = failure(
              "The test failed, but the error did not match the expected validation",
            );
            this.error.cause = cause;
            return;
          }
        }
        this.passed = true;
      }
    }
    before(): Promise<void> {
      return (this.#beforePromise ??= hooks(this, this.hooks.before));
    }
    queue(child: TestNode): void {
      this.#childrenTail = this.#childrenTail.then(async (): Promise<void> => {
        if (!this.running || this.finished || this.signal.aborted) {
          child.fail(
            failure("test did not finish before its parent and was cancelled", "cancelledByParent"),
          );
        } else {
          try {
            await this.before();
          } catch (error) {
            child.fail(isFailure(error) ? error : failure(error));
          }
        }
        await child.execute();
      });
    }
    async interruptible<T>(
      promise: Promise<T>,
      hookOptions?: HookOptions,
      cleanup = false,
    ): Promise<T> {
      const signal = hookOptions?.signal ?? (cleanup ? new AbortController().signal : this.signal);
      const timeout = hookOptions?.timeout;
      const remaining =
        timeout ??
        (cleanup || this.#deadline === undefined
          ? undefined
          : Math.max(0, this.#deadline - Date.now()));
      if (signal.aborted) {
        throw failure(signal.reason ?? "The operation was aborted", "testAborted");
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      let abort!: () => void;
      const stop = new Promise<never>((_resolve, reject): void => {
        abort = (): void => {
          reject(failure(signal.reason ?? "The operation was aborted", "testAborted"));
        };
        signal.addEventListener("abort", abort, { once: true });
        if (remaining !== undefined && remaining !== Infinity) {
          timer = setTimeout((): void => {
            reject(
              failure(
                `test timed out after ${timeout ?? this.config.timeout ?? this.parent?.config.timeout}ms`,
                "testTimeoutFailure",
              ),
            );
          }, remaining);
        }
      });
      try {
        return await Promise.race([promise, stop]);
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
      }
    }
    async execute(): Promise<void> {
      if (this.running || this.finished) {
        return this.done;
      }
      this.running = true;
      const started = Date.now();
      const timeout = this.config.timeout ?? this.parent?.config.timeout;
      if (timeout !== undefined && timeout !== Infinity) {
        this.#deadline = started + timeout;
      }
      report({ type: "test:dequeue", data: this.location() });
      report({ type: "test:start", data: this.location() });
      const ancestors: TestNode[] = [];
      for (let parent = this.parent; parent; parent = parent.parent) {
        ancestors.unshift(parent);
      }
      let runAfterEach = false;
      try {
        if (this.signal.aborted) {
          throw failure(this.signal.reason ?? "The operation was aborted", "testAborted");
        }
        if (!this.error && this.skipped === undefined) {
          if (!this.suite) {
            runAfterEach = true;
            await hooks(this, rootHooks.beforeEach);
            for (const ancestor of ancestors) {
              await hooks(this, ancestor.hooks.beforeEach);
            }
            await invoke(this, this.context, this.body as TestFn);
          } else {
            await this.before();
            for (const child of this.children) {
              this.queue(child);
            }
          }
          await this.interruptible(this.#childrenTail);
          await this.#beforePromise;
          await this.interruptible(Promise.resolve(this.plan?.check()));
          const failed = this.children.filter(
            (child) => !child.passed && child.todo === undefined,
          ).length;
          if (failed) {
            throw failure(`${failed} subtest${failed === 1 ? "" : "s"} failed`, "subtestsFailed");
          }
        }
        if (!this.error) {
          if (this.expected && this.skipped === undefined) {
            this.fail(failure("test was expected to fail but passed", "expectedFailure"));
            this.passed = false;
          } else {
            this.passed = true;
          }
        }
      } catch (error) {
        this.fail(isFailure(error) ? error : failure(error));
      } finally {
        // Context.passed/error are available to cleanup hooks, before mock reset.
        if (runAfterEach) {
          for (const ancestor of ancestors.reverse()) {
            try {
              await hooks(this, ancestor.hooks.afterEach, true);
            } catch (error) {
              this.fail(isFailure(error) ? error : failure(error));
            }
          }
          try {
            await hooks(this, rootHooks.afterEach, true);
          } catch (error) {
            this.fail(isFailure(error) ? error : failure(error));
          }
        }
        try {
          await hooks(this, this.hooks.after, true);
        } catch (error) {
          this.fail(isFailure(error) ? error : failure(error));
        }
        this.finished = true;
        this.controller.abort();
        for (const child of this.children) {
          if (!child.finished) {
            child.controller.abort();
          }
        }
        // A failed suite still reports every declared child as cancelled.
        for (const child of this.children) {
          if (!child.running) {
            child.fail(
              failure(
                "test did not finish before its parent and was cancelled",
                "cancelledByParent",
              ),
            );
            await child.execute();
          }
        }
        await this.#childrenTail;
        this.mock?.reset();
        this.plan?.dispose();
        if (this.#outerAbort) {
          this.config.signal?.removeEventListener("abort", this.#outerAbort);
        }
        if (this.children.length) {
          report({
            type: "test:plan",
            data: { nesting: this.nesting + 1, count: this.children.length },
          });
        }
        const result: TestResult = {
          ...this.location(),
          testNumber: this.number,
          details: { duration_ms: Date.now() - started, type: this.suite ? "suite" : "test" },
          tags: this.tags,
        };
        if (this.error) {
          result.details.error = this.error;
        }
        if (this.skipped !== undefined) {
          result.skip = this.skipped;
        }
        if (this.todo !== undefined) {
          result.todo = this.todo;
        }
        if (this.expected) {
          result.expectFailure = this.expected.label ?? true;
        }
        if (this.suite) {
          counts.suites++;
        } else {
          counts.tests++;
        }
        if (!this.parent) {
          counts.topLevel++;
        }
        if (this.skipped !== undefined) {
          counts.skipped++;
        } else if (this.todo !== undefined) {
          counts.todo++;
        } else if (this.passed) {
          counts.passed++;
        } else {
          counts.failed++;
          if (
            ["testAborted", "cancelledByParent", "testTimeoutFailure"].includes(
              this.error?.failureType ?? "",
            )
          ) {
            counts.cancelled++;
          }
        }
        report({ type: "test:complete", data: result });
        report({ type: this.passed ? "test:pass" : "test:fail", data: result });
        for (const diagnostic of this.diagnostics) {
          report(diagnostic);
        }
        this.#resolve();
      }
    }
  }
  function add(
    args: Arguments,
    suite: boolean,
    overrides: TestOptions = {},
    parent = registrationParent(),
  ): Promise<void> {
    if (typeof AbortController !== "function") {
      unsupported(
        "test()",
        "this engine does not provide AbortController; mocks and reporters remain available",
      );
    }
    const node = new TestNode(args, suite, overrides, parent);
    if (parent) {
      parent.children.push(node);
      if (parent.finished || (parent.suite && parent.running)) {
        node.fail(
          failure("test could not be started because its parent finished", "parentAlreadyFinished"),
        );
      }
    }
    node.build();
    if (parent?.suite && !parent.running) {
      return Promise.resolve();
    }
    if (parent) {
      parent.queue(node);
    } else {
      pending.push(node);
      schedule();
    }
    return suite ? Promise.resolve() : node.done;
  }
  async function drain(): Promise<void> {
    while (pending.length) {
      const node = pending.shift()!;
      if (!rootBefore) {
        rootBefore = true;
        try {
          await hooks(node, rootHooks.before);
        } catch (error) {
          rootBeforeError = isFailure(error) ? error : failure(error);
        }
      }
      if (rootBeforeError) {
        node.fail(rootBeforeError);
      }
      await node.execute();
      // Let awaiting callers append their next test before considering the batch drained.
      await Promise.resolve();
      if (!pending.length && !rootAfter) {
        rootAfter = true;
        try {
          await hooks(node, rootHooks.after, true);
        } catch (error) {
          counts.failed++;
          report({
            type: "test:fail",
            data: {
              name: "after",
              nesting: 0,
              testNumber: ++globalNumber,
              details: {
                type: "test",
                duration_ms: 0,
                error: isFailure(error) ? error : failure(error),
              },
            },
          });
        }
      }
    }
    report({ type: "test:plan", data: { nesting: 0, count: globalNumber } });
    report({
      type: "test:summary",
      data: {
        success: counts.failed === 0,
        counts: { ...counts },
        duration_ms: Date.now() - start,
      },
    });
  }
  function schedule(): void {
    if (!drainPromise) {
      drainPromise = Promise.resolve()
        .then(drain)
        .finally((): void => {
          drainPromise = undefined;
          if (pending.length) {
            schedule();
          }
        });
    }
  }
  function callable<F extends Body>(isSuite: boolean): TestFunction<F> {
    const test = function (
      name?: string | TestOptions | Body,
      options?: TestOptions | Body,
      fn?: Body,
    ): Promise<void> {
      return add([name, options, fn], isSuite);
    };
    Object.defineProperty(test, "name", { value: "test", configurable: true });
    return Object.assign(test, {
      expectFailure: (...args: Arguments): Promise<void> =>
        add(args, isSuite, { expectFailure: true }),
      skip: (...args: Arguments): Promise<void> => add(args, isSuite, { skip: true }),
      todo: (...args: Arguments): Promise<void> => add(args, isSuite, { todo: true }),
      only: (...args: Arguments): Promise<void> => add(args, isSuite, { only: true }),
    });
  }
  function hook(name: HookName): Hook {
    return (fn?: HookFn, options?: HookOptions): void => {
      const parent = registrationParent();
      if (parent) {
        parent.hook(name, fn, options);
      } else {
        registerHook(rootHooks[name], fn, options);
      }
    };
  }
  const test = callable<TestFn>(false);
  const suite = callable<SuiteFn>(true);
  const module = Object.assign(test, {
    after: hook("after"),
    afterEach: hook("afterEach"),
    before: hook("before"),
    beforeEach: hook("beforeEach"),
    describe: suite,
    getTestContext: (): TestContext | SuiteContext | undefined => currentContext,
    it: test,
    run: (_options?: RunOptions): TestsStream =>
      unsupported(
        "run()",
        "test file discovery, runtime imports, process isolation and coverage require a Node runtime",
      ),
    suite,
    test,
  });
  Object.defineProperties(module, {
    mock: { configurable: true, enumerable: true, get: (): MockTracker => globalMock },
    snapshot: { configurable: true, enumerable: true, get: (): typeof snapshot => snapshot },
    assert: { configurable: true, enumerable: true, get: (): typeof assert => assert },
  });
  // Object.assign and defineProperties establish all aliases and getter namespaces.
  return {
    module: module as TestModule,
    drain: async (): Promise<void> => {
      do {
        await drainPromise;
      } while (drainPromise);
    },
  };
}
