import { fileURLToPath } from 'node:url';
import { createSyncFn } from '../synckit/index.js';
import * as calls from './calls.js';
import * as _streamTypes from './stream-types.js';

const DEBUG = false;

const workerPath = fileURLToPath(new URL('./worker-thread.js', import.meta.url));

/**
 * @type {(call: number, id: number | null, payload: any) -> any}
 */
let ioCall = createSyncFn(workerPath);
if (DEBUG) {
  const _ioCall = ioCall;
  ioCall = function ioCall(num, id, payload) {
    console.trace((num & calls.CALL_MASK) >> calls.CALL_SHIFT, num & calls.CALL_TYPE_MASK, id, payload);
    return _ioCall(num, id, payload);
  }
}

export { _streamTypes }

const symbolDispose = Symbol.dispose || Symbol.for('dispose');

class ComponentError extends Error {
  constructor (name, msg, payload) {
    super(msg);
    this.name = name;
    this.payload = payload;
  }
}

const _Error = Error;
const IoError = class Error extends _Error {
  toDebugString () {
    return this.message;
  }
}

function streamIoErrorCall(call, id, payload) {
  try {
    return ioCall(call, id, payload);
  } catch (e) {
    // any invalid error is a trap
    if (e.tag !== 'stream-error') {
      console.error(e);
      process.exit(1);
    }
    if (e.val.tag === 'last-operation-failed') {
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
  get _id () {
    return this.#id;
  }
  read(len) {
    return streamIoErrorCall(calls.INPUT_STREAM_READ | this.#streamType, this.#id, len);
  }
  blockingRead(len) {
    return streamIoErrorCall(calls.INPUT_STREAM_BLOCKING_READ | this.#streamType, this.#id, len);
  }
  skip(len) {
    return streamIoErrorCall(calls.INPUT_STREAM_SKIP | this.#streamType, this.#id, len);
  }
  blockingSkip(len) {
    return streamIoErrorCall(calls.INPUT_STREAM_BLOCKING_SKIP | this.#streamType, this.#id, len);
  }
  subscribe() {
    return pollableCreate(ioCall(calls.INPUT_STREAM_SUBSCRIBE | this.#streamType, this.#id));
  }
  [symbolDispose] () {
    ioCall(calls.INPUT_STREAM_DROP | this.#streamType, this.#id);
  }
  /**
   * @param {InputStreamType} streamType
   */
  static _create (streamType, createPayload) {
    const stream = new InputStream();
    stream.#id = ioCall(calls.INPUT_STREAM_CREATE | streamType, null, createPayload);
    stream.#streamType = streamType;
    return stream;
  }
}

export const _inputStreamCreate = InputStream._create;
delete InputStream._create;

class OutputStream {
  #id;
  #streamType;
  get _id () {
    return this.#id;
  }
  checkWrite(len) {
    return streamIoErrorCall(calls.OUTPUT_STREAM_CHECK_WRITE | this.#streamType, this.#id, len);
  }
  write(buf) {
    return streamIoErrorCall(calls.OUTPUT_STREAM_WRITE | this.#streamType, this.#id, buf);
  }
  blockingWriteAndFlush(buf) {
    return streamIoErrorCall(calls.OUTPUT_STREAM_BLOCKING_WRITE_AND_FLUSH | this.#streamType, this.#id, buf);
  }
  flush() {
    return streamIoErrorCall(calls.OUTPUT_STREAM_FLUSH | this.#streamType, this.#id);
  }
  blockingFlush() {
    return streamIoErrorCall(calls.OUTPUT_STREAM_BLOCKING_FLUSH | this.#streamType, this.#id);
  }
  writeZeroes(len) {
    return streamIoErrorCall(calls.OUTPUT_STREAM_WRITE_ZEROES | this.#streamType, this.#id, len);
  }
  blockingWriteZeroesAndFlush(len) {
    return streamIoErrorCall(calls.OUTPUT_STREAM_BLOCKING_WRITE_ZEROES_AND_FLUSH | this.#streamType, this.#id, len);
  }
  splice(src, len) {
    return streamIoErrorCall(calls.OUTPUT_STREAM_SPLICE | this.#streamType, this.#id, src.#id, len);
  }
  blockingSplice(src, len) {
    return streamIoErrorCall(calls.OUTPUT_STREAM_BLOCKING_SPLICE | this.#streamType, this.#id, src.#id, len);
  }
  subscribe() {
    return pollableCreate(ioCall(calls.OUTPUT_STREAM_SUBSCRIBE | this.#streamType, this.#id));
  }
  [symbolDispose]() {
    ioCall(calls.OUTPUT_STREAM_DISPOSE, this.#id);
  }

  /**
   * @param {OutputStreamType} streamType
   * @param {any} createPayload
   */
  static _create (streamType, createPayload) {
    const stream = new OutputStream();
    stream.#id = ioCall(calls.OUTPUT_STREAM_CREATE | streamType, null, createPayload);
    stream.#streamType = streamType;
    return stream;
  }
}

export const _outputStreamCreate = OutputStream._create;
delete OutputStream._create;

export const streams = { Error: IoError, InputStream, OutputStream };

class Pollable {
  #id;
  #ready = false;
  ready () {
    if (this.#ready)
      return true;
    const ready = ioCall(calls.POLL_POLLABLE_READY, this.#id);
    if (ready)
      this.#ready = true;
    return ready;
  }
  block () {
    if (!this.#ready) {
      ioCall(calls.POLL_POLLABLE_BLOCK, this.#id);
      this.#ready = true;
    }
  }
  static _create (id) {
    const pollable = new Pollable();
    pollable.#id = id;
    return pollable;
  }
  static _listToIds (list) {
    return list.map(pollable => pollable.#id);
  }
  static _markReady (pollable) {
    pollable.#ready = true;
  }
}

const pollableCreate = Pollable._create;
delete Pollable._create;

const pollableListToIds = Pollable._listToIds;
delete Pollable._listToIds;

const pollableMarkReady = Pollable._markReady;
delete Pollable._markReady;

export const poll = {
  Pollable,
  poll (list) {
    const includeList = ioCall(calls.POLL_POLL_LIST, null, pollableListToIds(list));
    return list.filter(pollable => {
      if (includeList.includes(pollable.id)) {
        pollableMarkReady(pollable);
        return true;
      }
      return false;
    });
  }
};
