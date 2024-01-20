import { fileURLToPath } from "node:url";
import { createSyncFn } from "../synckit/index.js";
import {
  CALL_MASK,
  CALL_TYPE_MASK,
  HTTP_SERVER_INCOMING_HANDLER,
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
  reverseMap,
} from "./calls.js";
import { STDERR } from "./calls.js";
import { _rawDebug, exit, stderr, stdout, env } from "node:process";

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
      ioCall(INPUT_STREAM_SUBSCRIBE | this.#streamType, this.#id)
    );
  }
  [symbolDispose]() {
    ioCall(INPUT_STREAM_DISPOSE | this.#streamType, this.#id);
  }
  static _id(stream) {
    return stream.#id;
  }
  /**
   * @param {InputStreamType} streamType
   */
  static _create(streamType, id) {
    const stream = new InputStream();
    stream.#id = id;
    stream.#streamType = streamType;
    return stream;
  }
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
  [symbolDispose]() {
    ioCall(OUTPUT_STREAM_DISPOSE | this.#streamType, this.#id);
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
    return stream;
  }
}

export const outputStreamCreate = OutputStream._create;
delete OutputStream._create;

export const outputStreamId = OutputStream._id;
delete OutputStream._id;

export const error = { Error: IoError };

export const streams = { InputStream, OutputStream };

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
  [symbolDispose]() {
    if (this.#id !== 0) {
      ioCall(POLL_POLLABLE_DISPOSE, this.#id);
      this.#id = 0;
    }
  }
  static _getId(pollable) {
    return pollable.#id;
  }
  static _create(id) {
    const pollable = new Pollable();
    pollable.#id = id;
    return pollable;
  }
}

export const pollableCreate = Pollable._create;
delete Pollable._create;

export const resolvedPoll = pollableCreate(0);

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
