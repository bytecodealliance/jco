import { resolve } from "node:dns/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { hrtime } from "node:process";
import { Readable } from "node:stream";
import { runAsWorker } from "../synckit/index.js";
import {
  CALL_MASK,
  CALL_SHIFT,
  CALL_TYPE_MASK,
  CLOCKS_DURATION_SUBSCRIBE,
  CLOCKS_INSTANT_SUBSCRIBE,
  CLOCKS_NOW,
  FUTURE_DISPOSE,
  FUTURE_DISPOSE_AND_GET_VALUE,
  HTTP_CREATE_REQUEST,
  INPUT_STREAM_BLOCKING_READ,
  INPUT_STREAM_BLOCKING_SKIP,
  INPUT_STREAM_CREATE,
  INPUT_STREAM_DISPOSE,
  INPUT_STREAM_READ,
  INPUT_STREAM_SKIP,
  INPUT_STREAM_SUBSCRIBE,
  OUTPUT_STREAM_BLOCKING_FLUSH,
  OUTPUT_STREAM_BLOCKING_SPLICE,
  OUTPUT_STREAM_BLOCKING_WRITE_AND_FLUSH,
  OUTPUT_STREAM_BLOCKING_WRITE_ZEROES_AND_FLUSH,
  OUTPUT_STREAM_CHECK_WRITE,
  OUTPUT_STREAM_CREATE,
  OUTPUT_STREAM_DISPOSE,
  OUTPUT_STREAM_FLUSH,
  OUTPUT_STREAM_SPLICE,
  OUTPUT_STREAM_SUBSCRIBE,
  OUTPUT_STREAM_WRITE,
  OUTPUT_STREAM_WRITE_ZEROES,
  POLL_POLLABLE_BLOCK,
  POLL_POLLABLE_READY,
  POLL_POLL_LIST,
  SOCKET_RESOLVE_ADDRESS_CREATE_REQUEST,
  SOCKET_RESOLVE_ADDRESS_DISPOSE_REQUEST,
  SOCKET_RESOLVE_ADDRESS_GET_AND_DISPOSE_REQUEST,
} from "./calls.js";
import { FILE, SOCKET, STDERR, STDIN, STDOUT } from "./stream-types.js";

let streamCnt = 0,
  pollCnt = 0;

/** @type {Map<number, Promise<void>>} */
const unfinishedPolls = new Map();

/** @type {Map<number, { flushPromise: Promise<void> | null, stream: NodeJS.ReadableStream | NodeJS.WritableStream }>} */
const unfinishedStreams = new Map();

/** @type {Map<number, { value: any, error: bool }>} */
const unfinishedFutures = new Map();

// Stdio
unfinishedStreams.set(++streamCnt, {
  flushPromise: Promise.resolve(),
  stream: process.stdin,
});
unfinishedStreams.set(++streamCnt, {
  flushPromise: Promise.resolve(),
  stream: process.stdout,
});
unfinishedStreams.set(++streamCnt, {
  flushPromise: Promise.resolve(),
  stream: process.stderr,
});

/**
 * @param {number} streamId
 * @param {NodeJS.ReadableStream | NodeJS.WritableStream} stream
 */
function streamError(streamId, stream, err) {
  if (stream.end) stream.end();
  // we delete the stream from unfinishedStreams as it is now "finished" (closed)
  unfinishedStreams.delete(streamId);
  return {
    tag: "stream-error",
    val: { tag: "last-operation-failed", val: err },
  };
}

/**
 * @param {number} streamId
 * @returns {{ stream: NodeJS.ReadableStream | NodeJS.WritableStream, flushPromise: Promise<void> | null }}
 */
function getStreamOrThrow(streamId) {
  const stream = unfinishedStreams.get(streamId);
  // not in unfinished streams <=> closed
  if (!stream) throw { tag: "stream-error", val: { tag: "closed" } };
  if (stream.stream.errored)
    throw streamError(streamId, stream, stream.stream.errored);
  if (stream.stream.closed) {
    unfinishedStreams.delete(streamId);
    throw { tag: "closed" };
  }
  return stream;
}

function subscribeInstant(instant) {
  const duration = instant - hrtime.bigint();
  if (duration <= 0) return Promise.resolve();
  return new Promise((resolve) =>
    duration < 10e6
      ? setImmediate(resolve)
      : setTimeout(resolve, Number(duration) / 1e6)
  ).then(() => {
    if (hrtime.bigint() < instant) return subscribeInstant(instant);
  });
}

