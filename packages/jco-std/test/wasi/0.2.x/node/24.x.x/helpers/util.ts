import native from "node:util";
import util from "../../../../../../src/wasi/0.2.x/node/24.x.x/util/index.js";
import { test as baseTest } from "vitest";

/** Differential fixtures target the exact source pin, independently of host CI majors. */
export const test: ReturnType<typeof baseTest.skipIf> = baseTest.skipIf(
  process.versions.node !== "24.20.0",
);
export { util, native };

export function capture(fn: () => unknown): unknown {
  try {
    return fn();
  } catch (error) {
    if (!(error instanceof Error)) {
      return { thrown: error };
    }
    return {
      name: error.name,
      code: "code" in error ? error.code : undefined,
      message: error.message,
    };
  }
}
