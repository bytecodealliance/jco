import { resolve } from "node:dns/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { _rawDebug, exit, hrtime, stderr, stdout } from "node:process";
import { PassThrough } from "node:stream";
import { runAsWorker } from "../synckit/index.js";
import {
  clearOutgoingResponse,
  createHttpRequest,
  setOutgoingResponse,
  startHttpServer,
  stopHttpServer,
} from "./worker-http.js";

const noop = () => {};

import {
  CALL_MASK,
  CALL_SHIFT,
  CALL_TYPE_MASK,
  CLOCKS_DURATION_SUBSCRIBE,
  CLOCKS_INSTANT_SUBSCRIBE,
  CLOCKS_NOW,
  FILE,
  FUTURE_DISPOSE,
  FUTURE_GET_VALUE_AND_DISPOSE,
  HTTP,
  HTTP_CREATE_REQUEST,
  HTTP_OUTPUT_STREAM_FINISH,
  HTTP_SERVER_CLEAR_OUTGOING_RESPONSE,
  HTTP_SERVER_SET_OUTGOING_RESPONSE,
  HTTP_SERVER_START,
  HTTP_SERVER_STOP,
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
  SOCKET_TCP_BIND,
  SOCKET_TCP_CONNECT,
  SOCKET_TCP_CREATE_HANDLE,
  SOCKET_TCP_CREATE_INPUT_STREAM,
  SOCKET_TCP_CREATE_OUTPUT_STREAM,
  SOCKET_TCP_DISPOSE,
  SOCKET_TCP_GET_LOCAL_ADDRESS,
  SOCKET_TCP_GET_REMOTE_ADDRESS,
  SOCKET_TCP_LISTEN,
  SOCKET_TCP_SET_KEEP_ALIVE,
  SOCKET_TCP_SHUTDOWN,
  SOCKET_UDP_BIND,
  SOCKET_UDP_CHECK_SEND,
  SOCKET_UDP_CONNECT,
  SOCKET_UDP_CREATE_HANDLE,
  SOCKET_UDP_DISCONNECT,
  SOCKET_UDP_DISPOSE,
  SOCKET_UDP_GET_LOCAL_ADDRESS,
  SOCKET_UDP_GET_RECEIVE_BUFFER_SIZE,
  SOCKET_UDP_GET_REMOTE_ADDRESS,
  SOCKET_UDP_GET_SEND_BUFFER_SIZE,
  SOCKET_UDP_RECEIVE,
  SOCKET_UDP_SEND,
  SOCKET_UDP_SET_RECEIVE_BUFFER_SIZE,
  SOCKET_UDP_SET_SEND_BUFFER_SIZE,
  SOCKET_UDP_SET_UNICAST_HOP_LIMIT,
  STDERR,
  STDIN,
  STDOUT,
} from "./calls.js";
import {
  createTcpSocket,
  socketTcpBind,
  socketTcpConnect,
  socketTcpDispose,
  socketTcpGetLocalAddress,
  socketTcpGetRemoteAddress,
  socketTcpListen,
  socketTcpSetKeepAlive,
  socketTcpShutdown,
} from "./worker-socket-tcp.js";
import {
  SocketUdpReceive,
  createUdpSocket,
  getSocketOrThrow,
  socketUdpBind,
  socketUdpCheckSend,
  socketUdpConnect,
  socketUdpDisconnect,
  socketUdpDispose,
  socketUdpSend,
} from "./worker-socket-udp.js";

let streamCnt = 0,
  pollCnt = 0;

/** @type {Map<number, Promise<void>>} */
export const unfinishedPolls = new Map();

/** @type {Map<number, { flushPromise: Promise<void> | null, stream: NodeJS.ReadableStream | NodeJS.WritableStream }>} */
export const unfinishedStreams = new Map();

/** @type {Map<number, { value: any, error: bool }>} */
export const unfinishedFutures = new Map();

/**
 * @param {NodeJS.ReadableStream | NodeJS.WritableStream} stream
 */
export function createStream(nodeStream) {
  unfinishedStreams.set(++streamCnt, {
    flushPromise: null,
    stream: nodeStream,
  });
  return streamCnt;
}

