/** Node v24.20.0 public facade, adapted from nodejs/node lib/test.js,
 * 71b8b174857e25106d39b61a9e6f30d927da8b01, MIT (see LICENSE).
 * Component tests report TAP to the engine console without setting host exitCode. */
import { createTestHarness } from "./runner.js";
import { formatTap } from "./tap.js";
import type { TestEvent, TestModule } from "./types.js";
let started = false;
const harness = createTestHarness({
  report(event: TestEvent): void {
    if (!started) {
      console.log("TAP version 13");
      started = true;
    }
    const text = formatTap(event);
    if (text) {
      console.log(text.trimEnd());
    }
  },
});
const test: TestModule = harness.module;
export default test;
export const {
  after,
  afterEach,
  assert,
  before,
  beforeEach,
  describe,
  expectFailure,
  getTestContext,
  it,
  mock,
  only,
  run,
  skip,
  snapshot,
  suite,
  todo,
} = test;
export { test };
export type * from "./types.js";
export type { TestContext, SuiteContext } from "./context.js";
export type {
  MockFunctionContext,
  MockFunctionCall,
  MockPropertyContext,
  MockPropertyAccess,
  MockTracker,
  Mock,
  MockOptions,
  MockMethodOptions,
  MockModuleOptions,
  MockModuleContext,
  MockTimers,
  MockTimersOptions,
} from "./mock.js";
export type { TestAssertions, AssertionRegistry, SnapshotConfiguration } from "./assert.js";
