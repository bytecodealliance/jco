import process from "node:process";
import { Readable } from "stream";
import { Worker } from "worker_threads";

import { StreamReader } from "./stream.js";

export {
  _appendEnv,
  _setEnv,
  _setArgs,
  _setCwd,
  _setTerminalStdin,
  _setTerminalStdout,
  _setTerminalStderr,
  environment,
  exit,
  terminalInput,
  terminalOutput,
  terminalStdin,
  terminalStdout,
  terminalStderr,
} from "@bytecodealliance/preview2-shim/cli";

// Create a single shared worker that handles stdout and stderr.
const worker = new Worker(new URL("./stdio-worker.js", import.meta.url));

// Unref the worker so it doesn't block process exit.
worker.unref();

export const stdin = {
  getStdin() {
    const stream = Readable.toWeb(process.stdin);
    return new StreamReader(stream);
  },
};

export const stdout = {
  setStdout(streamReader) {
    const stream = streamReader.intoStream();
    worker.postMessage({ stream, target: "stdout" }, [stream]);
  },
};

export const stderr = {
  setStdout(streamReader) {
    const stream = streamReader.intoStream();
    worker.postMessage({ stream, target: "stderr" }, [stream]);
  },
};