// Stdio
// Stdin created when used
createStream(stdout);
createStream(stderr);

/**
 * @param {number} streamId
 * @param {NodeJS.ReadableStream | NodeJS.WritableStream} stream
 */
function streamError(streamId, stream, err) {
  if (typeof stream.end === "function") stream.end();
  // we delete the stream from unfinishedStreams as it is now "finished" (closed)
  unfinishedStreams.delete(streamId);
  return { tag: "last-operation-failed", val: { code: err.code, message: err.message, stack: err.stack } };
}

/**
 * @param {number} streamId
 * @returns {{ stream: NodeJS.ReadableStream | NodeJS.WritableStream, flushPromise: Promise<void> | null }}
 */
export function getStreamOrThrow(streamId) {
  if (!streamId) throw new Error("Internal error: no stream id provided");
  const stream = unfinishedStreams.get(streamId);
  // not in unfinished streams <=> closed
  if (!stream) throw { tag: "closed" };
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
    // Http
    case HTTP_CREATE_REQUEST: {
      const {
        method,
        scheme,
        authority,
        pathWithQuery,
        headers,
        body,
        connectTimeout,
        betweenBytesTimeout,
        firstByteTimeout,
      } = payload;
      return createFuture(
        createHttpRequest(
          method,
          scheme,
          authority,
          pathWithQuery,
          headers,
          body,
          connectTimeout,
          betweenBytesTimeout,
          firstByteTimeout
        )
      );
    }
    case OUTPUT_STREAM_CREATE | HTTP: {
      const stream = new PassThrough();
      // content length is passed as payload
      stream.contentLength = payload;
      stream.bytesRemaining = payload;
      return createStream(stream);
    }
    case OUTPUT_STREAM_SUBSCRIBE | HTTP:
    case OUTPUT_STREAM_FLUSH | HTTP:
    case OUTPUT_STREAM_BLOCKING_WRITE_AND_FLUSH | HTTP: {
      // http flush is a noop
      const { stream } = getStreamOrThrow(id);
      if (call === (OUTPUT_STREAM_BLOCKING_WRITE_AND_FLUSH | HTTP)) {
        stream.bytesRemaining -= payload.byteLength;
        if (stream.bytesRemaining < 0) {
          throw {
            tag: "last-operation-failed",
            val: {
              tag: "HTTP-request-body-size",
              val: stream.contentLength - stream.bytesRemaining,
            },
          };
        }
      }
      // otherwise fall through to generic implementation
      return handle(call & ~HTTP, id, payload);
    }
    case OUTPUT_STREAM_DISPOSE | HTTP:
      throw new Error(
        "Internal error: HTTP output stream dispose is bypassed for FINISH"
      );
    case OUTPUT_STREAM_WRITE | HTTP: {
      const { stream } = getStreamOrThrow(id);
      stream.bytesRemaining -= payload.byteLength;
      if (stream.bytesRemaining < 0) {
        throw {
          tag: "last-operation-failed",
          val: {
            tag: "HTTP-request-body-size",
            val: stream.contentLength - stream.bytesRemaining,
          },
        };
      }
      const output = handle(OUTPUT_STREAM_WRITE, id, payload);
      return output;
    }
    case HTTP_OUTPUT_STREAM_FINISH: {
      const { stream } = getStreamOrThrow(id);
      if (stream.bytesRemaining > 0) {
        throw {
          tag: "HTTP-request-body-size",
          val: stream.contentLength - stream.bytesRemaining,
        };
      }
      if (stream.bytesRemaining < 0) {
        throw {
          tag: "HTTP-request-body-size",
          val: stream.contentLength - stream.bytesRemaining,
        };
      }
      stream.end();
      break;
    }
    case HTTP_SERVER_START:
      return startHttpServer(id, payload);
    case HTTP_SERVER_STOP:
      return stopHttpServer(id);
    case HTTP_SERVER_SET_OUTGOING_RESPONSE:
      return setOutgoingResponse(id, payload);
    case HTTP_SERVER_CLEAR_OUTGOING_RESPONSE:
      return clearOutgoingResponse(id);

    // Sockets TCP
    case SOCKET_TCP_CREATE_HANDLE:
      return createFuture(createTcpSocket());

    case SOCKET_TCP_BIND:
      return socketTcpBind(id, payload);

    case SOCKET_TCP_CONNECT:
      return socketTcpConnect(id, payload);

    case SOCKET_TCP_LISTEN:
      return socketTcpListen(id, payload);

    case SOCKET_TCP_GET_LOCAL_ADDRESS:
      return socketTcpGetLocalAddress(id);

    case SOCKET_TCP_GET_REMOTE_ADDRESS:
      return socketTcpGetRemoteAddress(id);

    case SOCKET_TCP_SHUTDOWN:
      return socketTcpShutdown(id, payload);

    case SOCKET_TCP_SET_KEEP_ALIVE:
      return socketTcpSetKeepAlive(id, payload);

    case SOCKET_TCP_DISPOSE:
      return socketTcpDispose(id);

    case SOCKET_TCP_CREATE_INPUT_STREAM:
    case SOCKET_TCP_CREATE_OUTPUT_STREAM:
      return createStream(new PassThrough());

    // Sockets UDP
    case SOCKET_UDP_CREATE_HANDLE: {
      const { addressFamily, reuseAddr } = payload;
      return createFuture(createUdpSocket(addressFamily, reuseAddr));
    }

    case SOCKET_UDP_BIND:
      return socketUdpBind(id, payload);

    case SOCKET_UDP_CHECK_SEND:
      return socketUdpCheckSend(id);

    case SOCKET_UDP_SEND:
      return socketUdpSend(id, payload);

    case SOCKET_UDP_RECEIVE:
      return SocketUdpReceive(id, payload);

    case SOCKET_UDP_CONNECT:
      return socketUdpConnect(id, payload);

    case SOCKET_UDP_DISCONNECT:
      return socketUdpDisconnect(id);

    case SOCKET_UDP_GET_LOCAL_ADDRESS: {
      const socket = getSocketOrThrow(id);
      return Promise.resolve(socket.address());
    }

    case SOCKET_UDP_GET_REMOTE_ADDRESS: {
      const socket = getSocketOrThrow(id);
      return Promise.resolve(socket.remoteAddress());
    }

    case SOCKET_RESOLVE_ADDRESS_CREATE_REQUEST:
      return createFuture(resolve(payload.hostname));

    case SOCKET_RESOLVE_ADDRESS_DISPOSE_REQUEST:
      return void unfinishedFutures.delete(id);

    case SOCKET_RESOLVE_ADDRESS_GET_AND_DISPOSE_REQUEST: {
      const future = unfinishedFutures.get(id);
      if (!future) {
        // future not ready yet
        if (unfinishedPolls.get(id)) {
          throw "would-block";
        }
        throw new Error("future already got and dropped");
      }
      unfinishedFutures.delete(id);
      return future;
    }

    case SOCKET_UDP_GET_RECEIVE_BUFFER_SIZE: {
      const socket = getSocketOrThrow(id);
      try {
        return socket.getRecvBufferSize();
      } catch (err) {
        return err.errno;
      }
    }

    case SOCKET_UDP_SET_RECEIVE_BUFFER_SIZE: {
      const socket = getSocketOrThrow(id);
      try {
        return socket.setRecvBufferSize(65537);
      } catch (err) {
        return err.errno;
      }
    }

    case SOCKET_UDP_GET_SEND_BUFFER_SIZE: {
      const socket = getSocketOrThrow(id);
      try {
        return socket.getSendBufferSize();
      } catch (err) {
        return err.errno;
      }
    }

    case SOCKET_UDP_SET_SEND_BUFFER_SIZE: {
      const socket = getSocketOrThrow(id);
      try {
        return socket.setSendBufferSize(payload.value);
      } catch (err) {
        return err.errno;
      }
    }

    case SOCKET_UDP_SET_UNICAST_HOP_LIMIT: {
      const socket = getSocketOrThrow(id);
      try {
        return socket.setTTL(payload.value);
      } catch (err) {
        return err.errno;
      }
    }

    case SOCKET_UDP_DISPOSE:
      return socketUdpDispose(id);

    // Stdio
    case OUTPUT_STREAM_BLOCKING_FLUSH | STDOUT:
    case OUTPUT_STREAM_BLOCKING_FLUSH | STDERR:
      // no blocking flush for stdio in Node.js
      return;
    case OUTPUT_STREAM_DISPOSE | STDOUT:
    case OUTPUT_STREAM_DISPOSE | STDERR:
      return;
    case INPUT_STREAM_CREATE | STDIN: {
      const stream = createReadStream(null, {
        fd: 0,
        highWaterMark: 64 * 1024,
      });
      // for some reason fs streams dont emit readable on end
      stream.on("end", () => void stream.emit("readable"));
      return createStream(stream);
    }

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
      // for some reason fs streams dont emit readable on end
      stream.on("end", () => void stream.emit("readable"));
      return createStream(stream);
    }
    case OUTPUT_STREAM_CREATE | FILE: {
      const { fd, offset } = payload;
      const stream = createWriteStream(null, {
        fd,
        autoClose: false,
        emitClose: false,
        highWaterMark: 64 * 1024,
        start: Number(offset),
      });
      return createStream(stream);
    }
    // Generic call implementations (streams + polls)
    default:
      switch (call & CALL_MASK) {
        case INPUT_STREAM_READ: {
          const { stream } = getStreamOrThrow(id);
          const res = stream.read(
            Math.min(stream.readableLength, Number(payload))
          );
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
              // error is read of stream itself when later accessed
              (_err) => void stream.off("readable", resolve)
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
            stream.once("error", noop);
            stream.write(payload, (err) => {
              if (err) return void reject(streamError(id, stream, err));
              stream.off("error", noop);
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
          return handle(
            OUTPUT_STREAM_WRITE | (call & CALL_TYPE_MASK),
            id,
            new Uint8Array(Number(payload))
          );
        case OUTPUT_STREAM_BLOCKING_WRITE_ZEROES_AND_FLUSH:
          return handle(
            OUTPUT_STREAM_BLOCKING_WRITE_AND_FLUSH | (call & CALL_TYPE_MASK),
            id,
            new Uint8Array(Number(payload))
          );
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
          if (flushPromise)
            return flushPromise.then(() => handle(call, id, payload));
          // not added to unfinishedPolls => it's an immediately resolved poll
          if (!stream || stream.closed || stream.errored) return 0;
          if (!stream.writableNeedDrain)
            return createPoll(new Promise((resolve) => setTimeout(resolve)));
          let resolve, reject;
          return createPoll(
            new Promise((_resolve, _reject) => {
              stream
                .once("drain", (resolve = _resolve))
                .once("error", (reject = _reject));
            }).then(() => void stream.off("error", reject)),
            // error is read off stream itself when later accessed
            (_err) => void stream.off("drain", resolve)
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
          const doneList = [];
          for (const [idx, id] of payload.entries()) {
            if (!unfinishedPolls.has(id)) doneList.push(idx);
          }
          if (doneList.length > 0) return new Uint32Array(doneList);
          // if all polls are promise type, we just race them
          return Promise.race(
            payload.map((id) => unfinishedPolls.get(id))
          ).then(() => {
            for (const [idx, id] of payload.entries()) {
              if (!unfinishedPolls.has(id)) doneList.push(idx);
            }
            if (doneList.length === 0)
              throw new Error("poll promise did not unregister poll");
            return new Uint32Array(doneList);
          });
        }

        case FUTURE_GET_VALUE_AND_DISPOSE: {
          const future = unfinishedFutures.get(id);
          if (!future) {
            // future not ready yet
            if (unfinishedPolls.get(id)) throw undefined;
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
export function createPoll(promise) {
  const pollId = ++pollCnt;
  unfinishedPolls.set(
    pollId,
    promise.then(
      () => void unfinishedPolls.delete(pollId),
      (err) => {
        _rawDebug("Unexpected poll error");
        _rawDebug(err);
        exit(1);
      }
    )
  );
  return pollId;
}

export function createFuture(promise) {
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

runAsWorker(handle);
