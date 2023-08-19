let _env;
export function _setEnv (envObj) {
  _env = Object.entries(envObj);
}

export const environment = {
  getEnvironment () {
    if (!_env) _setEnv(process.env);
    return _env;
  }
};

export const exit = {
  exit (status) {
    process.exit(status.tag === 'err' ? 1 : 0);
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
