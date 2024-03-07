import { fileURLToPath } from "node:url";
import { createSyncFn } from "../synckit/index.js";
import {
  CALL_MASK,
  CALL_TYPE_MASK,
  FILE,
  HTTP_SERVER_INCOMING_HANDLER,
  HTTP,
  INPUT_STREAM_BLOCKING_READ,
  INPUT_STREAM_BLOCKING_SKIP,
  INPUT_STREAM_DISPOSE,
  INPUT_STREAM_READ,
  INPUT_STREAM_SKIP,
  INPUT_STREAM_SUBSCRIBE,
  OUTPUT_STREAM_BLOCKING_FLUSH,
  OUTPUT_STREAM_BLOCKING_SPLICE,
  OUTPUT_STREAM_BLOCKING_WRITE_AND_FLUSH,
  OUTPUT_STREAM_BLOCKING_WRITE_ZEROES_AND_FLUSH,
  OUTPUT_STREAM_CHECK_WRITE,
  OUTPUT_STREAM_DISPOSE,
  OUTPUT_STREAM_FLUSH,
  OUTPUT_STREAM_SPLICE,
  OUTPUT_STREAM_SUBSCRIBE,
  OUTPUT_STREAM_WRITE_ZEROES,
  OUTPUT_STREAM_WRITE,
  POLL_POLL_LIST,
  POLL_POLLABLE_BLOCK,
  POLL_POLLABLE_DISPOSE,
  POLL_POLLABLE_READY,
  SOCKET_TCP,
  STDERR,
  STDIN,
  STDOUT,
  reverseMap,
} from "./calls.js";
import nodeProcess, { exit, stderr, stdout, env } from "node:process";

const _rawDebug = nodeProcess._rawDebug || console.error.bind(console);

const workerPath = fileURLToPath(
  new URL("./worker-thread.js", import.meta.url)
);

const httpIncomingHandlers = new Map();
export function registerIncomingHttpHandler(id, handler) {
  httpIncomingHandlers.set(id, handler);
}

const instanceId = Math.round(Math.random() * 1000).toString();
const DEBUG_DEFAULT = false;
const DEBUG =
  env.PREVIEW2_SHIM_DEBUG === "0"
    ? false
    : env.PREVIEW2_SHIM_DEBUG === "1"
    ? true
    : DEBUG_DEFAULT;

/**
 * @type {(call: number, id: number | null, payload: any) -> any}
 */
export let ioCall = createSyncFn(workerPath, DEBUG, (type, id, payload) => {
  // 'callbacks' from the worker
  // ONLY happens for an http server incoming handler, and NOTHING else (not even sockets, since accept is sync!)
  if (type !== HTTP_SERVER_INCOMING_HANDLER)
    throw new Error(
      "Internal error: only incoming handler callback is permitted"
    );
  const handler = httpIncomingHandlers.get(id);
  if (!handler)
    throw new Error(
      `Internal error: no incoming handler registered for server ${id}`
    );
  handler(payload);
});
if (DEBUG) {
  const _ioCall = ioCall;
  ioCall = function ioCall(num, id, payload) {
    if (typeof id !== "number" && id !== null)
      throw new Error("id must be a number or null");
    let ret;
    try {
      _rawDebug(
        instanceId,
        reverseMap[num & CALL_MASK],
        reverseMap[num & CALL_TYPE_MASK],
        id,
        payload
      );
      ret = _ioCall(num, id, payload);
      return ret;
    } catch (e) {
      ret = e;
      throw ret;
    } finally {
      _rawDebug(instanceId, "->", ret);
    }
  };
}

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

const finalizationRegistry = new FinalizationRegistry(
  (dispose) => void dispose()
);

const dummySymbol = Symbol();

/**
 *
 * @param {any} resource
 * @param {any} parentResource
 * @param {number} id
 * @param {(number) => void} disposeFn
 */
export function registerDispose(resource, parentResource, id, disposeFn) {
  // While strictly speaking all components should handle their disposal,
  // this acts as a last-resort to catch all missed drops through the JS GC.
  // Mainly for two cases - (1) components which are long lived, that get shut
  // down and (2) users that interface with low-level WASI APIs directly in JS
  // for various reasons may end up leaning on JS GC inadvertantly.
  function finalizer() {
    // This has no functional purpose other than to pin a strong reference
    // from the child resource's finalizer to the parent resource, to ensure
    // that we can never finalize a parent resource before a child resource.
    // This makes the generational JS GC become piecewise over child resource
    // graphs (generational at each resource hierarchy level at least).
    if (parentResource?.[dummySymbol]) return;
    disposeFn(id);
  }
  finalizationRegistry.register(resource, finalizer, finalizer);
  return finalizer;
}

export function earlyDispose(finalizer) {
  finalizationRegistry.unregister(finalizer);
  finalizer();
}

const _Error = Error;
const IoError = class Error extends _Error {
  constructor(payload) {
    super(payload);
    this.payload = payload;
  }
  toDebugString() {
    return this.message;
  }
};

