let _env, _args = [], _cwd = null;
export function _setEnv (envObj) {
  _env = Object.entries(envObj);
}

export function _setArgs (args) {
  _args = args;
}

export function _setCwd (cwd) {
  _cwd = cwd;
}

export const environment = {
  getEnvironment () {
    if (!_env) _setEnv(process.env);
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
    this.code = code;
  }
}

export const exit = {
  exit (status) {
    throw new ComponentExit(status.tag === 'err' ? 1 : 0);
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
