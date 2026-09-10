/** Signatures adapted from @types/node 24.13.3 test.d.ts (DefinitelyTyped, MIT),
 * reconciled with Node v24.20.0, 71b8b174857e25106d39b61a9e6f30d927da8b01.
 * Self-contained types use the portable assert and stream contracts. */
import type { AssertPredicate } from "../assert/index.js";
import type { Readable } from "../stream/types.js";
import type { TestContext, SuiteContext } from "./context.js";
import type { MockTracker } from "./mock.js";
import type { AssertionRegistry, SnapshotConfiguration } from "./assert.js";
import type { TestFailure } from "./errors.js";

export type Done = (result?: unknown) => void;
export type TestFn = (this: TestContext, t: TestContext, done: Done) => void | PromiseLike<void>;
export type SuiteFn = (this: SuiteContext, s: SuiteContext) => void | PromiseLike<void>;
export type HookFn = (this: TestContext, t: TestContext, done: Done) => void | PromiseLike<void>;
export type ExpectFailure =
  | boolean
  | string
  | AssertPredicate
  | { label?: string; match?: AssertPredicate };
export interface TestOptions {
  concurrency?: number | boolean;
  only?: boolean;
  skip?: boolean | string;
  todo?: boolean | string;
  expectFailure?: ExpectFailure;
  signal?: AbortSignal;
  timeout?: number;
  plan?: number;
  tags?: readonly string[];
}
export interface HookOptions {
  timeout?: number;
  signal?: AbortSignal;
}
export interface PlanOptions {
  wait?: boolean | number;
}
export interface WaitForOptions {
  interval?: number;
  timeout?: number;
}
export interface TestCall<F = TestFn> {
  (name?: string, fn?: F): Promise<void>;
  (name?: string, options?: TestOptions, fn?: F): Promise<void>;
  (options?: TestOptions, fn?: F): Promise<void>;
  (fn?: F): Promise<void>;
}
export interface TestFunction<F = TestFn> extends TestCall<F> {
  skip: TestCall<F>;
  todo: TestCall<F>;
  only: TestCall<F>;
  expectFailure: TestCall<F>;
}
export type Hook = (fn?: HookFn, options?: HookOptions) => void;
export interface TestModule extends TestFunction {
  test: TestModule;
  it: TestModule;
  suite: TestFunction<SuiteFn>;
  describe: TestFunction<SuiteFn>;
  before: Hook;
  after: Hook;
  beforeEach: Hook;
  afterEach: Hook;
  getTestContext(): TestContext | SuiteContext | undefined;
  run(options?: RunOptions): TestsStream;
  readonly mock: MockTracker;
  readonly assert: AssertionRegistry;
  readonly snapshot: SnapshotConfiguration;
}
export interface RunOptions extends TestOptions {
  files?: readonly string[];
  cwd?: string;
  globPatterns?: readonly string[];
  forceExit?: boolean;
  isolation?: "process" | "none";
  inspectPort?: number | (() => number);
  setup?: (stream: TestsStream) => void | Promise<void>;
  execArgv?: readonly string[];
  argv?: readonly string[];
  watch?: boolean;
  shard?: { index: number; total: number };
  testNamePatterns?: string | RegExp | readonly (string | RegExp)[];
  testSkipPatterns?: string | RegExp | readonly (string | RegExp)[];
  testTagFilters?: readonly string[];
  coverage?: boolean;
  coverageIncludeGlobs?: readonly string[];
  coverageExcludeGlobs?: readonly string[];
  lineCoverage?: number;
  branchCoverage?: number;
  functionCoverage?: number;
  updateSnapshots?: boolean;
  rerunFailuresFilePath?: string;
}
export interface TestLocation {
  name: string;
  nesting: number;
  file?: string;
  line?: number;
  column?: number;
}
export interface TestResult extends TestLocation {
  testNumber: number;
  details: { duration_ms: number; type: "test" | "suite"; error?: TestFailure };
  skip?: boolean | string;
  todo?: boolean | string;
  expectFailure?: boolean | string;
  tags?: readonly string[];
  classname?: string;
}
export interface CoverageFile {
  path: string;
  functions: { name: string; line: number; count: number }[];
  branches: { line: number; count: number }[];
  lines: { line: number; count: number }[];
  totalFunctionCount: number;
  coveredFunctionCount: number;
  totalBranchCount: number;
  coveredBranchCount: number;
  totalLineCount: number;
  coveredLineCount: number;
}
export interface TestSummary {
  success: boolean;
  counts: {
    tests: number;
    failed: number;
    passed: number;
    cancelled: number;
    skipped: number;
    todo: number;
    suites: number;
    topLevel: number;
  };
  duration_ms: number;
}
export type TestEvent =
  | { type: "test:start" | "test:enqueue" | "test:dequeue"; data: TestLocation }
  | { type: "test:pass" | "test:fail" | "test:complete"; data: TestResult }
  | { type: "test:plan"; data: { nesting: number; count: number } }
  | {
      type: "test:diagnostic" | "test:log" | "test:stdout" | "test:stderr";
      data: { nesting: number; message: string; data?: unknown };
    }
  | {
      type: "test:coverage";
      data: { nesting: number; summary: { workingDirectory: string; files: CoverageFile[] } };
    }
  | { type: "test:summary"; data: TestSummary }
  | { type: "test:interrupted"; data: { tests: TestLocation[] } }
  | { type: "test:watch:drained" | "test:watch:restarted"; data?: undefined };
export type TestEventSource = AsyncIterable<TestEvent> | Iterable<TestEvent>;
/** run() is unavailable in a component; this describes its Node-compatible return contract. */
export interface TestsStream extends Readable {
  [Symbol.asyncIterator](): AsyncIterableIterator<TestEvent>;
}
