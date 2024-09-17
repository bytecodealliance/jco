import { _setCwd as fsSetCwd } from './filesystem.js';
import { streams } from './io.js';
const { InputStream, OutputStream } = streams;

const symbolDispose = Symbol.dispose ?? Symbol.for('dispose');

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
  constructor(ok) {
    super(`Component exited ${ok ? 'successfully' : 'with error'}`);
    this.exitError = true;
    this.ok = ok;
  }
}

export const exit = {
  exit (status) {
    throw new ComponentExit(status.tag === 'err' ? true : false);
  }
};

/**
 * @param {import('../common/io.js').InputStreamHandler} handler 
 */
export function _setStdin (handler) {
  stdinStream.handler = handler;
}
/**
 * @param {import('../common/io.js').OutputStreamHandler} handler 
 */
export function _setStderr (handler) {
  stderrStream.handler = handler;
}
/**
 * @param {import('../common/io.js').OutputStreamHandler} handler 
 */
export function _setStdout (handler) {
  stdoutStream.handler = handler;
}

const stdinStream = new InputStream({
  blockingRead (_len) {
    // TODO
  },
  subscribe () {
    // TODO
  },
  [symbolDispose] () {
    // TODO
  }
});
let textDecoder = new TextDecoder();
const stdoutStream = new OutputStream({
  write (contents) {
    if (contents[contents.length - 1] == 10) {
      // console.log already appends a new line
      contents = contents.subarray(0, contents.length - 1);
    }
    console.log(textDecoder.decode(contents));
  },
  blockingFlush () {
  },
  [symbolDispose] () {
  }
});
const stderrStream = new OutputStream({
  write (contents) {
    if (contents[contents.length - 1] == 10) {
      // console.error already appends a new line
      contents = contents.subarray(0, contents.length - 1);
    }
    console.error(textDecoder.decode(contents));
  },
  blockingFlush () {
  },
  [symbolDispose] () {

  }
});

export const stdin = {
  InputStream,
  getStdin () {
    return stdinStream;
  }
};

export const stdout = {
  OutputStream,
  getStdout () {
    return stdoutStream;
  }
};

export const stderr = {
  OutputStream,
  getStderr () {
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