function streamIoErrorCall(call, id, payload) {
  try {
    return ioCall(call, id, payload);
  } catch (e) {
    if (e.tag === "closed") throw e;
    if (e.tag === "last-operation-failed") {
      e.val = new IoError(Object.assign(new Error(e.val.message), e.val));
      throw e;
    }
    // any invalid error is a trap
    console.trace(e);
    exit(1);
  }
}

class InputStream {
  #id;
  #streamType;
  #finalizer;
  read(len) {
    return streamIoErrorCall(
      INPUT_STREAM_READ | this.#streamType,
      this.#id,
      len
    );
  }
  blockingRead(len) {
    return streamIoErrorCall(
      INPUT_STREAM_BLOCKING_READ | this.#streamType,
      this.#id,
      len
    );
  }
  skip(len) {
    return streamIoErrorCall(
      INPUT_STREAM_SKIP | this.#streamType,
      this.#id,
      len
    );
  }
  blockingSkip(len) {
    return streamIoErrorCall(
      INPUT_STREAM_BLOCKING_SKIP | this.#streamType,
      this.#id,
      len
    );
  }
  subscribe() {
    return pollableCreate(
      ioCall(INPUT_STREAM_SUBSCRIBE | this.#streamType, this.#id),
      this
    );
  }
  static _id(stream) {
    return stream.#id;
  }
  /**
   * @param {FILE | SOCKET_TCP | STDIN | HTTP} streamType
   */
  static _create(streamType, id) {
    const stream = new InputStream();
    stream.#id = id;
    stream.#streamType = streamType;
    let disposeFn;
    switch (streamType) {
      case FILE:
        disposeFn = fileInputStreamDispose;
        break;
      case SOCKET_TCP:
        disposeFn = socketTcpInputStreamDispose;
        break;
      case STDIN:
        disposeFn = stdinInputStreamDispose;
        break;
      case HTTP:
        disposeFn = httpInputStreamDispose;
        break;
      default:
        throw new Error(
          "wasi-io trap: Dispose function not created for stream type " +
            reverseMap[streamType]
        );
    }
    stream.#finalizer = registerDispose(stream, null, id, disposeFn);
    return stream;
  }
  [symbolDispose]() {
    if (this.#finalizer) {
      earlyDispose(this.#finalizer);
      this.#finalizer = null;
    }
  }
}

function fileInputStreamDispose(id) {
  ioCall(INPUT_STREAM_DISPOSE | FILE, id, null);
}

function socketTcpInputStreamDispose(id) {
  ioCall(INPUT_STREAM_DISPOSE | SOCKET_TCP, id, null);
}

function stdinInputStreamDispose(id) {
  ioCall(INPUT_STREAM_DISPOSE | STDIN, id, null);
}

function httpInputStreamDispose(id) {
  ioCall(INPUT_STREAM_DISPOSE | HTTP, id, null);
}

export const inputStreamCreate = InputStream._create;
delete InputStream._create;

export const inputStreamId = InputStream._id;
delete InputStream._id;

class OutputStream {
  #id;
  #streamType;
  #finalizer;
  checkWrite(len) {
    return streamIoErrorCall(
      OUTPUT_STREAM_CHECK_WRITE | this.#streamType,
      this.#id,
      len
    );
  }
  write(buf) {
    if (this.#streamType <= STDERR) return this.blockingWriteAndFlush(buf);
    return streamIoErrorCall(
      OUTPUT_STREAM_WRITE | this.#streamType,
      this.#id,
      buf
    );
  }
  blockingWriteAndFlush(buf) {
    if (this.#streamType <= STDERR) {
      const stream = this.#streamType === STDERR ? stderr : stdout;
      return void stream.write(buf);
    }
    return streamIoErrorCall(
      OUTPUT_STREAM_BLOCKING_WRITE_AND_FLUSH | this.#streamType,
      this.#id,
      buf
    );
  }
  flush() {
    return streamIoErrorCall(OUTPUT_STREAM_FLUSH | this.#streamType, this.#id);
  }
  blockingFlush() {
    return streamIoErrorCall(
      OUTPUT_STREAM_BLOCKING_FLUSH | this.#streamType,
      this.#id
    );
  }
  writeZeroes(len) {
    return streamIoErrorCall(
      OUTPUT_STREAM_WRITE_ZEROES | this.#streamType,
      this.#id,
      len
    );
  }
  blockingWriteZeroesAndFlush(len) {
    return streamIoErrorCall(
      OUTPUT_STREAM_BLOCKING_WRITE_ZEROES_AND_FLUSH | this.#streamType,
      this.#id,
      len
    );
  }
  splice(src, len) {
    return streamIoErrorCall(
      OUTPUT_STREAM_SPLICE | this.#streamType,
      this.#id,
      { src: src.#id, len }
    );
  }
  blockingSplice(src, len) {
    return streamIoErrorCall(
      OUTPUT_STREAM_BLOCKING_SPLICE | this.#streamType,
      this.#id,
      { src: inputStreamId(src), len }
    );
  }
  subscribe() {
    return pollableCreate(
      ioCall(OUTPUT_STREAM_SUBSCRIBE | this.#streamType, this.#id)
    );
  }

  static _id(outputStream) {
    return outputStream.#id;
  }
  /**
   * @param {OutputStreamType} streamType
   * @param {any} createPayload
   */
  static _create(streamType, id) {
    const stream = new OutputStream();
    stream.#id = id;
    stream.#streamType = streamType;
    let disposeFn;
    switch (streamType) {
      case STDOUT:
        disposeFn = stdoutOutputStreamDispose;
        break;
      case STDERR:
        disposeFn = stderrOutputStreamDispose;
        break;
      case SOCKET_TCP:
        disposeFn = socketTcpOutputStreamDispose;
        break;
      case FILE:
        disposeFn = fileOutputStreamDispose;
        break;
      case HTTP:
        return stream;
      default:
        throw new Error(
          "wasi-io trap: Dispose function not created for stream type " +
            reverseMap[streamType]
        );
    }
    stream.#finalizer = registerDispose(stream, null, id, disposeFn);
    return stream;
  }

  [symbolDispose]() {
    if (this.#finalizer) {
      earlyDispose(this.#finalizer);
      this.#finalizer = null;
    }
  }
}

function stdoutOutputStreamDispose(id) {
  ioCall(OUTPUT_STREAM_DISPOSE | STDOUT, id);
}

function stderrOutputStreamDispose(id) {
  ioCall(OUTPUT_STREAM_DISPOSE | STDERR, id);
}

function socketTcpOutputStreamDispose(id) {
  ioCall(OUTPUT_STREAM_DISPOSE | SOCKET_TCP, id);
}

function fileOutputStreamDispose(id) {
  ioCall(OUTPUT_STREAM_DISPOSE | FILE, id);
}

export const outputStreamCreate = OutputStream._create;
delete OutputStream._create;

export const outputStreamId = OutputStream._id;
delete OutputStream._id;

export const error = { Error: IoError };

export const streams = { InputStream, OutputStream };

function pollableDispose(id) {
  ioCall(POLL_POLLABLE_DISPOSE, id);
}

const rep = Symbol.for("cabiRep");

class Pollable {
  #finalizer;
  ready() {
    return ioCall(POLL_POLLABLE_READY, this[rep]);
  }
  block() {
    ioCall(POLL_POLLABLE_BLOCK, this[rep]);
  }
  static _create(id, parent) {
    const pollable = new Pollable();
    pollable[rep] = id;
    pollable.#finalizer = registerDispose(
      pollable,
      parent,
      id,
      pollableDispose
    );
    return pollable;
  }
  [symbolDispose]() {
    if (this.#finalizer && this[rep]) {
      earlyDispose(this.#finalizer);
      this.#finalizer = null;
    }
  }
}

const cabiLowerSymbol = Symbol.for("cabiLower");
const T_FLAG = 1 << 30;

Pollable.prototype.ready[cabiLowerSymbol] = function ({
  resourceTables: [table],
}) {
  return function pollableReady(handle) {
    const rep = table[(handle << 1) + 1] & ~T_FLAG;
    const ready = ioCall(POLL_POLLABLE_READY, rep);
    return ready ? 1 : 0;
  };
};

Pollable.prototype.block[cabiLowerSymbol] = function ({
  resourceTables: [table],
}) {
  return function pollableBlock(handle) {
    const rep = table[(handle << 1) + 1] & ~T_FLAG;
    ioCall(POLL_POLLABLE_BLOCK, rep);
  };
};

Pollable[Symbol.for("cabiDispose")] = function pollableDispose(rep) {
  ioCall(POLL_POLLABLE_DISPOSE, rep);
};

export const pollableCreate = Pollable._create;
delete Pollable._create;

export const poll = {
  Pollable,
  poll(list) {
    return ioCall(
      POLL_POLL_LIST,
      null,
      list.map((pollable) => pollable[rep])
    );
  },
};

poll.poll[cabiLowerSymbol] = function ({ memory, realloc, resourceTables: [table] }) {
  return function pollPollList (listPtr, len, retptr) {
    const handleList = new Uint32Array(memory.buffer, listPtr, len);
    const repList = Array(len);
    for (let i = 0; i < len; i++) {
      const handle = handleList[i];
      repList[i] = table[(handle << 1) + 1] & ~T_FLAG;
    }
    const result = ioCall(POLL_POLL_LIST, null, repList);
    const ptr = realloc(0, 0, 4, result.byteLength);
    const out = new Uint32Array(memory.buffer, ptr, result.length);
    out.set(result);
    const ret = new Uint32Array(memory.buffer, retptr, 2);
    ret[0] = ptr;
    ret[1] = result.length;
    return retptr;
  };
};

export function createPoll(call, id, initPayload) {
  return pollableCreate(ioCall(call, id, initPayload));
}

export function createPollLower(call, id, table) {
  return function (initPayload) {
    const rep = ioCall(call, id, initPayload);
    const free = table[0] & ~T_FLAG;
    if (free === 0) {
      table.push(0);
      table.push(rep | T_FLAG);
      return (table.length >> 1) - 1;
    }
    table[0] = table[free << 1];
    table[free << 1] = 0;
    table[(free << 1) + 1] = rep | T_FLAG;
    return free;
  };
}
