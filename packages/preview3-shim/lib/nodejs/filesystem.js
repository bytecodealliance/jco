import { StreamReader } from "./stream.js";
import { FutureReader } from "./future.js";
import { ResourceWorker } from "./workers/resource-worker.js";

import { preopens as preview2Preopens } from "@bytecodealliance/preview2-shim/filesystem";

const _worker = new ResourceWorker(new URL("./workers/filesystem-worker.js", import.meta.url));

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
    const promise = _worker
      .runOp(
        {
          op: "read",
          fd: this.#fd,
          offset: Number(offset),
          stream: transform.writable,
        },
        [transform.writable],
      )
      .catch((err) => {
        throw mapError(err);
      });

    return [new StreamReader(transform.readable), new FutureReader(promise)];
  }

  readDirectory() {
    const transform = new TransformStream();
    const promise = _worker
      .runOp(
        {
          op: "readDir",
          fd: this.#fd,
          fullPath: this.#fullPath,
          stream: transform.writable,
        },
        [transform.writable],
      )
      .catch((err) => {
        throw mapError(err);
      });

    return [new StreamReader(transform.readable), new FutureReader(promise)];
  }

  async writeViaStream(offset, data) {
    const stream = await data.intoStream();

    try {
      await _worker.runOp({ op: "write", fd: this.#fd, offset, stream }, [
        stream,
      ]);
    } catch (err) {
      throw mapError(err);
    }
  }

  async appendViaStream(data) {
    const stream = await data.intoStream();

    try {
      await _worker.runOp({ op: "append", fd: this.#fd, stream }, [stream]);
    } catch (err) {
      throw mapError(err);
    }
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
    return mapError(err.payload);
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

const ERROR_MAP = {
  EACCES: "access",
  EALREADY: "already",
  EBADF: "bad-descriptor",
  EBUSY: "busy",
  EDEADLK: "deadlock",
  EDQUOT: "quota",
  EEXIST: "exist",
  EFBIG: "file-too-large",
  EILSEQ: "illegal-byte-sequence",
  EINPROGRESS: "in-progress",
  EINTR: "interrupted",
  EINVAL: "invalid",
  EIO: "io",
  EISDIR: "is-directory",
  ELOOP: "loop",
  EMLINK: "too-many-links",
  EMSGSIZE: "message-size",
  ENAMETOOLONG: "name-too-long",
  ENODEV: "no-device",
  ENOENT: "no-entry",
  ENOLCK: "no-lock",
  ENOMEM: "insufficient-memory",
  ENOSPC: "insufficient-space",
  ENOTDIR: "not-directory",
  ERR_FS_EISDIR: "not-directory",
  ENOTEMPTY: "not-empty",
  ENOTRECOVERABLE: "not-recoverable",
  ENOTSUP: "unsupported",
  ENOTTY: "no-tty",
  ENXIO: "no-such-device",
  EOVERFLOW: "overflow",
  EPERM: "not-permitted",
  EPIPE: "pipe",
  EROFS: "read-only",
  ESPIPE: "invalid-seek",
  ETXTBSY: "text-file-busy",
  EXDEV: "cross-device",
};

function mapError(e) {
  if (e.code in fsErrorMap) {
    return fsErrorMap[codeKey];
  }

  if (e.code === -4094 || (e.code === "UNKNOWN" && e.errno === -4094)) {
    return "no-such-device";
  }

  throw e;
}