/**
 * @param {number} call
 * @param {number | null} id
 * @param {any} payload
 * @returns {Promise<any>}
 */
function handle(call, id, payload) {
  switch (call) {
    // Specific call implementations
    case HTTP_CREATE_REQUEST: {
      const { method, url, headers, body } = payload;
      return createFuture(createHttpRequest(method, url, headers, body));
    }

    // Sockets
    case SOCKET_RESOLVE_ADDRESS_CREATE_REQUEST:
      return createFuture(resolve(payload.hostname));
    case SOCKET_RESOLVE_ADDRESS_DISPOSE_REQUEST:
      return void unfinishedFutures.delete(id);
    case SOCKET_RESOLVE_ADDRESS_GET_AND_DISPOSE_REQUEST: {
      const future = unfinishedFutures.get(id);
      if (!future) {
        // future not ready yet
        if (unfinishedPolls.get(id)) {
          throw 'would-block';
        }
        throw new Error("future already got and dropped");
      }
      unfinishedFutures.delete(id);
      return future;
    }
    case OUTPUT_STREAM_CREATE | SOCKET: {
      // TODO: implement
    }
    case INPUT_STREAM_CREATE | SOCKET: {
      // TODO: implement
    }

    // Stdio
    case OUTPUT_STREAM_DISPOSE | STDOUT:
    case OUTPUT_STREAM_DISPOSE | STDERR:
    case INPUT_STREAM_DISPOSE | STDIN:
      return;

    // Clocks
    case CLOCKS_NOW:
      return hrtime.bigint();
    case CLOCKS_DURATION_SUBSCRIBE:
      return createPoll(subscribeInstant(hrtime.bigint() + payload));
    case CLOCKS_INSTANT_SUBSCRIBE:
      return createPoll(subscribeInstant(payload));

    // Filesystem
    case INPUT_STREAM_CREATE | FILE: {
      const { fd, offset } = payload;
      const stream = createReadStream(null, {
        fd,
        autoClose: false,
        highWaterMark: 64 * 1024,
        start: Number(offset),
      });
      unfinishedStreams.set(++streamCnt, {
        flushPromise: null,
        stream,
      });
      // for some reason fs streams dont emit readable on end
      stream.on("end", () => void stream.emit("readable"));
      return streamCnt;
    }
    case OUTPUT_STREAM_CREATE | FILE: {
      const { fd, offset } = payload;
      const stream = createWriteStream(null, {
        fd,
        autoClose: false,
        emitClose: false,
        highWaterMark: 64 * 1024,
        start: Number(offset)
      });
      unfinishedStreams.set(++streamCnt, {
        flushPromise: null,
        stream,
      });
      return streamCnt;
    }
    // Generic call implementations (streams + polls)
    default:
      switch (call & CALL_MASK) {
        case INPUT_STREAM_READ: {
          const { stream } = getStreamOrThrow(id);
          const res = stream.read(Number(payload));
          return res ?? new Uint8Array();
        }
        case INPUT_STREAM_BLOCKING_READ:
          return Promise.resolve(
            unfinishedPolls.get(
              handle(INPUT_STREAM_SUBSCRIBE | (call & CALL_TYPE_MASK), id)
            )
          ).then(() =>
            handle(INPUT_STREAM_READ | (call & CALL_TYPE_MASK), id, payload)
          );
        case INPUT_STREAM_SKIP:
          return handle(
            INPUT_STREAM_READ | (call & CALL_TYPE_MASK),
            id,
            new Uint8Array(Number(payload))
          );
        case INPUT_STREAM_BLOCKING_SKIP:
          return handle(
            INPUT_STREAM_BLOCKING_READ | (call & CALL_TYPE_MASK),
            id,
            new Uint8Array(Number(payload))
          );
        case INPUT_STREAM_SUBSCRIBE: {
          const stream = unfinishedStreams.get(id)?.stream;
          if (id === 1) {
            // TODO: stdin subscribe
            return 0;
          }
          // already closed or errored -> immediately return poll
          // (poll 0 is immediately resolved)
          if (
            !stream ||
            stream.closed ||
            stream.errored ||
            stream.readableLength > 0
          )
            return 0;
          let resolve, reject;
          return createPoll(
            new Promise((_resolve, _reject) => {
              stream
                .once("readable", (resolve = _resolve))
                .once("error", (reject = _reject));
            }).then(
              () => void stream.off("error", reject),
              (err) => {
                stream.off("readable", resolve);
                throw streamError(id, stream.stream, err);
              }
            )
          );
        }
        case INPUT_STREAM_DISPOSE:
          unfinishedStreams.delete(id);
          return;

        case OUTPUT_STREAM_CHECK_WRITE: {
          const { stream } = getStreamOrThrow(id);
          return BigInt(stream.writableHighWaterMark - stream.writableLength);
        }
        case OUTPUT_STREAM_WRITE: {
          const { stream } = getStreamOrThrow(id);
          if (
            payload.byteLength >
            stream.writableHighWaterMark - stream.writableLength
          )
            throw new Error("wasi-io error: attempt to write too many bytes");
          return void stream.write(payload);
        }
        case OUTPUT_STREAM_BLOCKING_WRITE_AND_FLUSH: {
          const { stream, flushPromise } = getStreamOrThrow(id);
          // if an existing flush, try again after that
          if (flushPromise)
            return flushPromise.then(() => handle(call, id, payload));
          if (
            payload.byteLength >
            stream.writableHighWaterMark - stream.writableLength
          ) {
            throw streamError(
              id,
              stream,
              new Error("Cannot write more than permitted writable length")
            );
          }
          return new Promise((resolve, reject) => {
            stream.write(payload, err => {
              if (err)
               return void reject(streamError(id, stream, err));
              resolve(BigInt(payload.byteLength));
            });
          });
        }
        case OUTPUT_STREAM_FLUSH: {
          const stream = getStreamOrThrow(id);
          if (stream.flushPromise) return;
          return (stream.flushPromise = new Promise((resolve, reject) => {
            stream.stream.write(new Uint8Array([]), (err) =>
              err ? reject(streamError(id, stream.stream, err)) : resolve()
            );
          }).then(
            () => void (stream.stream.flushPromise = null),
            (err) => {
              stream.stream.flushPromise = null;
              throw streamError(id, stream.stream, err);
            }
          ));
        }
        case OUTPUT_STREAM_BLOCKING_FLUSH: {
          const { stream, flushPromise } = getStreamOrThrow(id);
          if (flushPromise) return flushPromise;
          return new Promise((resolve, reject) => {
            stream.write(new Uint8Array([]), (err) =>
              err ? reject(streamError(id, stream, err)) : resolve()
            );
          });
        }
        case OUTPUT_STREAM_WRITE_ZEROES:
          return handle(OUTPUT_STREAM_WRITE | (call & CALL_TYPE_MASK), id, new Uint8Array(Number(payload)));
        case OUTPUT_STREAM_BLOCKING_WRITE_ZEROES_AND_FLUSH:
          return handle(OUTPUT_STREAM_BLOCKING_WRITE_AND_FLUSH | (call & CALL_TYPE_MASK), id, new Uint8Array(Number(payload)));
        case OUTPUT_STREAM_SPLICE: {
          const { stream: outputStream } = getStreamOrThrow(id);
          const { stream: inputStream } = getStreamOrThrow(payload.src);
          let bytesRemaining = Number(payload.len);
          let chunk;
          while (
            bytesRemaining > 0 &&
            (chunk = inputStream.read(
              Math.min(
                outputStream.writableHighWaterMark -
                  outputStream.writableLength,
                bytesRemaining
              )
            ))
          ) {
            bytesRemaining -= chunk.byteLength;
            outputStream.write(chunk);
          }
          // TODO: these error handlers should be attached, and only for the duration of the splice flush
          if (inputStream.errored)
            throw streamError(payload.src, inputStream, inputStream.errored);
          if (outputStream.errored)
            throw streamError(id, outputStream, outputStream.errored);
          return payload.len - BigInt(bytesRemaining);
        }
        case OUTPUT_STREAM_SUBSCRIBE: {
          const { stream, flushPromise } = unfinishedStreams.get(id) ?? {};
          if (flushPromise) return flushPromise;
          // not added to unfinishedPolls => it's an immediately resolved poll
          if (
            !stream ||
            stream.closed ||
            stream.errored ||
            !stream.writableNeedDrain
          )
            return 0;
          let resolve, reject;
          return createPoll(
            new Promise((_resolve, _reject) => {
              stream
                .once("drain", (resolve = _resolve))
                .once("error", (reject = _reject));
            }).then(() => void stream.off("error", reject)),
            (err) => {
              stream.off("drain", resolve);
              throw streamError(id, stream, err);
            }
          );
        }
        case OUTPUT_STREAM_BLOCKING_SPLICE: {
          const { stream: outputStream } = getStreamOrThrow(id);
          let promise = Promise.resolve();
          let resolve, reject;
          if (outputStream.writableNeedDrain) {
            promise = new Promise((_resolve, _reject) => {
              outputStream
                .once("drain", (resolve = _resolve))
                .once("error", (reject = _reject));
            }).then(
              () => {
                outputStream.off("error", reject);
              },
              (err) => {
                outputStream.off("drain", resolve);
                throw streamError(err);
              }
            );
          }
          const { stream: inputStream } = getStreamOrThrow(payload.src);
          if (!inputStream.readable) {
            promise = promise.then(() =>
              new Promise((_resolve, _reject) => {
                inputStream
                  .once("readable", (resolve = _resolve))
                  .once("error", (reject = _reject));
              }).then(
                () => {
                  inputStream.off("error", reject);
                },
                (err) => {
                  inputStream.off("readable", resolve);
                  throw streamError(err);
                }
              )
            );
          }
          return promise.then(() => handle(OUTPUT_STREAM_SPLICE, id, payload));
        }
        case OUTPUT_STREAM_DISPOSE: {
          const stream = unfinishedStreams.get(id);
          if (stream) {
            stream.stream.end();
            unfinishedStreams.delete(id);
          }
          return;
        }

        case POLL_POLLABLE_READY:
          return !unfinishedPolls.has(id);
        case POLL_POLLABLE_BLOCK:
          payload = [id];
        // [intentional case fall-through]
        case POLL_POLL_LIST: {
          const resolvedList = payload.filter((id) => !unfinishedPolls.has(id));
          if (resolvedList.length > 0) return resolvedList;
          // if all polls are promise type, we just race them
          return Promise.race(
            payload.map((id) => unfinishedPolls.get(id))
          ).then(() => {
            const resolvedList = payload.filter(
              (id) => !unfinishedPolls.has(id)
            );
            if (resolvedList.length === 0)
              throw new Error("poll promise did not unregister poll");
            return resolvedList;
          });
        }

        case FUTURE_DISPOSE_AND_GET_VALUE: {
          const future = unfinishedFutures.get(id);
          if (!future) {
            // future not ready yet
            if (unfinishedPolls.get(id)) return undefined;
            throw new Error("future already got and dropped");
          }
          unfinishedFutures.delete(id);
          return future;
        }
        case FUTURE_DISPOSE:
          return void unfinishedFutures.delete(id);

        default:
          throw new Error(
            `Unknown call ${(call & CALL_MASK) >> CALL_SHIFT} with type ${
              call & CALL_TYPE_MASK
            }`
          );
      }
  }
}

