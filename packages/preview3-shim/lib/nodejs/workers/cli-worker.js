import process from "node:process";
import { Readable } from "node:stream";
import { parentPort } from "worker_threads";
import { pipeline } from "stream/promises";

async function handleOp(msg) {
  const { id, op, stream } = msg;

  const readable = Readable.fromWeb(stream);
  const writable = op === "stdout" ? process.stdout : process.stderr;

  await pipeline(readable, writable, { end: false });
  parentPort.postMessage({ id, result: { ok: true } });
}

parentPort.on("message", async (msg) => {
  try {
    const { op } = msg;
    if (op === "stdout" || op === "stderr") {
      await handleOp(msg);
    } else {
      throw new Error("Unknown operation: " + op);
    }
  } catch (e) {
    parentPort.postMessage({ id: msg.id, error: e });
  }
});
