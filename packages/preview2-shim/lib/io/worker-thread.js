import { createReadStream, createWriteStream } from "node:fs";
import { hrtime, stderr, stdout } from "node:process";
import { PassThrough } from "node:stream";
import { format } from "node:util";
import { runAsWorker } from "../synckit/index.js";
import {
  clearOutgoingResponse,
  createHttpRequest,
  setOutgoingResponse,
  startHttpServer,
  stopHttpServer,
} from "./worker-http.js";
import { convertSocketError, socketResolveAddress } from "./worker-sockets.js";

import {
  CALL_MASK,
  CALL_TYPE_MASK,
  CLOCKS_DURATION_SUBSCRIBE,
  CLOCKS_INSTANT_SUBSCRIBE,
  CLOCKS_NOW,
  FILE,
  FUTURE_DISPOSE,
  FUTURE_SUBSCRIBE,
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
  POLL_POLLABLE_DISPOSE,
  POLL_POLLABLE_READY,
  POLL_POLL_LIST,
  SOCKET_RESOLVE_ADDRESS_CREATE_REQUEST,
  SOCKET_RESOLVE_ADDRESS_SUBSCRIBE_REQUEST,
  SOCKET_RESOLVE_ADDRESS_DISPOSE_REQUEST,
  SOCKET_RESOLVE_ADDRESS_GET_AND_DISPOSE_REQUEST,
  SOCKET_TCP_ACCEPT,
  SOCKET_TCP_BIND_START,
  SOCKET_TCP_BIND_FINISH,
  SOCKET_TCP_CONNECT_START,
  SOCKET_TCP_CONNECT_FINISH,
  SOCKET_TCP_CREATE_HANDLE,
  SOCKET_TCP_DISPOSE,
  SOCKET_TCP_GET_LOCAL_ADDRESS,
  SOCKET_TCP_GET_REMOTE_ADDRESS,
  SOCKET_TCP_LISTEN_START,
  SOCKET_TCP_LISTEN_FINISH,
  SOCKET_TCP_IS_LISTENING,
  SOCKET_TCP_SET_LISTEN_BACKLOG_SIZE,
  SOCKET_TCP_SUBSCRIBE,
  SOCKET_TCP_SET_KEEP_ALIVE,
  SOCKET_TCP_SHUTDOWN,
  SOCKET_UDP_BIND,
  SOCKET_UDP_CHECK_SEND,
  SOCKET_UDP_CONNECT,
  SOCKET_UDP_CREATE_HANDLE,
  SOCKET_UDP_DISCONNECT,
  SOCKET_UDP_DISPOSE,
  SOCKET_UDP_GET_LOCAL_ADDRESS,
  SOCKET_UDP_GET_REMOTE_ADDRESS,
  SOCKET_UDP_RECEIVE,
  SOCKET_UDP_SEND,
  SOCKET_UDP_SET_RECEIVE_BUFFER_SIZE,
  SOCKET_UDP_SET_SEND_BUFFER_SIZE,
  SOCKET_UDP_SET_UNICAST_HOP_LIMIT,
  STDERR,
  STDIN,
  STDOUT,
  reverseMap,
} from "./calls.js";
import {
  createTcpSocket,
  socketTcpAccept,
  socketTcpBindStart,
  socketTcpBindFinish,
  socketTcpConnectStart,
  socketTcpConnectFinish,
  socketTcpDispose,
  socketTcpGetLocalAddress,
  socketTcpGetRemoteAddress,
  socketTcpListenStart,
  socketTcpListenFinish,
  socketTcpIsListening,
  socketTcpSetListenBacklogSize,
  socketTcpSetKeepAlive,
  socketTcpShutdown,
  socketTcpSubscribe,
} from "./worker-socket-tcp.js";
import {
  SocketUdpReceive,
  createUdpSocket,
  getUdpSocketOrThrow,
  socketUdpBind,
  socketUdpCheckSend,
  socketUdpConnect,
  socketUdpDisconnect,
  socketUdpDispose,
  socketUdpSend,
} from "./worker-socket-udp.js";

