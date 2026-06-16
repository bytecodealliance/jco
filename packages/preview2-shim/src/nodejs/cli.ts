import process, { argv, env, cwd } from "node:process";
import { ioCall, inputStreamCreate, outputStreamCreate } from "../io/worker-io.js";
import type {
  exit as ExitNamespace,
  stderr as StderrNamespace,
  stdin as StdinNamespace,
  stdout as StdoutNamespace,
  terminalInput as TerminalInputNamespace,
  terminalOutput as TerminalOutputNamespace,
  terminalStderr as TerminalStderrNamespace,
  terminalStdin as TerminalStdinNamespace,
  terminalStdout as TerminalStdoutNamespace,
} from "../../types/cli.js";
import { INPUT_STREAM_CREATE, STDERR, STDIN, STDOUT } from "../io/calls.js";

export const _appendEnv = (env: Record<string, string>) => {
  void (_env = [..._env.filter(([curKey]) => !(curKey in env)), ...Object.entries(env)]);
};
export const _setEnv = (env: Record<string, string>) => void (_env = Object.entries(env));
export const _setArgs = (args: string[]) => void (_args = args);
export const _setCwd = (cwd: string) => void (_cwd = cwd);
export const _setStdin = (stdin: any) => void (stdinStream = stdin);
export const _setStdout = (stdout: any) => void (stdoutStream = stdout);
export const _setStderr = (stderr: any) => void (stderrStream = stderr);
export const _setTerminalStdin = (terminalStdin: TerminalInput) =>
  void (terminalStdinInstance = terminalStdin);
export const _setTerminalStdout = (terminalStdout: TerminalOutput) =>
  void (terminalStdoutInstance = terminalStdout);
export const _setTerminalStderr = (terminalStderr: TerminalOutput) =>
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

export const exit: typeof ExitNamespace = {
  exit(status: { tag: string }) {
    process.exit(status.tag === "err" ? 1 : 0);
  },
  // @ts-expect-error - Available only wasi-cli v0.2.12
  exitWithCode(code: number) {
    process.exit(code);
  },
};

// Stdin is created as a FILE descriptor
let stdinStream: any;
let stdoutStream = outputStreamCreate(STDOUT, 1);
let stderrStream = outputStreamCreate(STDERR, 2);

export const stdin: typeof StdinNamespace = {
  getStdin() {
    if (!stdinStream) {
      stdinStream = inputStreamCreate(STDIN, ioCall(INPUT_STREAM_CREATE | STDIN, null, null));
    }
    return stdinStream;
  },
};

export const stdout: typeof StdoutNamespace = {
  getStdout() {
    return stdoutStream;
  },
};

export const stderr: typeof StderrNamespace = {
  getStderr() {
    return stderrStream;
  },
};

class TerminalInput {}
class TerminalOutput {}

let terminalStdoutInstance = new TerminalOutput();
let terminalStderrInstance = new TerminalOutput();
let terminalStdinInstance = new TerminalInput();

export const terminalInput: typeof TerminalInputNamespace = {
  TerminalInput,
};

export const terminalOutput: typeof TerminalOutputNamespace = {
  TerminalOutput,
};

export const terminalStdin: typeof TerminalStdinNamespace = {
  getTerminalStdin() {
    return terminalStdinInstance;
  },
};

export const terminalStdout: typeof TerminalStdoutNamespace = {
  getTerminalStdout() {
    return terminalStdoutInstance;
  },
};

export const terminalStderr: typeof TerminalStderrNamespace = {
  getTerminalStderr() {
    return terminalStderrInstance;
  },
};
