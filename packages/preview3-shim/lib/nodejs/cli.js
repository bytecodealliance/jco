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

let worker;

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./stdio-worker.js", import.meta.url));
    worker.unref();
  }

  return worker;
}

export const stdin = {
  getStdin() {
    const stream = Readable.toWeb(process.stdin);
    return new StreamReader(stream);
  },
};

export const stdout = {
  setStdout(streamReader) {
    const stream = streamReader.intoStream();
    getWorker().postMessage({ stream, target: "stdout" }, [stream]);
  },
};

export const stderr = {
  setStdout(streamReader) {
    const stream = streamReader.intoStream();
    getWorker().postMessage({ stream, target: "stderr" }, [stream]);
  },
};