function log(msg) {
  if (debug) process._rawDebug(msg);
}

let pollCnt = 0,
  streamCnt = 0,
  futureCnt = 0;

const POLL_STATE_WAIT = 1;
const POLL_STATE_READY = 2;
const POLL_STATE_FINISHED = 3;

/**
 * @typedef {{
 *   ready: POLL_STATE_UNREADY | POLL_STATE_READY | POLL_STATE_FINISHED,
 *   listener: () => void | null,
 *   polls: number[],
 * }} PollState
 *
 * @typedef {{
 *   stream: NodeJS.ReadableStream | NodeJS.WritableStream,
 *   flushPromise: Promise<void> | null,
 *   finished: bool,
 *   pollState
 * }} Stream
 *
 * @typedef {{
 *   value: any,
 *   error: bool,
 *   pollState
 * }} Future
 */

/** @type {Map<number, PollState>} */
export const polls = new Map();

/** @type {Map<number, Stream>} */
export const streams = new Map();

/** @type {Map<number, Future>} */
export const futures = new Map();

export function createReadableStreamPollState(nodeStream) {
  const pollState = { state: POLL_STATE_WAIT, listener: null, polls: [] };
  function pollReady() {
    pollStateReady(pollState, false);
  }
  function pollDone() {
    pollStateReady(pollState, true);
    nodeStream.off("readable", pollReady);
    nodeStream.off("end", pollDone);
    nodeStream.off("close", pollDone);
    nodeStream.off("error", pollDone);
    nodeStream.off("data", pollReady);
  }
  nodeStream.on("data", () => {
    process._rawDebug(" --- DATA --- ");
    pollReady();
  });
  nodeStream.on("readable", pollReady);
  nodeStream.on("end", () => pollDone);
  nodeStream.on("close", pollDone);
  nodeStream.on("error", pollDone);
  return pollState;
}

/**
 * @param {NodeJS.ReadableStream | NodeJS.WritableStream} stream
 */
export function createReadableStream(nodeStream, pollState = createReadableStreamPollState(nodeStream)) {
  const stream = {
    stream: nodeStream,
    flushPromise: null,
    finished: false,
    pollState,
  };
  streams.set(++streamCnt, stream);
  return streamCnt;
}

export function createWritableStream(nodeStream) {
  const pollState = { state: POLL_STATE_READY, listener: null, polls: [] };
  const stream = {
    stream: nodeStream,
    flushPromise: null,
    finished: false,
    pollState,
  };
  streams.set(++streamCnt, stream);
  function pollReady() {
    pollStateReady(pollState, false);
  }
  function pollDone() {
    pollStateReady(pollState, true);
    nodeStream.off("drain", pollReady);
    nodeStream.off("finish", pollDone);
    nodeStream.off("error", pollDone);
    nodeStream.off("close", pollDone);
  }
  nodeStream.on("drain", pollReady);
  nodeStream.on("finish", pollDone);
  nodeStream.on("error", pollDone);
  nodeStream.on("close", pollDone);
  return streamCnt;
}

// Stdio
// Stdin created when used
createWritableStream(stdout);
createWritableStream(stderr);

/**
 * @param {number} streamId
 * @param {NodeJS.ReadableStream | NodeJS.WritableStream} stream
 */
function streamError(err) {
  return {
    tag: "last-operation-failed",
    val: { code: err.code, message: err.message, stack: err.stack },
  };
}

/**
 * @param {number} streamId
 * @returns {{ stream: NodeJS.ReadableStream | NodeJS.WritableStream, polls: number[] }}
 */
