import process from "node:process";
import { parentPort } from "worker_threads";

// See: https://streams.spec.whatwg.org/#example-pipe-switch-dest
const controllers = {
  stdout: null,
  stderr: null,
};

let pipePromise = Promise.resolve();

parentPort.on("message", async (event) => {
  const { stream, target } = event;
  if (!stream || !target) return;

  // If a previous stream is active for this target, abort it.
  if (controllers[target]) {
    controllers[target].abort();
    await pipePromise.catch(() => {});
  }

  controllers[target] = new AbortController();

  const writable = new WritableStream({
    write(chunk) {
      if (target === "stdout") {
        process.stdout.write(chunk);
      } else if (target === "stderr") {
        process.stderr.write(chunk);
      }
    },
  });

  pipePromise = stream.pipeTo(writable, {
    signal: controllers[target].signal,
    preventAbort: true,
    preventClose: true,
  });
});
