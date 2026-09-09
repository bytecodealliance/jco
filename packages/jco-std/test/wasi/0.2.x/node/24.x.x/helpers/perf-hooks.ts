import node from "node:perf_hooks";
import { expect } from "vitest";

import shim from "../../../../../../src/wasi/0.2.x/node/24.x.x/perf-hooks.js";

export { node, shim };
export const p = shim.performance;

/** Empty both timelines so tests cannot see each other's entries. */
export function resetTimelines(): void {
  p.clearMarks();
  p.clearMeasures();
  p.clearResourceTimings();
  node.performance.clearMarks();
  node.performance.clearMeasures();
  node.performance.clearResourceTimings();
}

export const RESOURCE_INFO = { startTime: 0, endTime: 1, encodedBodySize: 1, decodedBodySize: 1 };

/** Record a resource entry on the shim with Node's positional markResourceTiming arguments. */
export function resource(name: string, info = RESOURCE_INFO) {
  return p.markResourceTiming(info, name, "fetch", globalThis, "", {}, 200);
}

export interface Thrown {
  name: string;
  code: unknown;
  message: string;
  text: string;
}

/** What `run` throws, including its `String()` form, or undefined when it returns. */
export function thrown(run: () => unknown): Thrown | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    const { name, code, message } = error as Error & { code?: unknown };
    return { name, code, message, text: String(error) };
  }
}

/** Assert that `run` throws (or returns) identically against the shim and against Node. */
export function matchesNode(run: (m: typeof shim | typeof node) => unknown): void {
  expect(thrown(() => run(shim))).toEqual(thrown(() => run(node)));
}
