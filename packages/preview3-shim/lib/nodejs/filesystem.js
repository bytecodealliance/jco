import { Worker } from "worker_threads";
import { StreamReader } from "./stream.js";
import { FutureReader } from "./future.js";
import { randomUUID } from "crypto";

import { preopens as preview2Preopens } from "@bytecodealliance/preview2-shim/filesystem";

let _worker = null;
let _pending = new Map();

function terminateWorker() {
  _pending.clear();
  _worker.removeAllListeners();
  _worker.terminate();
  _worker = null;
}

function getFsWorker() {
  if (!_worker) {
    _worker = new Worker(new URL("./fs-worker.js", import.meta.url));
    _worker.unref();

    _worker.on("message", (res) => {
      const { id, result, error } = res;
      const entry = _pending.get(id);
      if (!entry) return;

      const { resolve, reject } = entry;
      _pending.delete(id);

      if (error) {
        reject(error);
      } else {
        resolve(result);
      }

      // TODO: Should we avoid creating and destroying workers too frequently?
      if (_pending.size === 0) {
        terminateWorker();
      }
    });

    _worker.on("error", (err) => {
      for (const { reject } of _pending.values()) {
        reject(err);
      }
      terminateWorker();
    });
  }

  return _worker;
}

export function doFilesystemOp(msg, transferable = []) {
  const worker = getFsWorker();
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    _pending.set(id, { resolve, reject });
    worker.postMessage({ ...msg, id }, transferable);
  });
}

class Descriptor {
  #inner;
  #fd;
  #fullPath;

  static _create(inner) {
    const descriptor = new Descriptor();
    descriptor.#inner = inner;
    descriptor.#fd = inner._getFd();
    descriptor.#fullPath = inner._getFullPath();
    return descriptor;
  }

  readViaStream(offset) {
    const transform = new TransformStream();
    const promise = Promise.resolve()
      .then(() =>
        doFilesystemOp(
          {
            op: "read",
            fd: this.#fd,
            offset: Number(offset),
            stream: transform.writable,
          },
          [transform.writable],
        ),
      )
      .catch((err) => {
        throw convertFsError(err);
      });

    return [new StreamReader(transform.readable), new FutureReader(promise)];
  }

  writeViaStream(offset, data) {
    const res = Promise.resolve()
      .then(() => data.intoStream())
      .then((stream) =>
        doFilesystemOp(
          { op: "write", fd: this.#fd, offset: Number(offset), stream },
          [stream],
        ),
      )
      .catch((err) => {
        throw convertFsError(err);
      });

    return new FutureReader(res);
  }

  appendViaStream(data) {
    const res = Promise.resolve()
      .then(() => data.intoStream())
      .then((stream) =>
        doFilesystemOp({ op: "append", fd: this.#fd, stream }, [stream]),
      )
      .catch((err) => {
        throw convertFsError(err);
      });

    return new FutureReader(res);
  }

  readDirectory() {
    const transform = new TransformStream();
    const res = Promise.resolve()
      .then(() =>
        doFilesystemOp(
          {
            op: "readDir",
            fd: this.#fd,
            fullPath: this.#fullPath,
            stream: transform.writable,
          },
          [transform.writable],
        ),
      )
      .catch((err) => {
        throw convertFsError(err);
      });

    return [new StreamReader(transform.readable), new FutureReader(res)];
  }

  openAt(pathFlags, path, openFlags, descriptorFlags) {
    const inner = this.#inner.openAt(
      pathFlags,
      path,
      openFlags,
      descriptorFlags,
    );
    return descriptorCreate(inner);
  }

  [Symbol.dispose]() {
    if (this.#inner && typeof this.#inner[Symbol.dispose] === "function") {
      this.#inner[Symbol.dispose]();
    }
  }

  // Delegate methods from preview2
  static _makeDelegate(methodName) {
    return function (...args) {
      return this.#inner[methodName](...args);
    };
  }
}

const delegateMethods = [
  "advise",
  "syncData",
  "getFlags",
  "getType",
  "setSize",
  "setTimes",
  "read",
  "write",
  "sync",
  "createDirectoryAt",
  "stat",
  "statAt",
  "setTimesAt",
  "linkAt",
  "readlinkAt",
  "removeDirectoryAt",
  "renameAt",
  "symlinkAt",
  "unlinkFileAt",
  "isSameObject",
  "metadataHash",
  "metadataHashAt",
];

for (const method of delegateMethods) {
  Object.defineProperty(Descriptor.prototype, method, {
    value: Descriptor._makeDelegate(method),
    writable: true,
    configurable: true,
  });
}

const descriptorCreate = Descriptor._create;
delete Descriptor._create;

export const types = {
  Descriptor,
  filesystemErrorCode(err) {
    return convertFsError(err.payload);
  },
};

export const preopens = {
  Descriptor,
  getDirectories() {
    return preview2Preopens.getDirectories().map(intoPreview3);
  },
};

export {
  _setPreopens,
  _addPreopen,
} from "@bytecodealliance/preview2-shim/filesystem";

function intoPreview3([inner, virtualPath]) {
  return [descriptorCreate(inner), virtualPath];
}

function convertFsError(e) {
  switch (e.code) {
    case "EACCES":
      return "access";
    case "EALREADY":
      return "already";
    case "EBADF":
      return "bad-descriptor";
    case "EBUSY":
      return "busy";
    case "EDEADLK":
      return "deadlock";
    case "EDQUOT":
      return "quota";
    case "EEXIST":
      return "exist";
    case "EFBIG":
      return "file-too-large";
    case "EILSEQ":
      return "illegal-byte-sequence";
    case "EINPROGRESS":
      return "in-progress";
    case "EINTR":
      return "interrupted";
    case "EINVAL":
      return "invalid";
    case "EIO":
      return "io";
    case "EISDIR":
      return "is-directory";
    case "ELOOP":
      return "loop";
    case "EMLINK":
      return "too-many-links";
    case "EMSGSIZE":
      return "message-size";
    case "ENAMETOOLONG":
      return "name-too-long";
    case "ENODEV":
      return "no-device";
    case "ENOENT":
      return "no-entry";
    case "ENOLCK":
      return "no-lock";
    case "ENOMEM":
      return "insufficient-memory";
    case "ENOSPC":
      return "insufficient-space";
    case "ENOTDIR":
    case "ERR_FS_EISDIR":
      return "not-directory";
    case "ENOTEMPTY":
      return "not-empty";
    case "ENOTRECOVERABLE":
      return "not-recoverable";
    case "ENOTSUP":
      return "unsupported";
    case "ENOTTY":
      return "no-tty";
    // windows gives this error for badly structured `//` reads
    // this seems like a slightly better error than unknown given
    // that it's a common footgun
    case -4094:
    case "ENXIO":
      return "no-such-device";
    case "EOVERFLOW":
      return "overflow";
    case "EPERM":
      return "not-permitted";
    case "EPIPE":
      return "pipe";
    case "EROFS":
      return "read-only";
    case "ESPIPE":
      return "invalid-seek";
    case "ETXTBSY":
      return "text-file-busy";
    case "EXDEV":
      return "cross-device";
    case "UNKNOWN":
      switch (e.errno) {
        case -4094:
          return "no-such-device";
        default:
          throw e;
      }
    default:
      throw e;
  }
}
