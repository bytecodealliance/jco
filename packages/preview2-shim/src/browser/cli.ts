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
import {
  inputStreamCreate,
  outputStreamCreate,
  pollableCreate,
  type InputStreamHandler,
  type OutputStreamHandler,
} from "./io.js";
export { _setEnv, _setArgs, environment } from "./environment.js";
export { _setCwd } from "./config.js";

const symbolDispose = Symbol.dispose ?? Symbol.for("dispose");
class ComponentExit extends Error {
  exitError = true;
  code: number;

  constructor(code: number) {
    super(`Component exited ${code === 0 ? "successfully" : "with error"}`);
    this.code = code;
  }
}

export const exit: typeof ExitNamespace = {
  exit(status: ExitNamespace.Result<void, void>): never {
    throw new ComponentExit(status.tag === "err" ? 1 : 0);
  },
  // @ts-expect-error - Available only wasi-cli v0.2.12
  exitWithCode(code: number): never {
    throw new ComponentExit(code);
  },
};

export function _setStdin(handler: InputStreamHandler): void {
  stdinStream.handler = handler;
}

export function _setStderr(handler: OutputStreamHandler): void {
  stderrStream.handler = handler;
}

export function _setStdout(handler: OutputStreamHandler): void {
  stdoutStream.handler = handler;
}

const stdinStream = inputStreamCreate({
  blockingRead(_len: bigint) {
    // TODO
    return new Uint8Array(0);
  },
  subscribe() {
    // TODO
    return pollableCreate();
  },
  [symbolDispose]() {
    // TODO
  },
});

const textDecoder = new TextDecoder();

const stdoutStream = outputStreamCreate({
  write(contents: Uint8Array): void {
    if (contents.at(-1) == 10) {
      // console.log already appends a new line
      contents = contents.subarray(0, -1);
    }
    console.log(textDecoder.decode(contents));
  },
  blockingFlush() {},
  [symbolDispose]() {},
});

const stderrStream = outputStreamCreate({
  write(contents: Uint8Array): void {
    if (contents.at(-1) == 10) {
      // console.error already appends a new line
      contents = contents.subarray(0, -1);
    }
    console.error(textDecoder.decode(contents));
  },
  blockingFlush() {},
  [symbolDispose]() {},
});

export const stdin: typeof StdinNamespace = {
  getStdin() {
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

class TerminalInput implements TerminalInputNamespace.TerminalInput {}
class TerminalOutput implements TerminalOutputNamespace.TerminalOutput {}

const terminalStdoutInstance = new TerminalOutput();
const terminalStderrInstance = new TerminalOutput();
const terminalStdinInstance = new TerminalInput();

export const terminalInput: typeof TerminalInputNamespace = {
  TerminalInput,
};

export const terminalOutput: typeof TerminalOutputNamespace = {
  TerminalOutput,
};

export const terminalStderr: typeof TerminalStderrNamespace = {
  getTerminalStderr() {
    return terminalStderrInstance;
  },
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
