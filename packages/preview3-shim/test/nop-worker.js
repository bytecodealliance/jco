import { Router } from "../lib/nodejs/workers/resource-worker.js";

Router()
  .op("nop", () => {
    return { ok: true };
  })
  .op("err", () => {
    throw "err";
  })
  .op("err-code", () => {
    const err = new Error("read ECONNRESET");
    err.code = "ECONNRESET";
    err.errno = -54;
    err.syscall = "read";
    throw err;
  });
