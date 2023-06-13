let _env;
export function _setEnv (envObj) {
  _env = Object.entries(envObj);
}

export const cliBaseEnvironment = {
  getEnvironment () {
    if (!_env) _env = [];
    return _env;
  }
};

class ComponentExit extends Error {
  constructor(code) {
    super(`Component exited ${code === 0 ? 'successfully' : 'with error'}`);
    this.code = code;
  }
}

export const cliBaseExit = {
  exit (status) {
    throw new ComponentExit(status.tag === 'err' ? 1 : 0);
  }
};

export const cliBasePreopens = {
  getDirectories () {
    return [];
  }
}

export const cliBaseStdin = {
  getStdin () {
    return 0;
  }
};

export const cliBaseStdout = {
  getStdout () {
    return 1;
  }
};

export const cliBaseStderr = {
  getStderr () {
    return 2;
  }
};

export {
  cliBaseEnvironment as environment,
  cliBaseExit as exit,
  cliBasePreopens as preopens,
  cliBaseStdin as stdin,
  cliBaseStdout as stdout,
  cliBaseStderr as stderr
}
