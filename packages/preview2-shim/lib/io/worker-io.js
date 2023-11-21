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
} from "./calls.js";
import { STDERR } from "./stream-types.js";

const DEBUG = false;

const workerPath = fileURLToPath(
  new URL("./worker-thread.js", import.meta.url)
);

/**
 * @type {(call: number, id: number | null, payload: any) -> any}
 */
export let ioCall = createSyncFn(workerPath);
if (DEBUG) {
  const _ioCall = ioCall;
  ioCall = function ioCall(num, id, payload) {
    let ret;
    try {
      ret = _ioCall(num, id, payload);
      return ret;
    } catch (e) {
      ret = e;
      throw ret;
    } finally {
      process._rawDebug(
        (num & CALL_MASK) >> CALL_SHIFT,
        num & CALL_TYPE_MASK,
        id,
        payload,
        "->",
        ret
      );
    }
  };
}

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

class ComponentError extends Error {
  constructor(name, msg, payload) {
    super(msg);
    this.name = name;
    this.payload = payload;
  }
}

const _Error = Error;
const IoError = class Error extends _Error {
  toDebugString() {
    return this.message;
  }
};

function streamIoErrorCall(call, id, payload) {
  try {
    return ioCall(call, id, payload);
  } catch (e) {
    // any invalid error is a trap
    if (e.tag !== "stream-error") {
      console.error(e);
      process.exit(1);
    }
    if (e.val.tag === "last-operation-failed") {
      const msg = e.val.val.message;
      e.val.val = Object.assign(new IoError(), e.val);
      throw new ComponentError("StreamError", msg, e);
    }
    throw new ComponentError("StreamError", "stream closed", e);
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
      src.#id,
      len
    );
  }
  subscribe() {
    return pollableCreate(
      ioCall(OUTPUT_STREAM_SUBSCRIBE | this.#streamType, this.#id)
    );
  }
  [symbolDispose]() {
    ioCall(OUTPUT_STREAM_DISPOSE, this.#id);
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
  static _create(id) {
    const pollable = new Pollable();
    pollable.#id = id;
    if (id === 0) pollable.#ready = true;
    return pollable;
  }
  static _listToIds(list) {
    return list.map((pollable) => pollable.#id);
  }
  static _markReady(pollable) {
    pollable.#ready = true;
  }
}

export const pollableCreate = Pollable._create;
delete Pollable._create;

const pollableListToIds = Pollable._listToIds;
delete Pollable._listToIds;

const pollableMarkReady = Pollable._markReady;
delete Pollable._markReady;

export const poll = {
  Pollable,
  poll(list) {
    const includeList = ioCall(POLL_POLL_LIST, null, pollableListToIds(list));
    return list.filter((pollable) => {
      if (includeList.includes(pollable.id)) {
        pollableMarkReady(pollable);
        return true;
      }
      return false;
    });
  },
};

export function resolvedPoll() {
  return pollableCreate(0);
}

export function createPoll(call, id, initPayload) {
  return pollableCreate(ioCall(call, id, initPayload));
}
