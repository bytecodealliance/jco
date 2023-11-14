import { argv, env, cwd } from "node:process";
import {
  streams,
  ioCall,
  streamTypes,
  inputStreamCreate,
  outputStreamCreate,
} from "../io/worker-io.js";
import * as calls from "../io/calls.js";
const { InputStream, OutputStream } = streams;

let _env = Object.entries(env),
  _args = argv.slice(1),
  _cwd = cwd();

export const environment = {
  getEnvironment() {
    return _env;
  },
  getArguments() {
    return _args;
  },
  initialCwd() {
    return _cwd;
  },
};

export const exit = {
  exit(status) {
    process.exit(status.tag === "err" ? 1 : 0);
  },
};

const stdinStream = inputStreamCreate(
  ioCall(calls.INPUT_STREAM_CREATE | streamTypes.STDIN, null, null)
);
const stdoutStream = outputStreamCreate(streamTypes.STDOUT);
const stderrStream = outputStreamCreate(streamTypes.STDERR);

export const stdin = {
  InputStream,
  getStdin() {
    return stdinStream;
  },
};

export const stdout = {
  OutputStream,
  getStdout() {
    return stdoutStream;
  },
};

export const stderr = {
  OutputStream,
  getStderr() {
    return stderrStream;
  },
};

class TerminalInput {}
class TerminalOutput {}

const terminalStdoutInstance = new TerminalOutput();
const terminalStderrInstance = new TerminalOutput();
const terminalStdinInstance = new TerminalInput();

export const terminalInput = {
  TerminalInput,
  dropTerminalInput() {},
};

export const terminalOutput = {
  TerminalOutput,
  dropTerminalOutput() {},
};

export const terminalStderr = {
  TerminalOutput,
  getTerminalStderr() {
    return terminalStderrInstance;
  },
};

export const terminalStdin = {
  TerminalInput,
  getTerminalStdin() {
    return terminalStdinInstance;
  },
};

export const terminalStdout = {
  TerminalOutput,
  getTerminalStdout() {
    return terminalStdoutInstance;
  },
};
