import process, { argv, env, cwd } from "node:process";
import {
  ioCall,
  streams,
  inputStreamCreate,
  outputStreamCreate,
} from "../io/worker-io.js";
import { INPUT_STREAM_CREATE, STDERR, STDIN, STDOUT } from "../io/calls.js";
const { InputStream, OutputStream } = streams;

export const _appendEnv = (env) => {
  void (_env = [
    ..._env.filter(([curKey]) => !(curKey in env)),
    ...Object.entries(env),
  ]);
}
export const _setEnv = (env) => void (_env = Object.entries(env));
export const _setArgs = (args) => void (_args = args);
export const _setCwd = (cwd) => void (_cwd = cwd);
export const _setStdin = (stdin) => void (stdinStream = stdin);
export const _setStdout = (stdout) => void (stdoutStream = stdout);
export const _setStderr = (stderr) => void (stderrStream = stderr);
export const _setTerminalStdin = (terminalStdin) =>
  void (terminalStdinInstance = terminalStdin);
export const _setTerminalStdout = (terminalStdout) =>
  void (terminalStdoutInstance = terminalStdout);
export const _setTerminalStderr = (terminalStderr) =>
  void (terminalStderrInstance = terminalStderr);

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

// Stdin is created as a FILE descriptor
let stdinStream;
let stdoutStream = outputStreamCreate(STDOUT, 1);
let stderrStream = outputStreamCreate(STDERR, 2);

export const stdin = {
  InputStream,
  getStdin() {
    if (!stdinStream)
      stdinStream = inputStreamCreate(
        STDIN,
        ioCall(INPUT_STREAM_CREATE | STDIN, null, null),
      );
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

let terminalStdoutInstance = new TerminalOutput();
let terminalStderrInstance = new TerminalOutput();
let terminalStdinInstance = new TerminalInput();

export const terminalInput = {
  TerminalInput,
};

export const terminalOutput = {
  TerminalOutput,
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