// poll promises must always resolve and never error
// once the future is resolved, it is removed from unfinishedPolls
function createPoll(promise) {
  const pollId = ++pollCnt;
  unfinishedPolls.set(
    pollId,
    promise.then(
      () => void unfinishedPolls.delete(pollId),
      (err) => {
        process._rawDebug("Unexpected poll error");
        process._rawDebug(err);
        process.exit(1);
      }
    )
  );
  return pollId;
}

function createFuture(promise) {
  const pollId = ++pollCnt;
  unfinishedPolls.set(
    pollId,
    promise.then(
      (value) => {
        unfinishedPolls.delete(pollId);
        unfinishedFutures.set(pollId, { value, error: false });
      },
      (value) => {
        unfinishedPolls.delete(pollId);
        unfinishedFutures.set(pollId, { value, error: true });
      }
    )
  );
  return pollId;
}

async function createHttpRequest(method, url, headers, body) {
  const res = await fetch(url, {
    method,
    headers: new Headers(headers),
    body,
    redirect: "manual",
  });
  unfinishedStreams.set(++streamCnt, {
    flushPromise: null,
    stream: Readable.fromWeb(res.body),
  });
  return {
    status: res.status,
    headers: Array.from(res.headers),
    bodyStreamId: streamCnt,
  };
}

runAsWorker(handle);
