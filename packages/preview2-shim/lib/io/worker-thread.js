import { runAsWorker } from '../synckit/index.js';
import * as calls from './calls.js';
import * as streamTypes from './stream-types.js';
import * as fs from 'node:fs';
import { hrtime } from 'node:process';

let streamCnt = 0, pollCnt = 0;

const PollType = {
  Promise: 1,
  Instant: 2,
};

/** @typedef {
 *    { type: number, promise: Promise<void> } |
 *    { type: number, instant: BigInt }
 *  } Poll */

/** @type {Map<number, Poll} */
const unfinishedPolls = new Map();

/** @type {Map<number, { flushPromise: Promise<void> | null, stream: NodeJS.ReadableStream | NodeJS.WritableStream, blocksMainThread: bool }>} */
const unfinishedStreams = new Map();

/**
 * 
 * @param {number} streamId 
 * @param {NodeJS.ReadableStream | NodeJS.WritableStream} stream 
 */
function streamError (streamId, stream, err) {
  if (stream.end)
    stream.end();
  // we delete the stream from unfinishedStreams as it is now "finished" (closed)
  unfinishedStreams.delete(streamId);
  return {
    tag: 'stream-error',
    val: { tag: 'last-operation-failed', val: err }
  };
}

/**
 * 
 * @param {number} streamId 
 * @returns {{ stream: NodeJS.ReadableStream | NodeJS.WritableStream, flushPromise: Promise<void> | null, blocksMainThread: bool }}
 */
