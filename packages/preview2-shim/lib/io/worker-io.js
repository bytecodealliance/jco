import { fileURLToPath } from "node:url";
import { createSyncFn } from "../synckit/index.js";
import {
  CALL_MASK,
  CALL_SHIFT,
  CALL_TYPE_MASK,
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
  POLL_POLLABLE_READY,
  HTTP_SERVER_INCOMING_HANDLER,
} from "./calls.js";
import { STDERR } from "./calls.js";

const DEBUG = false;

const workerPath = fileURLToPath(
  new URL("./worker-thread.js", import.meta.url)
);


const httpIncomingHandlers = new Map();
export function registerIncomingHttpHandler (id, handler) {
  httpIncomingHandlers.set(id, handler);
}

/**
 * @type {(call: number, id: number | null, payload: any) -> any}
 */
export let ioCall = createSyncFn(workerPath, (type, id, payload) => {
  // 'callbacks' from the worker
  // ONLY happens for an http server incoming handler, and NOTHING else (not even sockets, since accept is sync!)
  if (type !== HTTP_SERVER_INCOMING_HANDLER)
    throw new Error('Internal error: only incoming handler callback is permitted');
  const handler = httpIncomingHandlers.get(id);
  if (!handler)
    throw new Error(`Internal error: no incoming handler registered for server ${id}`);
  handler(payload);
});
if (DEBUG) {
  const _ioCall = ioCall;
  ioCall = function ioCall(num, id, payload) {
    let ret;
    try {
      process._rawDebug(
        (num & CALL_MASK) >> CALL_SHIFT,
        num & CALL_TYPE_MASK,
        id,
        payload
      );
      ret = _ioCall(num, id, payload);
      return ret;
    } catch (e) {
      ret = e;
      throw ret;
    } finally {
      process._rawDebug("->", ret);
    }
  };
}

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

const _Error = Error;
const IoError = class Error extends _Error {
  constructor (payload) {
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
      e.val = new IoError(e.val);
      throw e;
    }
    // any invalid error is a trap
    console.trace(e);
    process.exit(1);
  }
}

class InputStream {
  #id;
  #streamType;
  get _id() {
    return this.#id;
  }
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
  get _id() {
    return this.#id;
  }
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
      const stream =
        this.#streamType === STDERR ? process.stderr : process.stdout;
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
      src.#id,
      len
    );
  }
  blockingSplice(src, len) {
    return streamIoErrorCall(
      OUTPUT_STREAM_BLOCKING_SPLICE | this.#streamType,
      this.#id,
      inputStreamId(src),
      len
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
  #ready = false;
  get _id() {
    return this.#id;
  }
  ready() {
    if (this.#ready) return true;
    const ready = ioCall(POLL_POLLABLE_READY, this.#id);
    if (ready) this.#ready = true;
    return ready;
  }
  block() {
    if (!this.#ready) {
      ioCall(POLL_POLLABLE_BLOCK, this.#id);
      this.#ready = true;
    }
  }
  static _getId(pollable) {
    return pollable.#id;
  }
  static _create(id) {
    const pollable = new Pollable();
    pollable.#id = id;
    if (id === 0) pollable.#ready = true;
    return pollable;
  }
  static _markReady(pollable) {
    pollable.#ready = true;
  }
}

export const pollableCreate = Pollable._create;
delete Pollable._create;

const pollableMarkReady = Pollable._markReady;
delete Pollable._markReady;

const pollableGetId = Pollable._getId;
delete Pollable._getId;

export const poll = {
  Pollable,
  poll(list) {
    const doneList = ioCall(POLL_POLL_LIST, null, list.map(pollableGetId));
    for (const idx of doneList) {
      pollableMarkReady(list[idx]);
    }
    return doneList;
  },
};

export function resolvedPoll() {
  return pollableCreate(0);
}

export function createPoll(call, id, initPayload) {
  return pollableCreate(ioCall(call, id, initPayload));
}
