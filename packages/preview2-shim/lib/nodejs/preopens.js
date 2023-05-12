// default is full permissions
let preopenCnt = 4;
export let _descriptors = {
  3: { type: 'directory', path: '/' }
};
let directories = [[3, '/']];

export function _addOpenedDescriptor (fd, type, path) {
  if (fd < preopenCnt || _descriptors[fd])
    throw 'bad-descriptor';
  _descriptors[fd] = { type, path };
}

export function _removeOpenedDescriptor (fd) {
  if (descriptor < preopenCnt)
    throw 'eperm';
  delete _descriptors[fd];
}

export function _setPreopens (preopens) {
  _descriptors = {};
  directories = [,,];
  for (const [virtualPath, path] of Object.entries(preopens)) {
    _descriptors[preopenCnt] = { type: 'directory', path };
    directories.push([preopenCnt++, virtualPath]);
  }
}

export function getStdio () {
  return {
    stdin: 0,
    stdout: 1,
    stderr: 2,
  };
}

export function getDirectories () {
  return directories;
}