function getStreamOrThrow (streamId) {
  const stream = unfinishedStreams.get(streamId);
  // not in unfinished streams <=> closed
  if (!stream)
    throw { tag: 'stream-error', val: { tag: 'closed' } };
  if (stream.stream.errored)
    throw streamError(streamId, stream, stream.stream.errored);
  if (stream.stream.closed) {
    unfinishedStreams.delete(streamId);
    throw { tag: 'closed' };
  }
  return stream;
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
    case calls.HTTP_CREATE_REQUEST: return createHttpRequest(payload);

    // Clocks
    case calls.CLOCKS_DURATION_SUBSCRIBE: {
      const instant = hrtime.bigint() + payload;
      unfinishedPolls.set(++pollCnt, { type: PollType.Instant, instant });
      return pollCnt;
    }
    
    // Stdio
    case calls.INPUT_STREAM_CREATE | streamTypes.STDIN:
      unfinishedStreams.set(++streamCnt, {
        flushPromise: null,
        stream: process.stdin,
        blocksMainThread: true
      });
      return streamCnt;
    case calls.OUTPUT_STREAM_CREATE | streamTypes.STDOUT:
      unfinishedStreams.set(++streamCnt, {
        flushPromise: null,
        stream: process.stdout,
        blocksMainThread: true
      });
      return streamCnt;
    case calls.OUTPUT_STREAM_CREATE | streamTypes.STDERR:
      unfinishedStreams.set(++streamCnt, {
        flushPromise: null,
        stream: process.stderr,
        blocksMainThread: true
      });
      return streamCnt;

    // Filesystem
    case calls.INPUT_STREAM_CREATE | streamTypes.FILE: {
      const { fd, offset } = payload;
      const stream = fs.createReadStream(null, { fd, autoClose: false, start: Number(offset) });
      // Node.js needs an initial empty read to start actually reading
      if (stream.read())
        throw new Error('Internal error unexpected data');
      unfinishedStreams.set(++streamCnt, {
        flushPromise: null,
        stream,
        blocksMainThread: false,
      });
      return streamCnt;
    }
    case calls.OUTPUT_STREAM_CREATE | streamTypes.FILE:
      throw new Error('todo: file write');

    // Generic call implementations (streams + polls)
    default: switch (call & calls.CALL_MASK) {
      case calls.INPUT_STREAM_READ: {
        const { stream } = getStreamOrThrow(id);
        return stream.read(Number(payload)) ?? new Uint8Array();
      }
      case calls.INPUT_STREAM_BLOCKING_READ:
        return Promise.resolve(
          unfinishedPolls.get(handle(calls.INPUT_STREAM_SUBSCRIBE | (call & calls.CALL_TYPE_MASK), id))?.promise
        )
        .then(() => handle(calls.INPUT_STREAM_READ | (call & calls.CALL_TYPE_MASK), id, payload));
      case calls.INPUT_STREAM_SKIP:
        return handle(calls.INPUT_STREAM_READ | (call & calls.CALL_TYPE_MASK), id, new Uint8Array(Number(payload)));
      case calls.INPUT_STREAM_BLOCKING_SKIP:
        return handle(calls.INPUT_STREAM_BLOCKING_READ | (call & calls.CALL_TYPE_MASK), id, new Uint8Array(Number(payload)));
      case calls.INPUT_STREAM_SUBSCRIBE: {
        const stream = unfinishedStreams.get(id)?.stream;
        // already closed or errored -> immediately return poll
        // (poll 0 is immediately resolved)
        if (!stream || stream.closed || stream.errored || stream.readable) return 0;
        let resolve, reject;
        // TODO: can we do this better with a single listener setup on stream
        // creation to track the lifecycle promise?
        unfinishedPolls.set(++pollCnt, {
          type: PollType.Promise,
          promise: new Promise((_resolve, _reject) => {
            stream
              .once('readable', resolve = _resolve)
              .once('error', reject = _reject);
          }).then(() => {
            unfinishedPolls.delete(pollCnt);
            stream.off('error', reject);
          }, err => {
            stream.off('readable', resolve);
            unfinishedPolls.delete(pollCnt);
            throw streamError(id, stream.stream, err);
          })
        });
        return pollCnt;
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
        if (payload.byteLength > stream.writableHighWaterMark - stream.writableLength)
          throw new Error('wasi-io error: attempt to write too many bytes');
        return void stream.write(payload);
      }
      case calls.OUTPUT_STREAM_BLOCKING_WRITE_AND_FLUSH: {
        const { stream, blocksMainThread } = getStreamOrThrow(id);
        // if an existing flush, we will just be after that anyway
        if (payload.byteLength > stream.writableHighWaterMark - stream.writableLength) {
          throw streamError(id, stream, new Error('Cannot write more than permitted writable length'));
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
          stream.write(payload, err => err
              ? reject(streamError(id, stream, err))
              : resolve(BigInt(payload.byteLength))
          );
        });
      }
      case calls.OUTPUT_STREAM_FLUSH: {
        const stream = getStreamOrThrow(id);
        if (stream.flushPromise) return stream.flushPromise;
        return stream.flushPromise = new Promise((resolve, reject) => {
          stream.stream.write(new Uint8Array([]), err => err ? reject(streamError(id, stream, err)) : resolve());
        }).then(() => {
          stream.stream.flushPromise = null;
        }, err => {
          stream.stream.flushPromise = null;
          throw streamError(id, stream.stream, err);
        });
      }
      case calls.OUTPUT_STREAM_BLOCKING_FLUSH: {
        const { stream } = getStreamOrThrow(id);
        return new Promise((resolve, reject) => {
          stream.write(new Uint8Array([]), err => err ? reject(streamError(id, stream, err)) : resolve());
        });
      }
      case calls.OUTPUT_STREAM_WRITE_ZEROES: {
        const { stream } = getStreamOrThrow(id);
        return void stream.write(new Uint8Array(Number(payload)));
      }
      case calls.OUTPUT_STREAM_BLOCKING_WRITE_ZEROES_AND_FLUSH: {
        const { stream } = getStreamOrThrow(id);
        return new Promise((resolve, reject) => {
          stream.write(new Uint8Array(Number(payload)), err => err
            ? reject(streamError(id, stream, err))
            : resolve(BigInt(payload.byteLength))
          )
        });
      }
      case calls.OUTPUT_STREAM_SPLICE: {
        const { stream: outputStream } = getStreamOrThrow(id);
        const { stream: inputStream } = getStreamOrThrow(payload.src);
        let bytesRemaining = Number(payload.len);
        let chunk;
        while (bytesRemaining > 0 && (chunk = inputStream.read(Math.min(outputStream.writableHighWaterMark - outputStream.writableLength, bytesRemaining)))) {
          bytesRemaining -= chunk.byteLength;
          outputStream.write(chunk);
        }
        // TODO: these error handlers should be attached, and only for the duration of the splice flush
        if (inputStream.errored) {
          streamError(payload.src, inputStream, inputStream.errored); // error ignored?
          throw streamError(id, outputStream, inputStream.errored);
        }
        if (outputStream.errored) {
          // input stream not closed?
          throw streamError(id, outputStream, outputStream.errored);
        }
        return payload.len - BigInt(bytesRemaining);
      }
      case calls.OUTPUT_STREAM_SUBSCRIBE: {
        const stream = unfinishedStreams.get(id)?.stream;
        // not added to unfinishedPolls => it's an immediately resolved poll
        if (!stream || stream.closed || stream.errored || !stream.writableNeedDrain)
          return 0;
        let resolve, reject;
        unfinishedPolls.set(++pollCnt, {
          type: PollType.Promise,
          promise: new Promise((_resolve, _reject) => {
            stream
              .once('drain', resolve = _resolve)
              .once('error', reject = _reject);
          }).then(() => {
            unfinishedPolls.delete(pollCnt);
            stream.off('error', reject);
          }, err => {
            stream.off('drain', resolve);
            unfinishedPolls.delete(pollCnt);
            throw streamError(id, stream, err);
          })
        });
        return pollCnt;
      }
      case calls.OUTPUT_STREAM_BLOCKING_SPLICE: {
        const { stream: outputStream } = getStreamOrThrow(id);
        let promise = Promise.resolve();
        let resolve, reject;
        if (outputStream.writableNeedDrain) {
          promise = new Promise((_resolve, _reject) => {
            outputStream
              .once('drain', resolve = _resolve)
              .once('error', reject = _reject);
          }).then(
            () => {
              outputStream.off('error', reject);
            },
            err => {
              outputStream.off('drain', resolve);
              throw streamError(err);
            }
          );
        }
        const { stream: inputStream } = getStreamOrThrow(payload.src);
        if (!inputStream.readable) {
          promise = promise
            .then(() => new Promise((_resolve, _reject) => {
              inputStream
                .once('readable', resolve = _resolve)
                .once('error', reject = _reject);
            }).then(
              () => {
                inputStream.off('error', reject);
              },
              err => {
                inputStream.off('readable', resolve);
                throw streamError(err);
              }
            ));
        }
        return promise.then(() => handle(calls.OUTPUT_STREAM_SPLICE, id, payload));
      }
      case calls.OUTPUT_STREAM_DROP: {
        const stream = unfinishedStreams.get(id);
        if (stream) {
          stream.stream.end();
          unfinishedStreams.delete(id);
        }
        return;
      }

      case calls.POLL_POLLABLE_READY: {
        const poll = unfinishedPolls.get(id);
        if (!poll) return true;
        if (handlePollType(poll)) {
          unfinishedPolls.delete(id);
          return true;
        }
        return false;
      }
      case calls.POLL_POLLABLE_BLOCK:
        payload = [id];
        // [intentional case fall-through]
      case calls.POLL_POLL_LIST: {
        const resolvedList = payload.filter(id => !unfinishedPolls.has(id));
        if (resolvedList.length > 0)
          return resolvedList;
        // if all polls are promise type, we just race them
        const polls = payload.map(id => unfinishedPolls.get(id));
        if (polls.every(poll => poll.type === PollType.Promise))
          return Promise.race(polls.map(poll => poll.promise))
            .then(() => {
              const resolvedList = payload.filter(id => !unfinishedPolls.has(id));
              if (resolvedList.length === 0) throw new Error('unexpected non-poll resolution for poll list');
              return resolvedList;
            });
        // otherwise we run a tight loop for both the promise & non-promise handlers
        // with set immediate to handle microtask clearing for promise resolutions
        // this then ensures that eg duration polls give accurate timing
        return Promise.resolve()
          .then(async () => {
            while (true) {
              for (const id of payload) {
                const poll = unfinishedPolls.get(id);
                if (!poll)
                  return payload.filter(id => !unfinishedPolls.has(id));
                if (handlePollType(poll)) {
                  unfinishedPolls.delete(id);
                  return [id];
                }
              }
              await new Promise(resolve => setImmediate(resolve));
            }
          });
      }

      default:
        throw new Error(`Unknown call ${(call & calls.CALL_MASK) >> calls.CALL_SHIFT} with type ${call & calls.CALL_TYPE_MASK}`);
    }
  }
}

function handlePollType (poll) {
  switch (poll.type) {
    case PollType.Promise:
      break;
    case PollType.Instant:
      if (poll.instant <= hrtime.bigint())
        return true;
      break;
    default:
      throw new Error(`unknown poll type ${poll.type}`);
  }
  return false;
}

async function createHttpRequest (req) {
  let headers = new Headers(req.headers);
  const resp = await fetch(req.uri, {
    method: req.method.toString(),
    headers,
    body: req.body && req.body.length > 0 ? req.body : undefined,
    redirect: "manual",
  });
  let arrayBuffer = await resp.arrayBuffer();
  return JSON.stringify({
    status: resp.status,
    headers: Array.from(resp.headers),
    body:
      arrayBuffer.byteLength > 0
        ? Buffer.from(arrayBuffer).toString("base64")
        : undefined,
  });
}

runAsWorker(handle);
