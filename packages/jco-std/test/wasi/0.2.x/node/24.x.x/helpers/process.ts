import { createProcess } from "../../../../../../src/wasi/0.2.x/node/24.x.x/process/core.js";
import host from "../../../../../../src/wasi/0.2.x/node/24.x.x/process-host-node.js";
import denied from "../../../../../../src/wasi/0.2.x/node/24.x.x/process-host.js";
export { createProcess, host, denied };
export const process = createProcess(host);
export function errorOf(fn: () => unknown): { name: string; code?: unknown; message: string } {
  try {
    fn();
  } catch (error) {
    if (error instanceof Error) {
      return {
        name: error.name,
        code: "code" in error ? error.code : undefined,
        message: error.message,
      };
    }
    throw error;
  }
  throw new Error("Expected operation to fail");
}
