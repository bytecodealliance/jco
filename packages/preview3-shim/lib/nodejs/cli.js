import process from "node:process";
import { Readable } from "stream";
import { ResourceWorker } from "./workers/resource-worker.js";

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

const _worker = new ResourceWorker(
  new URL("./workers/cli-worker.js", import.meta.url),
);

export const stdin = {
  getStdin() {
    const stream = Readable.toWeb(process.stdin);
    return new StreamReader(stream);
  },
};

export const stdout = {
  setStdout(streamReader) {
    const stream = streamReader.intoStream();
    _worker.runOp({ op: "stdout", stream }, [stream]);
  },
};

export const stderr = {
  setStdout(streamReader) {
    const stream = streamReader.intoStream();
    _worker.runOp({ op: "stderr", stream }, [stream]);
  },
};
