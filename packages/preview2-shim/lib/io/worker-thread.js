import { runAsWorker } from "../synckit/index.js";
import * as calls from "./calls.js";
import * as streamTypes from "./stream-types.js";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { hrtime } from "node:process";

let streamCnt = 0,
  pollCnt = 0;

/** @type {Map<number, Promise<void>>} */
const unfinishedPolls = new Map();

/** @type {Map<number, { flushPromise: Promise<void> | null, stream: NodeJS.ReadableStream | NodeJS.WritableStream, blocksMainThread: bool }>} */
const unfinishedStreams = new Map();

/** @type {Map<number, { value: any, error: bool }>} */
const unfinishedFutures = new Map();

/**
 *
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
 *
 * @param {number} streamId
 * @returns {{ stream: NodeJS.ReadableStream | NodeJS.WritableStream, flushPromise: Promise<void> | null, blocksMainThread: bool }}
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
  if (duration <= 0)
    return Promise.resolve();
  return new Promise(resolve => duration < 10e6 ? setImmediate(resolve) : setTimeout(resolve, Number(duration) / 1e6))
    .then(() => {
      if (hrtime.bigint() < instant)
        return subscribeInstant(instant);
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
    case calls.HTTP_CREATE_REQUEST: {
      const { method, url, headers, body } = payload;
      return createFuture(createHttpRequest(method, url, headers, body));
    }

    // Clocks
    case calls.CLOCKS_NOW:
      return hrtime.bigint();
    case calls.CLOCKS_DURATION_SUBSCRIBE:
      return createPoll(subscribeInstant(hrtime.bigint() + payload));
    case calls.CLOCKS_INSTANT_SUBSCRIBE:
      return createPoll(subscribeInstant(payload));

    // Stdio
    case calls.INPUT_STREAM_CREATE | streamTypes.STDIN:
      unfinishedStreams.set(++streamCnt, {
        flushPromise: null,
        stream: process.stdin,
        blocksMainThread: true,
      });
      return streamCnt;
    case calls.OUTPUT_STREAM_CREATE | streamTypes.STDOUT:
      unfinishedStreams.set(++streamCnt, {
        flushPromise: null,
        stream: process.stdout,
        blocksMainThread: true,
      });
      return streamCnt;
    case calls.OUTPUT_STREAM_CREATE | streamTypes.STDERR:
      unfinishedStreams.set(++streamCnt, {
        flushPromise: null,
        stream: process.stderr,
        blocksMainThread: true,
      });
      return streamCnt;

    // Filesystem
    case calls.INPUT_STREAM_CREATE | streamTypes.FILE: {
      const { fd, offset } = payload;
      const stream = createReadStream(null, {
        fd,
        autoClose: false,
        start: Number(offset),
      });
      // Node.js needs an initial empty read to start actually reading
      if (stream.read()) throw new Error("Internal error unexpected data");
      unfinishedStreams.set(++streamCnt, {
        flushPromise: null,
        stream,
        blocksMainThread: false,
      });
      return streamCnt;
    }
    case calls.OUTPUT_STREAM_CREATE | streamTypes.FILE:
      throw new Error("todo: file write");

    // Generic call implementations (streams + polls)
    default:
      switch (call & calls.CALL_MASK) {
        case calls.INPUT_STREAM_READ: {
          const { stream } = getStreamOrThrow(id);
          return stream.read(Number(payload)) ?? new Uint8Array();
        }
        case calls.INPUT_STREAM_BLOCKING_READ:
          return Promise.resolve(
            unfinishedPolls.get(
              handle(
                calls.INPUT_STREAM_SUBSCRIBE | (call & calls.CALL_TYPE_MASK),
                id
              )
            )
          ).then(() =>
            handle(
              calls.INPUT_STREAM_READ | (call & calls.CALL_TYPE_MASK),
              id,
              payload
            )
          );
        case calls.INPUT_STREAM_SKIP:
          return handle(
            calls.INPUT_STREAM_READ | (call & calls.CALL_TYPE_MASK),
            id,
            new Uint8Array(Number(payload))
          );
        case calls.INPUT_STREAM_BLOCKING_SKIP:
          return handle(
            calls.INPUT_STREAM_BLOCKING_READ | (call & calls.CALL_TYPE_MASK),
            id,
            new Uint8Array(Number(payload))
          );
        case calls.INPUT_STREAM_SUBSCRIBE: {
          const stream = unfinishedStreams.get(id)?.stream;
          // already closed or errored -> immediately return poll
          // (poll 0 is immediately resolved)
          if (!stream || stream.closed || stream.errored || stream.readable)
            return 0;
          let resolve, reject;
          // TODO: can we do this better with a single listener setup on stream
          // creation to track the lifecycle promise?
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
        case calls.INPUT_STREAM_DROP:
          unfinishedStreams.delete(id);
          return;

        case calls.OUTPUT_STREAM_CHECK_WRITE: {
          const { stream } = getStreamOrThrow(id);
          return BigInt(stream.writableHighWaterMark - stream.writableLength);
        }
        case calls.OUTPUT_STREAM_WRITE: {
          const { stream } = getStreamOrThrow(id);
          if (
            payload.byteLength >
            stream.writableHighWaterMark - stream.writableLength
          )
            throw new Error("wasi-io error: attempt to write too many bytes");
          return void stream.write(payload);
        }
        case calls.OUTPUT_STREAM_BLOCKING_WRITE_AND_FLUSH: {
          const { stream, blocksMainThread } = getStreamOrThrow(id);
          // if an existing flush, we will just be after that anyway
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
          // if it blocks the main thread, we can't actually blocking write and flush
          // instead we eagerly return. This is primarily for stdio. Note Node.js actually
          // provides no blocking write to stdout mechanism on Windows.
          // This can be resolved when components themselves move into workers
          if (blocksMainThread) {
            stream.write(payload);
            return;
          }
          return new Promise((resolve, reject) => {
            stream.write(payload, (err) =>
              err
                ? reject(streamError(id, stream, err))
                : resolve(BigInt(payload.byteLength))
            );
          });
        }
        case calls.OUTPUT_STREAM_FLUSH: {
          const stream = getStreamOrThrow(id);
          if (stream.flushPromise) return stream.flushPromise;
          return (stream.flushPromise = new Promise((resolve, reject) => {
            stream.stream.write(new Uint8Array([]), (err) =>
              err ? reject(streamError(id, stream, err)) : resolve()
            );
          }).then(
            () => {
              stream.stream.flushPromise = null;
            },
            (err) => {
              stream.stream.flushPromise = null;
              throw streamError(id, stream.stream, err);
            }
          ));
        }
        case calls.OUTPUT_STREAM_BLOCKING_FLUSH: {
          const { stream } = getStreamOrThrow(id);
          return new Promise((resolve, reject) => {
            stream.write(new Uint8Array([]), (err) =>
              err ? reject(streamError(id, stream, err)) : resolve()
            );
          });
        }
        case calls.OUTPUT_STREAM_WRITE_ZEROES: {
          const { stream } = getStreamOrThrow(id);
          return void stream.write(new Uint8Array(Number(payload)));
        }
        case calls.OUTPUT_STREAM_BLOCKING_WRITE_ZEROES_AND_FLUSH: {
          const { stream } = getStreamOrThrow(id);
          return new Promise((resolve, reject) => {
            stream.write(new Uint8Array(Number(payload)), (err) =>
              err
                ? reject(streamError(id, stream, err))
                : resolve(BigInt(payload.byteLength))
            );
          });
        }
        case calls.OUTPUT_STREAM_SPLICE: {
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
        case calls.OUTPUT_STREAM_SUBSCRIBE: {
          const stream = unfinishedStreams.get(id)?.stream;
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
        case calls.OUTPUT_STREAM_BLOCKING_SPLICE: {
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
          return promise.then(() =>
            handle(calls.OUTPUT_STREAM_SPLICE, id, payload)
          );
        }
        case calls.OUTPUT_STREAM_DROP: {
          const stream = unfinishedStreams.get(id);
          if (stream) {
            stream.stream.end();
            unfinishedStreams.delete(id);
          }
          return;
        }

        case calls.POLL_POLLABLE_READY:
          return !unfinishedPolls.has(id);
        case calls.POLL_POLLABLE_BLOCK:
          payload = [id];
        // [intentional case fall-through]
        case calls.POLL_POLL_LIST: {
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

        case calls.FUTURE_DROP_AND_GET_VALUE: {
          const future = unfinishedFutures.get(id);
          if (!future) throw new Error("future already got and dropped");
          unfinishedFutures.delete(id);
          return future;
        }
        case calls.FUTURE_DROP:
          return void unfinishedFutures.delete(id);

        default:
          throw new Error(
            `Unknown call ${(call & calls.CALL_MASK) >> calls.CALL_SHIFT
            } with type ${call & calls.CALL_TYPE_MASK}`
          );
      }
  }
}

// poll promises must always resolve and never error
function createPoll(promise) {
  const pollId = ++pollCnt;
  unfinishedPolls.set(
    pollId,
    promise.then(
      () => void unfinishedPolls.delete(pollId),
      () => {
        process._rawDebug("Unexpected poll error");
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
    blocksMainThread: false,
  });
  return {
    status: res.status,
    headers: Array.from(res.headers),
    bodyStreamId: streamCnt,
  };
}

runAsWorker(handle);