export function getStreamOrThrow(streamId) {
  if (!streamId) throw new Error("wasi-io trap: no stream id provided");
  const stream = streams.get(streamId);
  // not in unfinished streams <=> closed
  if (!stream) throw { tag: "closed" };
  if (stream.stream.errored) throw streamError(stream.stream.errored);
  if (stream.stream.closed) {
    throw { tag: "closed" };
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
  if (uncaughtException) throw uncaughtException;
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
      return createWritableStream(stream);
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
        "wasi-io trap: HTTP output stream dispose is bypassed for FINISH"
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
      return;
    }
    case HTTP_SERVER_START:
      return startHttpServer(id, payload);
    case HTTP_SERVER_STOP:
      return stopHttpServer(id);
    case HTTP_SERVER_SET_OUTGOING_RESPONSE:
      return setOutgoingResponse(id, payload);
    case HTTP_SERVER_CLEAR_OUTGOING_RESPONSE:
      return clearOutgoingResponse(id);

    // Sockets name resolution
    case SOCKET_RESOLVE_ADDRESS_CREATE_REQUEST:
      return createFuture(socketResolveAddress(payload));
    case SOCKET_RESOLVE_ADDRESS_SUBSCRIBE_REQUEST:
      return createPoll(futures.get(id).pollState);
    case SOCKET_RESOLVE_ADDRESS_DISPOSE_REQUEST:
      return void futures.delete(id);
    case SOCKET_RESOLVE_ADDRESS_GET_AND_DISPOSE_REQUEST: {
      const future = futures.get(id);
      if (future.pollState.state === POLL_STATE_WAIT) throw "would-block";
      futures.delete(id);
      return future;
    }

    // Sockets TCP
    case SOCKET_TCP_ACCEPT:
      return socketTcpAccept(id);
    case SOCKET_TCP_CREATE_HANDLE:
      return createTcpSocket();
    case SOCKET_TCP_BIND_START:
      return socketTcpBindStart(id, payload);
    case SOCKET_TCP_BIND_FINISH:
      return socketTcpBindFinish(id);
    case SOCKET_TCP_CONNECT_START:
      return socketTcpConnectStart(id, payload);
    case SOCKET_TCP_CONNECT_FINISH:
      return socketTcpConnectFinish(id);
    case SOCKET_TCP_LISTEN_START:
      return socketTcpListenStart(id);
    case SOCKET_TCP_LISTEN_FINISH:
      return socketTcpListenFinish(id);
    case SOCKET_TCP_IS_LISTENING:
      return socketTcpIsListening(id);
    case SOCKET_TCP_SET_LISTEN_BACKLOG_SIZE:
      return socketTcpSetListenBacklogSize(id);
    case SOCKET_TCP_GET_LOCAL_ADDRESS:
      return socketTcpGetLocalAddress(id);
    case SOCKET_TCP_GET_REMOTE_ADDRESS:
      return socketTcpGetRemoteAddress(id);
    case SOCKET_TCP_SHUTDOWN:
      return socketTcpShutdown(id, payload);
    case SOCKET_TCP_SUBSCRIBE:
      return socketTcpSubscribe(id);
    case SOCKET_TCP_SET_KEEP_ALIVE:
      return socketTcpSetKeepAlive(id, payload);
    case SOCKET_TCP_DISPOSE:
      return socketTcpDispose(id);

    // Sockets UDP
    case SOCKET_UDP_CREATE_HANDLE: {
      return createUdpSocket(payload, null);
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
      const socket = getUdpSocketOrThrow(id);
      const addr = socket.address();
      addr.family = addr.family.toLowerCase();
      return addr;
    }
    case SOCKET_UDP_GET_REMOTE_ADDRESS: {
      const socket = getUdpSocketOrThrow(id);
      const addr = socket.remoteAddress();
      addr.family = addr.family.toLowerCase();
      return addr;
    }
    case SOCKET_UDP_SET_RECEIVE_BUFFER_SIZE: {
      const socket = getUdpSocketOrThrow(id);
      try {
        socket.setRecvBufferSize(Number(payload));
      } catch (err) {
        throw convertSocketError(err);
      }
    }
    case SOCKET_UDP_SET_SEND_BUFFER_SIZE: {
      const socket = getUdpSocketOrThrow(id);
      try {
        return socket.setSendBufferSize(Number(payload));
      } catch (err) {
        throw convertSocketError(err);
      }
    }
    case SOCKET_UDP_SET_UNICAST_HOP_LIMIT: {
      const socket = getUdpSocketOrThrow(id);
      try {
        return socket.setTTL(payload);
      } catch (err) {
        throw convertSocketError(err);
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
      // stream.on("end", () => void stream.emit("readable"));
      return createReadableStream(stream);
    }

    // Clocks
    case CLOCKS_NOW:
      return hrtime.bigint();
    case CLOCKS_DURATION_SUBSCRIBE:
      payload = hrtime.bigint() + payload;
    // fallthrough
    case CLOCKS_INSTANT_SUBSCRIBE: {
      const pollState = { state: POLL_STATE_WAIT, listener: null, polls: [] };
      subscribeInstant(pollState, payload);
      return createPoll(pollState);
    }

    // Filesystem
    case INPUT_STREAM_CREATE | FILE: {
      const { fd, offset } = payload;
      const stream = createReadStream(null, {
        fd,
        autoClose: false,
        highWaterMark: 64 * 1024,
        start: Number(offset),
      });
      return createReadableStream(stream);
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
      return createWritableStream(stream);
    }
  }

  // Generic call implementations (streams + polls)
  switch (call & CALL_MASK) {
    case INPUT_STREAM_READ: {
      const stream = getStreamOrThrow(id);
      if (stream.pollState.state === POLL_STATE_WAIT) return new Uint8Array();
      const res = stream.stream.read(
        Math.min(stream.stream.readableLength, Number(payload))
      );
      if (res === null) {
        if (stream.pollState.state === POLL_STATE_FINISHED) return { tag: "closed" };
        if (stream.stream.readableLength === 0)
          pollStateWait(stream.pollState, id);
        return new Uint8Array();
      }
      return res;
    }
    case INPUT_STREAM_BLOCKING_READ: {
      const { pollState } = streams.get(id);
      if (pollState.state !== POLL_STATE_WAIT)
        return handle(INPUT_STREAM_READ | (call & CALL_TYPE_MASK), id, payload);
      return new Promise((resolve) => void (pollState.listener = resolve)).then(
        () => handle(INPUT_STREAM_READ | (call & CALL_TYPE_MASK), id, payload)
      );
    }
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
    case INPUT_STREAM_SUBSCRIBE:
      return createPoll(streams.get(id).pollState);
    case INPUT_STREAM_DISPOSE: {
      const stream = streams.get(id);
      // TODO: pick this up with Alex for http_outbound_request_get
      if (!stream) return;
      verifyPollsDroppedForDrop(stream.pollState, "input stream");
      streams.delete(id);
      return;
    }
    case OUTPUT_STREAM_CHECK_WRITE: {
      const { stream, pollState } = getStreamOrThrow(id);
      const bytes = stream.writableHighWaterMark - stream.writableLength;
      if (bytes === 0) pollStateWait(pollState, id);
      return BigInt(bytes);
    }
    case OUTPUT_STREAM_WRITE: {
      const { stream } = getStreamOrThrow(id);
      if (
        payload.byteLength >
        stream.writableHighWaterMark - stream.writableLength
      )
        throw new Error("wasi-io trap: attempt to write too many bytes");
      return void stream.write(payload);
    }
    case OUTPUT_STREAM_BLOCKING_WRITE_AND_FLUSH: {
      const stream = getStreamOrThrow(id);
      // if an existing flush, try again after that
      if (stream.flushPromise)
        return stream.flushPromise.then(() => handle(call, id, payload));
      if (
        payload.byteLength >
        stream.stream.writableHighWaterMark - stream.stream.writableLength
      ) {
        new Error(
          "wasi-io trap: Cannot write more than permitted writable length"
        );
      }
      pollStateWait(stream.pollState, id);
      return (stream.flushPromise = new Promise((resolve, reject) => {
        stream.stream.write(payload, (err) => {
          stream.flushPromise = null;
          pollStateReady(stream.pollState, false);
          if (err) return void reject(streamError(err));
          resolve(BigInt(payload.byteLength));
        });
      }));
    }
    case OUTPUT_STREAM_FLUSH: {
      const stream = getStreamOrThrow(id);
      if (stream.flushPromise) return;
      pollStateWait(stream.pollState, id);
      return (stream.flushPromise = new Promise((resolve, reject) => {
        stream.stream.write(new Uint8Array([]), (err) => {
          stream.flushPromise = null;
          pollStateReady(stream.pollState, false);
          if (err) return void reject(streamError(err));
          resolve();
        });
      }));
    }
    case OUTPUT_STREAM_BLOCKING_FLUSH: {
      const stream = getStreamOrThrow(id);
      if (stream.flushPromise) return stream.flushPromise;
      return new Promise((resolve, reject) => {
        stream.stream.write(new Uint8Array([]), (err) =>
          err ? reject(streamError(err)) : resolve()
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
      const outputStream = getStreamOrThrow(id);
      const inputStream = getStreamOrThrow(payload.src);
      let bytesRemaining = Number(payload.len);
      let chunk;
      while (
        bytesRemaining > 0 &&
        (chunk = inputStream.stream.read(
          Math.min(
            outputStream.writableHighWaterMark - outputStream.writableLength,
            bytesRemaining
          )
        ))
      ) {
        bytesRemaining -= chunk.byteLength;
        outputStream.stream.write(chunk);
      }
      if (inputStream.stream.errored)
        throw streamError(inputStream.stream.errored);
      if (outputStream.stream.errored)
        throw streamError(outputStream.stream.errored);
      return payload.len - BigInt(bytesRemaining);
    }
    case OUTPUT_STREAM_SUBSCRIBE:
      return createPoll(streams.get(id).pollState);
    case OUTPUT_STREAM_BLOCKING_SPLICE: {
      const outputStream = getStreamOrThrow(id);
      let promise = Promise.resolve();
      let resolve, reject;
      if (outputStream.stream.writableNeedDrain) {
        promise = new Promise((_resolve, _reject) => {
          outputStream.stream
            .once("drain", (resolve = _resolve))
            .once("error", (reject = _reject));
        }).then(
          () => {
            outputStream.stream.off("error", reject);
          },
          (err) => {
            outputStream.stream.off("drain", resolve);
            throw streamError(err);
          }
        );
      }
      const inputStream = getStreamOrThrow(payload.src);
      if (!inputStream.stream.readable) {
        promise = promise.then(() =>
          new Promise((_resolve, _reject) => {
            inputStream.stream
              .once("readable", (resolve = _resolve))
              .once("error", (reject = _reject));
          }).then(
            () => {
              inputStream.stream.off("error", reject);
            },
            (err) => {
              inputStream.stream.off("readable", resolve);
              throw streamError(err);
            }
          )
        );
      }
      return promise.then(() => handle(OUTPUT_STREAM_SPLICE, id, payload));
    }
    case OUTPUT_STREAM_DISPOSE: {
      const stream = streams.get(id);
      verifyPollsDroppedForDrop(stream.pollState, "output stream");
      stream.stream.end();
      streams.delete(id);
      return;
    }

    case POLL_POLLABLE_READY:
      return polls.get(id).state !== POLL_STATE_WAIT;
    case POLL_POLLABLE_BLOCK:
      payload = [id];
    // [intentional case fall-through]
    case POLL_POLL_LIST: {
      const doneList = [];
      const pollList = payload.map((pollId) => polls.get(pollId));
      for (const [idx, poll] of pollList.entries()) {
        if (poll.state !== POLL_STATE_WAIT) doneList.push(idx);
      }
      if (doneList.length > 0) return new Uint32Array(doneList);
      let readyPromiseResolve;
      const readyPromise = new Promise(
        (resolve) => void (readyPromiseResolve = resolve)
      );
      for (const poll of pollList) {
        poll.listener = readyPromiseResolve;
      }
      return readyPromise.then(() => {
        for (const [idx, poll] of pollList.entries()) {
          poll.listener = null;
          if (poll.state !== POLL_STATE_WAIT) doneList.push(idx);
        }
        return new Uint32Array(doneList);
      });
    }
    case POLL_POLLABLE_DISPOSE:
      if (!polls.delete(id))
        throw new Error(
          `wasi-io trap: Disposed a poll ${id} that does not exist`
        );
      return;

    case FUTURE_GET_VALUE_AND_DISPOSE: {
      const future = futures.get(id);
      if (future.pollState.state === POLL_STATE_WAIT) throw undefined;
      return { value: future.value, error: future.error };
    }
    case FUTURE_SUBSCRIBE: {
      const future = futures.get(id);
      const pollId = ++pollCnt;
      polls.set(pollId, future.pollState);
      return pollId;
    }
    case FUTURE_DISPOSE: {
      const future = futures.get(id);
      verifyPollsDroppedForDrop(future.pollState, "future");
      return void futures.delete(id);
    }
    default:
      throw new Error(
        `wasi-io trap: Unknown call ${call} (${reverseMap[call]}) with type ${
          reverseMap[call & CALL_TYPE_MASK]
        }`
      );
  }
}

/**
 * @param {PollState} pollState
 */
export function createPoll(pollState) {
  const pollId = ++pollCnt;
  pollState.polls.push(pollId);
  polls.set(pollId, pollState);
  return pollId;
}

function subscribeInstant(pollState, instant) {
  const duration = instant - hrtime.bigint();
  if (duration <= 0) return pollStateReady(pollState, true);
  function cb() {
    if (hrtime.bigint() < instant) return subscribeInstant(pollState, instant);
    pollStateReady(pollState, true);
  }
  if (duration < 10e6) setImmediate(cb);
  else setTimeout(cb, Number(duration) / 1e6);
}

/**
 * @param {PollState} pollState
 * @param {string} polledResourceDebugName
 */
export function verifyPollsDroppedForDrop(pollState, polledResourceDebugName) {
  for (const pollId of pollState.polls) {
    const poll = polls.get(pollId);
    if (poll)
      throw new Error(
        `wasi-io trap: Cannot drop ${polledResourceDebugName} as it has a child poll resource which has not been dropped yet`
      );
  }
}

/**
 * @param {PollState} pollState
 */
export function pollStateWait(pollState, id) {
  pollState.state = POLL_STATE_WAIT;
  if (pollState.listener)
    throw new Error(
      "wasi-io trap: poll has a listener and just transitioned back to wait"
    );
}

/**
 * @param {PollState} pollState
 * @param {bool} finished
 */
export function pollStateReady(pollState, finished) {
  if (pollState.state !== POLL_STATE_WAIT) {
    if (pollState.listener)
      throw new Error(
        "wasi-io trap: poll already ready with listener attached"
      );
    return;
  }
  pollState.state = finished ? POLL_STATE_FINISHED : POLL_STATE_READY;
  if (pollState.listener) {
    pollState.listener();
    pollState.listener = null;
  }
}

export function createFuture(promise) {
  const futureId = ++futureCnt;
  const pollState = { state: POLL_STATE_WAIT, listener: null, polls: [] };
  const future = { error: false, value: null, pollState };
  futures.set(futureId, future);
  promise.then(
    (value) => {
      pollStateReady(pollState, true);
      future.value = value;
    },
    (value) => {
      pollStateReady(pollState, true);
      future.error = true;
      future.value = value;
    }
  );
  return futureId;
}

let uncaughtException;
process.on("uncaughtException", (err) => (uncaughtException = err));

// eslint-disable-next-line no-unused-vars
function trace(msg) {
  const tmpErr = new Error(format(msg));
  log(tmpErr.stack);
}

const debug = runAsWorker(handle);
