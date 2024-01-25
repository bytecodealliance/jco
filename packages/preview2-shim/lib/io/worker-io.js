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
import { _rawDebug, exit, stderr, stdout, env } from "node:process";

const workerPath = fileURLToPath(
  new URL("./worker-thread.js", import.meta.url)
);

const httpIncomingHandlers = new Map();
export function registerIncomingHttpHandler(id, handler) {
  httpIncomingHandlers.set(id, handler);
}

const instanceId = Math.round(Math.random() * 1000).toString();
const DEBUG_DEFAULT = true;
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
 * @returns
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

  // This is the Symbol.dispose function, which allows for _early_ disposal
  Object.defineProperty(resource, symbolDispose, {
    value: () => {
      finalizationRegistry.unregister(finalizer);
      disposeFn(id);
    },
  });
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
    registerDispose(stream, null, id, disposeFn);
    return stream;
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
    registerDispose(stream, null, id, disposeFn);
    return stream;
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

class Pollable {
  #id;
  ready() {
    if (this.#id === 0) return true;
    return ioCall(POLL_POLLABLE_READY, this.#id);
  }
  block() {
    if (this.#id !== 0) {
      ioCall(POLL_POLLABLE_BLOCK, this.#id);
    }
  }
  static _getId(pollable) {
    return pollable.#id;
  }
  static _create(id, parent) {
    const pollable = new Pollable();
    pollable.#id = id;
    registerDispose(pollable, parent, id, pollableDispose);
    return pollable;
  }
}

export const pollableCreate = Pollable._create;
delete Pollable._create;

const pollableGetId = Pollable._getId;
delete Pollable._getId;

export const poll = {
  Pollable,
  poll(list) {
    return ioCall(POLL_POLL_LIST, null, list.map(pollableGetId));
  },
};

export function createPoll(call, id, initPayload) {
  return pollableCreate(ioCall(call, id, initPayload));
}
