import { beforeAll, expect, test } from "vitest";
import { createWorkerThreads } from "../../../../../../src/wasi/0.2.x/node/24.x.x/worker-threads/core.js";
import { loadNodeProvider, portable } from "../helpers/worker-threads.js";
import type {
  Worker,
  WorkerThreadsImplementation,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/worker-threads/types.js";

let nodeProvider: Awaited<ReturnType<typeof loadNodeProvider>>;
beforeAll(async () => {
  nodeProvider = await loadNodeProvider();
});

function granted(): WorkerThreadsImplementation {
  const result = createWorkerThreads(
    nodeProvider.createWorkerThreadsHost(() => result.workerThreadsCallbacks),
  );
  return result;
}
function exit(worker: Worker): Promise<number> {
  return new Promise((resolve, reject) => {
    worker.once("exit", resolve);
    worker.once("error", reject);
  });
}

test("denial is catchable and pure APIs do not need worker authority", () => {
  const api = portable().workerThreads;
  expect(api.isMainThread).toBe(true);
  expect(() => new api.Worker("1", { eval: true })).toThrow(
    expect.objectContaining({ code: "ERR_JCO_WORKER_THREADS_ADAPTER_REQUIRED" }),
  );
  expect(() => new api.Worker("1", { eval: true, transferList: [new ArrayBuffer(2)] })).toThrow(
    /transferList/,
  );
  expect(() => new api.Worker("1", { stdout: true })).toThrow(/stdio/);
});

test("real workers receive snapshots, emit ordered events, exchange rich values and exit", async () => {
  const api = granted().workerThreads;
  api.setEnvironmentData("settings", { count: 7 });
  const worker = new api.Worker(
    `
    const { parentPort, workerData, getEnvironmentData, isMainThread } = require('node:worker_threads');
    parentPort.once('message', value => {
      parentPort.postMessage({ value, data: workerData, environment: getEnvironmentData('settings'), main: isMainThread });
      parentPort.close();
    });
  `,
    { eval: true, workerData: { token: 12n }, name: "roundtrip" },
  );
  const events: string[] = [];
  worker.on("online", () => events.push("online"));
  const message = new Promise<unknown>((resolve) =>
    worker.once("message", (value: unknown) => {
      events.push("message");
      resolve(value);
    }),
  );
  worker.on("exit", () => events.push("exit"));
  const finished = exit(worker);
  try {
    expect(worker.threadId).toBeGreaterThan(0);
    expect(worker.ref()).toBe(worker);
    expect(worker.unref()).toBe(worker);
    worker.ref();
    api.setEnvironmentData("settings", { count: 99 });
    worker.postMessage({ values: new Set([1, 2]), missing: undefined, big: 42n });
    expect(await message).toEqual({
      value: { values: new Set([1, 2]), missing: undefined, big: 42n },
      data: { token: 12n },
      environment: { count: 7 },
      main: false,
    });
    expect(await finished).toBe(0);
    expect(events).toEqual(["online", "message", "exit"]);
    expect(worker.threadId).toBe(-1);
    expect(worker.threadName).toBeNull();
    expect(worker.resourceLimits).toEqual({});
  } finally {
    await worker.terminate();
  }
}, 15_000);

test("termination is idempotent, supports async disposal, and unsupported telemetry fails", async () => {
  const api = granted().workerThreads;
  const worker = new api.Worker("setInterval(() => {}, 1000)", { eval: true });
  try {
    expect(() => worker.getHeapSnapshot()).toThrow(/getHeapSnapshot/);
    expect(() => worker.performance).toThrow(/performance/);
    expect(() => worker.stdout).toThrow(/stdout/);
    const done = worker.terminate();
    expect(worker.terminate()).toBe(done);
    expect(typeof (await done)).toBe("number");
    await worker[Symbol.asyncDispose]();
    expect(worker.threadId).toBe(-1);
  } finally {
    await worker.terminate();
  }
}, 15_000);

test("providers isolate environment data and dispatch uncaught worker errors before exit", async () => {
  const a = granted().workerThreads;
  const b = granted().workerThreads;
  a.setEnvironmentData("private", "a");
  const worker = new b.Worker(
    "throw Object.assign(new TypeError('worker failed'), { code: 'CUSTOM' })",
    {
      eval: true,
    },
  );
  const events: string[] = [];
  const failure = new Promise<Error>((resolve) =>
    worker.once("error", (error: Error) => {
      events.push("error");
      resolve(error);
    }),
  );
  const done = new Promise<number>((resolve) =>
    worker.once("exit", (code: number) => {
      events.push("exit");
      resolve(code);
    }),
  );
  try {
    expect(b.getEnvironmentData("private")).toBeUndefined();
    expect(await failure).toMatchObject({
      name: "TypeError",
      message: "worker failed",
      code: "CUSTOM",
    });
    expect(await done).toBe(1);
    expect(events).toEqual(["error", "exit"]);
  } finally {
    await worker.terminate();
  }
}, 15_000);

test("eval uses a real CommonJS module and data URLs load native ESM worker exports", async () => {
  const api = granted().workerThreads;
  for (const [filename, options] of [
    [
      "require('node:worker_threads').parentPort.postMessage({ module: typeof module.require === 'function' && Array.isArray(module.paths), data: require('node:worker_threads').workerData })",
      { eval: true, workerData: 5 },
    ],
    [
      new URL(
        "data:text/javascript," +
          encodeURIComponent(
            "import { parentPort, workerData, isMainThread } from 'node:worker_threads'; parentPort.postMessage({ module: !isMainThread, data: workerData });",
          ),
      ),
      { workerData: 5 },
    ],
  ] as const) {
    const worker = new api.Worker(filename, options);
    const message = new Promise<unknown>((resolve) => worker.once("message", resolve));
    const finished = exit(worker);
    try {
      expect(await message).toEqual({ module: true, data: 5 });
      expect(await finished).toBe(0);
    } finally {
      await worker.terminate();
    }
  }
}, 15_000);

test("invalid construction fails before spawning, and marked workerData is rejected", () => {
  const api = granted().workerThreads;
  for (const filename of [false, null, 1, {}]) {
    expect(() => Reflect.construct(api.Worker, [filename])).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
  }
  expect(() => new api.Worker("bare.js")).toThrow(
    expect.objectContaining({ code: "ERR_WORKER_PATH" }),
  );
  expect(() => new api.Worker(new URL("https://example.com/worker.js"))).toThrow(
    expect.objectContaining({ code: "ERR_INVALID_URL_SCHEME" }),
  );
  const value = {};
  api.markAsUncloneable(value);
  expect(() => new api.Worker("1", { eval: true, workerData: { nested: value } })).toThrow(
    expect.objectContaining({ name: "DataCloneError", code: 25 }),
  );
});
