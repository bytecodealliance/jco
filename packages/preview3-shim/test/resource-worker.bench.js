import { describe, bench } from "vitest";
import { Worker } from "node:worker_threads";
import { ResourceWorker } from "../dist/nodejs/workers/resource-worker.js";

const _worker = new ResourceWorker(() => new Worker(new URL("./nop-worker.js", import.meta.url)));

describe("ResourceWorker round-trip", () => {
  bench(
    "async run nop",
    async () => {
      await _worker.run({ op: "nop" });
    },
    { time: 1000 },
  );

  bench(
    "sync run noop",
    () => {
      _worker.runSync({ op: "nop" });
    },
    { time: 1000 },
  );
});
