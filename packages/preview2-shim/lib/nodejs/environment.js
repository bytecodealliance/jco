import process from 'node:process';

let _env;
export function _setEnv (envObj) {
  _env = Object.entries(envObj);
}

export function getEnvironment () {
  if (!_env) _setEnv(process.env);
  return _env;
}

export function preopens () {
  return [];
}

export function getArguments () {
  return [];
}