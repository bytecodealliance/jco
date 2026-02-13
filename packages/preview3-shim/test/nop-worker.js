import { Router } from "../lib/nodejs/workers/resource-worker.js";

Router()
  .op("nop", () => {
    return { ok: true };
  })
  .op("err", () => {
    throw "err";
  });
