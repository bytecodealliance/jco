import { InputStream, OutputStream } from './io/streams.js';
import { _setCwd as fsSetCwd } from './filesystem.js';

const textDecoder = new TextDecoder();

let stdinStream, stdoutStream, stderrStream;
let _env = [], _args = [], _cwd = "/";
export function _setEnv (envObj) {
  _env = Object.entries(envObj);
}
export function _setArgs (args) {
  _args = args;
}
export function _setCwd (cwd) {
  fsSetCwd(_cwd = cwd);
}
export function _setStdin (stream) {
  stdinStream = stream;
}


export const environment = {
  getEnvironment () {
    return _env;
  },
  getArguments () {
    return _args;
  },
  initialCwd () {
    return _cwd;
  }
};

class ComponentExit extends Error {
  constructor(code) {
    super(`Component exited ${code === 0 ? 'successfully' : 'with error'}`);
    this.exitError = true;
    this.code = code;
  }
}

export const exit = {
  exit (status) {
    throw new ComponentExit(status.tag === 'err' ? 1 : 0);
  },
  exitWithCode (code) {
    throw new ComponentExit(code);
  }
};

export const stdin = {
  InputStream,
  getStdin () {
    if (!stdinStream) {
      stdinStream = new InputStream();
    }
    return stdinStream;
  }
};

export const stdout = {
  OutputStream,
  getStdout () {
    if (!stdoutStream) {
      stdoutStream = new OutputStream(
        new WritableStream({
          write: (contents) => {
            // console.log() inserts a '\n' (which is 10) so try to skip that
            if (contents[contents.length - 1] === 10) {
              contents = contents.subarray(0, contents.length - 1);
            }
            console.log(textDecoder.decode(contents));
          },
        })
      );
    }
    return stdoutStream;
  }
};

export const stderr = {
  OutputStream,
  getStderr () {
    if (!stderrStream) {
      stderrStream = new OutputStream(
        new WritableStream({
          write: (contents) => {
            // console.log() inserts a '\n' (which is 10) so try to skip that
            if (contents[contents.length - 1] === 10) {
              contents = contents.subarray(0, contents.length - 1);
            }
            console.error(textDecoder.decode(contents));
          },
        })
      );
    }
    return stderrStream;
  }
};

class TerminalInput {}
class TerminalOutput {}

const terminalStdoutInstance = new TerminalOutput();
const terminalStderrInstance = new TerminalOutput();
const terminalStdinInstance = new TerminalInput();

export const terminalInput = {
  TerminalInput
};

export const terminalOutput = {
  TerminalOutput
};

export const terminalStderr = {
  TerminalOutput,
  getTerminalStderr () {
    return terminalStderrInstance;
  }
};

export const terminalStdin = {
  TerminalInput,
  getTerminalStdin () {
    return terminalStdinInstance;
  }
};

export const terminalStdout = {
  TerminalOutput,
  getTerminalStdout () {
    return terminalStdoutInstance;
  }
};

