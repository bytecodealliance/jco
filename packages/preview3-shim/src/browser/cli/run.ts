type RunHandler = () => void | Promise<void>;
let handler: RunHandler | undefined;

async function run(): Promise<void> {
  if (!handler) {
    throw new Error("wasi:cli/run import is not configured");
  }
  await handler();
}

export function _setRun(next: RunHandler | undefined): RunHandler | undefined {
  const previous = handler;
  handler = next;
  return previous;
}

export default {
  run,
} satisfies typeof import("../../../types/interfaces/wasi-cli-run.d.ts");
export type * from "../../../types/interfaces/wasi-cli-run.d.ts";
