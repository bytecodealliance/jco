import { execFile } from "node:child_process";
import { createTestHarness } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/runner.js";
import type {
  TestEvent,
  TestResult,
  TestModule,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/types.js";
export { createTestHarness };
export function harness(only = false): {
  test: TestModule;
  events: TestEvent[];
  drain(): Promise<void>;
  results(): TestResult[];
} {
  const events: TestEvent[] = [];
  const instance = createTestHarness({
    only,
    report(event): void {
      events.push(event);
    },
  });
  return {
    test: instance.module,
    events,
    drain: instance.drain,
    results: (): TestResult[] =>
      events.flatMap((event) =>
        event.type === "test:pass" || event.type === "test:fail" ? [event.data] : [],
      ),
  };
}
export async function oracle(source: string): Promise<unknown> {
  if (process.version !== "v24.20.0") {
    throw new Error(`node:test oracle requires v24.20.0; got ${process.version}`);
  }
  const text = await new Promise<string>((resolve, reject): void => {
    const child = execFile(
      process.execPath,
      ["--input-type=module", "-e", source],
      { encoding: "utf8" },
      (error, stdout): void => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      },
    );
    child.stdin?.end();
  });
  const record = text.split("\n").find((line) => line.startsWith("RESULT:"));
  if (!record) {
    throw new Error(text);
  }
  return JSON.parse(record.slice(7));
}
export function errorCode(error: unknown): unknown {
  return error instanceof Error && "code" in error ? error.code : undefined;
}
