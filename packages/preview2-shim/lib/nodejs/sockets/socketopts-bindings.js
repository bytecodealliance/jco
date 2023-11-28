import { platform } from "node:os";
import { _errnoException } from "node:util";
import { types, refType } from "ref-napi";
import { Library, errno as _errno } from "ffi-napi";

const tryGetUV = (() => {
  let UV = null;
  return () => {
    if (UV === null) {
      try {
        UV = typeof process.binding === "function" ? process.binding("uv") : undefined;
      } catch (ex) {
        // Continue regardless
      }
    }
    return UV;
  };
})();

const uvErrName = (errno) => {
  const UV = tryGetUV();
  return UV && UV.errname ? UV.errname(errno) : "UNKNOWN";
};

const errnoException = (errno, syscall, original) => {
  if (_errnoException) {
    return _errnoException(-errno, syscall, original);
  }

  const errname = uvErrName(-errno),
    message = original ? `${syscall} ${errname} (${errno}) ${original}` : `${syscall} ${errname} (${errno})`;

  const e = new Error(message);
  e.code = errname;
  e.errno = errname;
  e.syscall = syscall;
  return e;
};

const createFFI = () => {
  const cInt = types.int;
  const cVoid = types.void;

  return Library(null, {
    //name       ret    1     2     3     4                   5
    setsockopt: [cInt, [cInt, cInt, cInt, refType(cVoid), cInt]],
    getsockopt: [cInt, [cInt, cInt, cInt, refType(cVoid), refType(cInt)]],
  });
};

const ffi = (() => {
  let instance;
  return () => {
    if (!instance) {
      instance = createFFI();
    }
    return instance;
  };
})();

const _setsockopt = (fd, level, name, value, valueLength) => {
  if (fd == null) {
    return false;
  }

  const err = ffi().setsockopt(fd, level, name, value, valueLength);

  if (err !== 0) {
    const errno = _errno();
    throw errnoException(errno, "setsockopt");
  }

  return true;
};

const _getsockopt = (fd, level, name, value, valueLength) => {
  if (fd == null) {
    return false;
  }

  const err = ffi().getsockopt(fd, level, name, value, valueLength);

  if (err !== 0) {
    const errno = _errno();
    throw errnoException(errno, "getsockopt");
  }
  return true;
};

const noop = () => false;
const isWin32 = platform() === "win32";

export const setsockopt = isWin32 ? noop : _setsockopt;
export const getsockopt = isWin32 ? noop : _getsockopt;
