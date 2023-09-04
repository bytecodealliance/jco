import { _setCwd as fsSetCwd } from './filesystem.js';

let _env = [], _args = [], _cwd = null;
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

export const stdin = {
  getStdin () {
    return 0;
  }
};

export const stdout = {
  getStdout () {
    return 1;
  }
};

export const stderr = {
  getStderr () {
    return 2;
  }
};

export const terminalInput = {
  dropTerminalInput () {

  }
};

export const terminalOutput = {
  dropTerminalOutput () {

  }
};

export const terminalStderr = {
  getTerminalStderr () {
    return 0;
  }
};

export const terminalStdin = {
  getTerminalStdin () {
    return 1;
  }
};

export const terminalStdout = {
  getTerminalStdout () {
    return 2;
  }
};
