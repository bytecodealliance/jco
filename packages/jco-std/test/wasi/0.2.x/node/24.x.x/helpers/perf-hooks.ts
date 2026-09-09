import node from "node:perf_hooks";

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
}

export const RESOURCE_INFO = { startTime: 0, endTime: 1, encodedBodySize: 1, decodedBodySize: 1 };

/** Record a resource entry on the shim with Node's positional markResourceTiming arguments. */
export function resource(name: string, info = RESOURCE_INFO) {
  return p.markResourceTiming(info, name, "fetch", globalThis, "", {}, 200);
}
