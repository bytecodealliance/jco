import { createReadStream, createWriteStream } from 'node:fs';
import { hrtime, stderr, stdout } from 'node:process';
import { PassThrough } from 'node:stream';
import { runAsWorker } from '../synckit/index.js';
import {
    clearOutgoingResponse,
    createHttpRequest,
    setOutgoingResponse,
    startHttpServer,
    stopHttpServer,
    getHttpServerAddress,
} from './worker-http.js';
import { Readable } from 'node:stream';
import { read } from 'node:fs';
import { nextTick } from 'node:process';
import {
    CALL_MASK,
    CALL_TYPE_MASK,
    CLOCKS_DURATION_SUBSCRIBE,
    CLOCKS_INSTANT_SUBSCRIBE,
    FILE,
    FUTURE_DISPOSE,
    FUTURE_SUBSCRIBE,
    FUTURE_TAKE_VALUE,
    HTTP,
    HTTP_CREATE_REQUEST,
    HTTP_OUTGOING_BODY_DISPOSE,
    HTTP_OUTPUT_STREAM_FINISH,
    HTTP_SERVER_CLEAR_OUTGOING_RESPONSE,
    HTTP_SERVER_SET_OUTGOING_RESPONSE,
    HTTP_SERVER_START,
    HTTP_SERVER_STOP,
    HTTP_SERVER_GET_ADDRESS,
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
    SOCKET_RESOLVE_ADDRESS_TAKE_REQUEST,
    SOCKET_GET_DEFAULT_RECEIVE_BUFFER_SIZE,
    SOCKET_GET_DEFAULT_SEND_BUFFER_SIZE,
    SOCKET_TCP_ACCEPT,
    SOCKET_TCP_BIND_FINISH,
    SOCKET_TCP_BIND_START,
    SOCKET_TCP_CONNECT_FINISH,
    SOCKET_TCP_CONNECT_START,
    SOCKET_TCP_CREATE_HANDLE,
    SOCKET_TCP_DISPOSE,
    SOCKET_TCP_GET_LOCAL_ADDRESS,
    SOCKET_TCP_GET_REMOTE_ADDRESS,
    SOCKET_TCP_IS_LISTENING,
    SOCKET_TCP_LISTEN_FINISH,
    SOCKET_TCP_LISTEN_START,
    SOCKET_TCP_SET_KEEP_ALIVE,
    SOCKET_TCP_SET_LISTEN_BACKLOG_SIZE,
    SOCKET_TCP_SHUTDOWN,
    SOCKET_TCP_SUBSCRIBE,
    SOCKET_UDP_BIND_FINISH,
    SOCKET_UDP_BIND_START,
    SOCKET_UDP_CREATE_HANDLE,
    SOCKET_UDP_DISPOSE,
    SOCKET_UDP_GET_LOCAL_ADDRESS,
    SOCKET_UDP_GET_RECEIVE_BUFFER_SIZE,
    SOCKET_UDP_GET_REMOTE_ADDRESS,
    SOCKET_UDP_GET_SEND_BUFFER_SIZE,
    SOCKET_UDP_GET_UNICAST_HOP_LIMIT,
    SOCKET_UDP_SET_RECEIVE_BUFFER_SIZE,
    SOCKET_UDP_SET_SEND_BUFFER_SIZE,
    SOCKET_UDP_SET_UNICAST_HOP_LIMIT,
    SOCKET_UDP_STREAM,
    SOCKET_UDP_SUBSCRIBE,
    SOCKET_INCOMING_DATAGRAM_STREAM_RECEIVE,
    SOCKET_OUTGOING_DATAGRAM_STREAM_CHECK_SEND,
    SOCKET_OUTGOING_DATAGRAM_STREAM_SEND,
    SOCKET_DATAGRAM_STREAM_SUBSCRIBE,
    SOCKET_DATAGRAM_STREAM_DISPOSE,
    STDERR,
    STDIN,
    STDOUT,
    reverseMap,
} from './calls.js';
import {
    SOCKET_STATE_BIND,
    SOCKET_STATE_BOUND,
    SOCKET_STATE_CONNECT,
    SOCKET_STATE_CONNECTION,
    SOCKET_STATE_LISTEN,
    SOCKET_STATE_LISTENER,
    socketResolveAddress,
    getDefaultSendBufferSize,
    getDefaultReceiveBufferSize,
} from './worker-sockets.js';
import {
    createTcpSocket,
    socketTcpAccept,
    socketTcpBindStart,
    socketTcpConnectStart,
    socketTcpDispose,
    socketTcpFinish,
    socketTcpGetLocalAddress,
    socketTcpGetRemoteAddress,
    socketTcpListenStart,
    socketTcpSetKeepAlive,
    socketTcpSetListenBacklogSize,
    socketTcpShutdown,
    tcpSockets,
} from './worker-socket-tcp.js';
import {
    createUdpSocket,
    datagramStreams,
    socketDatagramStreamDispose,
    socketIncomingDatagramStreamReceive,
    socketOutgoingDatagramStreamCheckSend,
    socketOutgoingDatagramStreamSend,
    socketUdpBindFinish,
    socketUdpBindStart,
    socketUdpDispose,
    socketUdpGetLocalAddress,
    socketUdpGetReceiveBufferSize,
    socketUdpGetRemoteAddress,
    socketUdpGetSendBufferSize,
    socketUdpGetUnicastHopLimit,
    socketUdpSetReceiveBufferSize,
    socketUdpSetSendBufferSize,
    socketUdpSetUnicastHopLimit,
    socketUdpStream,
    udpSockets,
} from './worker-socket-udp.js';
import process from 'node:process';

export function log(msg) {
    if (debug) {
        process._rawDebug(msg);
    }
}

let pollCnt = 0,
    streamCnt = 0,
    futureCnt = 0;

/**
 * @typedef {{
 *   ready: bool,
 *   listener: () => void | null,
 *   polls: number[],
 *   parentStream: null | NodeJS.ReadableStream
 * }} PollState
 *
 * @typedef {{
 *   stream: NodeJS.ReadableStream | NodeJS.WritableStream,
 *   flushPromise: Promise<void> | null,
 *   pollState
 * }} Stream
 *
 * @typedef {{
 *   future: {
 *     tag: 'ok' | 'err',
 *     val: any,
 *   },
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
    const pollState = {
        ready: true,
        listener: null,
        polls: [],
        parentStream: nodeStream,
    };
    function pollDone() {
        pollStateReady(pollState);
        nodeStream.off('end', pollDone);
        nodeStream.off('close', pollDone);
        nodeStream.off('error', pollDone);
    }
    nodeStream.on('end', pollDone);
    nodeStream.on('close', pollDone);
    nodeStream.on('error', pollDone);
    return pollState;
}

/**
 * @param {NodeJS.ReadableStream | NodeJS.WritableStream} stream
 */
export function createReadableStream(
    nodeStream,
    pollState = createReadableStreamPollState(nodeStream)
) {
    const stream = {
        stream: nodeStream,
        flushPromise: null,
        pollState,
    };
    streams.set(++streamCnt, stream);
    return streamCnt;
}

export function createWritableStream(nodeStream) {
    const pollState = {
        ready: true,
        listener: null,
        polls: [],
        parentStream: null,
    };
    const stream = {
        stream: nodeStream,
        flushPromise: null,
        pollState,
    };
    streams.set(++streamCnt, stream);
    function pollReady() {
        pollStateReady(pollState);
    }
    function pollDone() {
        pollStateReady(pollState);
        nodeStream.off('drain', pollReady);
        nodeStream.off('finish', pollDone);
        nodeStream.off('error', pollDone);
        nodeStream.off('close', pollDone);
    }
    nodeStream.on('drain', pollReady);
    nodeStream.on('finish', pollDone);
    nodeStream.on('error', pollDone);
    nodeStream.on('close', pollDone);
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
        tag: 'last-operation-failed',
        val: { code: err.code, message: err.message, stack: err.stack },
    };
}

/**
 * @param {number} streamId
 * @returns {{ stream: NodeJS.ReadableStream | NodeJS.WritableStream, polls: number[] }}
 */
export function getStreamOrThrow(streamId) {
    if (!streamId) {
        throw new Error('wasi-io trap: no stream id provided');
    }
    const stream = streams.get(streamId);
    // not in unfinished streams <=> closed
    if (!stream) {
        throw { tag: 'closed' };
    }
    if (stream.stream.errored) {
        throw streamError(stream.stream.errored);
    }
    if (stream.stream.closed) {
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
    if (uncaughtException) {
        throw uncaughtException;
    }
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
                    tag: 'last-operation-failed',
                    val: {
                        tag: 'HTTP-request-body-size',
                        val: stream.contentLength - stream.bytesRemaining,
                    },
                };
            }
        }
        // otherwise fall through to generic implementation
        return handle(call & ~HTTP, id, payload);
    }
    case OUTPUT_STREAM_WRITE | HTTP: {
        const { stream } = getStreamOrThrow(id);
        stream.bytesRemaining -= payload.byteLength;
        if (stream.bytesRemaining < 0) {
            throw {
                tag: 'last-operation-failed',
                val: {
                    tag: 'HTTP-request-body-size',
                    val: stream.contentLength - stream.bytesRemaining,
                },
            };
        }
        const output = handle(OUTPUT_STREAM_WRITE, id, payload);
        return output;
    }
    case OUTPUT_STREAM_DISPOSE | HTTP:
        throw new Error(
            'wasi-io trap: Output stream dispose not implemented as an IO-call for HTTP'
        );
    case HTTP_OUTPUT_STREAM_FINISH: {
        let stream;
        try {
            ({ stream } = getStreamOrThrow(id));
        } catch (e) {
            if (e.tag === 'closed') {
                throw { tag: 'internal-error', val: 'stream closed' };
            }
            if (e.tag === 'last-operation-failed') {
                throw { tag: 'internal-error', val: e.val.message };
            }
        }
        if (stream.bytesRemaining > 0) {
            throw {
                tag: 'HTTP-request-body-size',
                val: stream.contentLength - stream.bytesRemaining,
            };
        }
        if (stream.bytesRemaining < 0) {
            throw {
                tag: 'HTTP-request-body-size',
                val: stream.contentLength - stream.bytesRemaining,
            };
        }
        stream.end();
        return;
    }
    case HTTP_OUTGOING_BODY_DISPOSE:
        if (debug && !streams.has(id)) {
            console.warn(`wasi-io: stream ${id} not found to dispose`);
        }
        streams.delete(id);
        return;
    case HTTP_SERVER_START:
        return startHttpServer(id, payload);
    case HTTP_SERVER_STOP:
        return stopHttpServer(id);
    case HTTP_SERVER_SET_OUTGOING_RESPONSE:
        return setOutgoingResponse(id, payload);
    case HTTP_SERVER_CLEAR_OUTGOING_RESPONSE:
        return clearOutgoingResponse(id);
    case HTTP_SERVER_GET_ADDRESS:
        return getHttpServerAddress(id);

        // Sockets name resolution
    case SOCKET_RESOLVE_ADDRESS_CREATE_REQUEST:
        return createFuture(socketResolveAddress(payload));
    case SOCKET_RESOLVE_ADDRESS_SUBSCRIBE_REQUEST:
        return createPoll(futures.get(id).pollState);
    case SOCKET_RESOLVE_ADDRESS_DISPOSE_REQUEST:
        return void futureDispose(id, true);
    case SOCKET_RESOLVE_ADDRESS_TAKE_REQUEST: {
        const val = futureTakeValue(id);
        if (val === undefined) {
            throw 'would-block';
        }
        // double take avoidance is ensured
        return val.val;
    }

    // Sockets TCP
    case SOCKET_TCP_ACCEPT:
        return socketTcpAccept(id);
    case SOCKET_TCP_CREATE_HANDLE:
        return createTcpSocket();
    case SOCKET_TCP_BIND_START:
        return socketTcpBindStart(id, payload.localAddress, payload.family);
    case SOCKET_TCP_BIND_FINISH:
        return socketTcpFinish(id, SOCKET_STATE_BIND, SOCKET_STATE_BOUND);
    case SOCKET_TCP_CONNECT_START:
        return socketTcpConnectStart(
            id,
            payload.remoteAddress,
            payload.family
        );
    case SOCKET_TCP_CONNECT_FINISH:
        return socketTcpFinish(
            id,
            SOCKET_STATE_CONNECT,
            SOCKET_STATE_CONNECTION
        );
    case SOCKET_TCP_LISTEN_START:
        return socketTcpListenStart(id);
    case SOCKET_TCP_LISTEN_FINISH:
        return socketTcpFinish(
            id,
            SOCKET_STATE_LISTEN,
            SOCKET_STATE_LISTENER
        );
    case SOCKET_TCP_IS_LISTENING:
        return tcpSockets.get(id).state === SOCKET_STATE_LISTENER;
    case SOCKET_GET_DEFAULT_SEND_BUFFER_SIZE:
        return getDefaultSendBufferSize(id);
    case SOCKET_GET_DEFAULT_RECEIVE_BUFFER_SIZE:
        return getDefaultReceiveBufferSize(id);
    case SOCKET_TCP_SET_LISTEN_BACKLOG_SIZE:
        return socketTcpSetListenBacklogSize(id);
    case SOCKET_TCP_GET_LOCAL_ADDRESS:
        return socketTcpGetLocalAddress(id);
    case SOCKET_TCP_GET_REMOTE_ADDRESS:
        return socketTcpGetRemoteAddress(id);
    case SOCKET_TCP_SHUTDOWN:
        return socketTcpShutdown(id, payload);
    case SOCKET_TCP_SUBSCRIBE:
        return createPoll(tcpSockets.get(id).pollState);
    case SOCKET_TCP_SET_KEEP_ALIVE:
        return socketTcpSetKeepAlive(id, payload);
    case SOCKET_TCP_DISPOSE:
        return socketTcpDispose(id);

        // Sockets UDP
    case SOCKET_UDP_CREATE_HANDLE:
        return createUdpSocket(payload);
    case SOCKET_UDP_BIND_START:
        return socketUdpBindStart(id, payload.localAddress, payload.family);
    case SOCKET_UDP_BIND_FINISH:
        return socketUdpBindFinish(id);
    case SOCKET_UDP_STREAM:
        return socketUdpStream(id, payload);
    case SOCKET_UDP_SUBSCRIBE:
        return createPoll(udpSockets.get(id).pollState);
    case SOCKET_UDP_GET_LOCAL_ADDRESS:
        return socketUdpGetLocalAddress(id);
    case SOCKET_UDP_GET_REMOTE_ADDRESS:
        return socketUdpGetRemoteAddress(id);
    case SOCKET_UDP_SET_RECEIVE_BUFFER_SIZE:
        return socketUdpSetReceiveBufferSize(id, payload);
    case SOCKET_UDP_SET_SEND_BUFFER_SIZE:
        return socketUdpSetSendBufferSize(id, payload);
    case SOCKET_UDP_SET_UNICAST_HOP_LIMIT:
        return socketUdpSetUnicastHopLimit(id, payload);
    case SOCKET_UDP_GET_RECEIVE_BUFFER_SIZE:
        return socketUdpGetReceiveBufferSize(id);
    case SOCKET_UDP_GET_SEND_BUFFER_SIZE:
        return socketUdpGetSendBufferSize(id);
    case SOCKET_UDP_GET_UNICAST_HOP_LIMIT:
        return socketUdpGetUnicastHopLimit(id);
    case SOCKET_UDP_DISPOSE:
        return socketUdpDispose(id);

    case SOCKET_INCOMING_DATAGRAM_STREAM_RECEIVE:
        return socketIncomingDatagramStreamReceive(id, payload);
    case SOCKET_OUTGOING_DATAGRAM_STREAM_CHECK_SEND:
        return socketOutgoingDatagramStreamCheckSend(id);
    case SOCKET_OUTGOING_DATAGRAM_STREAM_SEND:
        return socketOutgoingDatagramStreamSend(id, payload);
    case SOCKET_DATAGRAM_STREAM_SUBSCRIBE:
        return createPoll(datagramStreams.get(id).pollState);
    case SOCKET_DATAGRAM_STREAM_DISPOSE:
        return socketDatagramStreamDispose(id);

        // Stdio
    case OUTPUT_STREAM_BLOCKING_FLUSH | STDOUT:
    case OUTPUT_STREAM_BLOCKING_FLUSH | STDERR:
        // no blocking flush for stdio in Node.js
        return;
    case OUTPUT_STREAM_DISPOSE | STDOUT:
    case OUTPUT_STREAM_DISPOSE | STDERR:
        return;
    case INPUT_STREAM_CREATE | STDIN: {
        return createReadableStream(
            new Readable({
                read(n) {
                    if (n <= 0) {
                        return void this.push(null);
                    }
                    let buf = Buffer.allocUnsafeSlow(n);
                    read(0, buf, 0, n, null, (err, bytesRead) => {
                        if (err) {
                            if (err.code === 'EAGAIN') {
                                nextTick(() => void this._read(n));
                                return;
                            }
                            this.destroy(err);
                        } else if (bytesRead > 0) {
                            if (bytesRead !== buf.length) {
                                const dst =
                                        Buffer.allocUnsafeSlow(bytesRead);
                                buf.copy(dst, 0, 0, bytesRead);
                                buf = dst;
                            }
                            this.push(buf);
                        } else {
                            this.push(null);
                        }
                    });
                },
            })
        );
    }

    // Clocks
    case CLOCKS_DURATION_SUBSCRIBE:
        payload = hrtime.bigint() + payload;
        // fallthrough
    case CLOCKS_INSTANT_SUBSCRIBE: {
        const pollState = {
            ready: false,
            listener: null,
            polls: [],
            parentStream: null,
        };
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
        if (!stream.pollState.ready) {
            return new Uint8Array();
        }
        const res = stream.stream.read(
            Math.min(stream.stream.readableLength, Number(payload))
        );
        if (res) {
            return res;
        }
        if (stream.stream.readableEnded) {
            throw { tag: 'closed' };
        }
        return new Uint8Array();
    }
    case INPUT_STREAM_BLOCKING_READ: {
        const { pollState } = streams.get(id);
        pollStateCheck(pollState);
        if (pollState.ready) {
            return handle(
                INPUT_STREAM_READ | (call & CALL_TYPE_MASK),
                id,
                payload
            );
        }
        return new Promise(
            (resolve) => void (pollState.listener = resolve)
        ).then(() =>
            handle(INPUT_STREAM_READ | (call & CALL_TYPE_MASK), id, payload)
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
        verifyPollsDroppedForDrop(stream.pollState, 'input stream');
        streams.delete(id);
        return;
    }
    case OUTPUT_STREAM_CHECK_WRITE: {
        const { stream, pollState } = getStreamOrThrow(id);
        const bytes = stream.writableHighWaterMark - stream.writableLength;
        if (bytes === 0) {
            pollState.ready = false;
        }
        return BigInt(bytes);
    }
    case OUTPUT_STREAM_WRITE: {
        const { stream } = getStreamOrThrow(id);
        if (
            payload.byteLength >
                stream.writableHighWaterMark - stream.writableLength
        ) {
            throw new Error(
                'wasi-io trap: attempt to write too many bytes'
            );
        }
        return void stream.write(payload);
    }
    case OUTPUT_STREAM_BLOCKING_WRITE_AND_FLUSH: {
        const stream = getStreamOrThrow(id);
        // if an existing flush, try again after that
        if (stream.flushPromise) {
            return stream.flushPromise.then(() =>
                handle(call, id, payload)
            );
        }
        if (
            payload.byteLength >
                stream.stream.writableHighWaterMark -
                    stream.stream.writableLength
        ) {
            throw new Error(
                'wasi-io trap: Cannot write more than permitted writable length'
            );
        }
        stream.pollState.ready = false;
        return (stream.flushPromise = new Promise((resolve, reject) => {
            if (stream.stream === stdout || stream.stream === stderr) {
                // Inside workers, NodeJS actually queues writes destined for
                // stdout/stderr in a port that is only flushed on exit of the worker.
                //
                // In this case, we cannot attempt to wait for the promise.
                //
                // This code may have to be reworked for browsers.
                //
                // see: https://github.com/nodejs/node/blob/v22.12.0/lib/internal/worker/io.js#L288
                // see: https://github.com/nodejs/node/blob/v22.12.0/lib/internal/worker.js#L303
                // see: https://github.com/nodejs/node/blob/v22.12.0/typings/internalBinding/messaging.d.ts#L27
                stream.stream.write(payload);
                stream.flushPromise = null;
                pollStateReady(stream.pollState);
                resolve(BigInt(payload.byteLength));
            } else {
                stream.stream.write(payload, (err) => {
                    stream.flushPromise = null;
                    pollStateReady(stream.pollState);
                    if (err) {
                        return void reject(streamError(err));
                    }
                    resolve(BigInt(payload.byteLength));
                });
            }
        }));
    }
    case OUTPUT_STREAM_FLUSH: {
        const stream = getStreamOrThrow(id);
        if (stream.flushPromise) {
            return;
        }
        stream.pollState.ready = false;
        stream.flushPromise = new Promise((resolve, reject) => {
            if (stream.stream === stdout || stream.stream === stderr) {
                // Inside workers, NodeJS actually queues writes destined for
                // stdout/stderr in a port that is only flushed on exit of the worker.
                //
                // In this case, we cannot attempt to wait for the promise.
                //
                // This code may have to be reworked for browsers.
                //
                // see: https://github.com/nodejs/node/blob/v22.12.0/lib/internal/worker/io.js#L288
                // see: https://github.com/nodejs/node/blob/v22.12.0/lib/internal/worker.js#L303
                // see: https://github.com/nodejs/node/blob/v22.12.0/typings/internalBinding/messaging.d.ts#L27
                stream.flushPromise = null;
                pollStateReady(stream.pollState);
                resolve();
            } else {
                // For all other writes, we can perform the actual write and expect the write to complete
                // and trigger the relevant callback
                stream.stream.write(new Uint8Array([]), (err) => {
                    stream.flushPromise = null;
                    pollStateReady(stream.pollState);
                    if (err) {
                        return void reject(streamError(err));
                    }
                    resolve();
                });
            }
        });
        return stream.flushPromise;
    }
    case OUTPUT_STREAM_BLOCKING_FLUSH: {
        const stream = getStreamOrThrow(id);
        if (stream.flushPromise) {
            return stream.flushPromise;
        }
        return new Promise((resolve, reject) => {
            if (stream.stream === stdout || stream.stream === stderr) {
                // Inside workers, NodeJS actually queues writes destined for
                // stdout/stderr in a port that is only flushed on exit of the worker.
                //
                // In this case, we cannot attempt to wait for the promise.
                //
                // This code may have to be reworked for browsers.
                //
                // see: https://github.com/nodejs/node/blob/v22.12.0/lib/internal/worker/io.js#L288
                // see: https://github.com/nodejs/node/blob/v22.12.0/lib/internal/worker.js#L303
                // see: https://github.com/nodejs/node/blob/v22.12.0/typings/internalBinding/messaging.d.ts#L27
                resolve();
            } else {
                // For all other writes, we can perform the actual write and expect the write to complete
                // and trigger the relevant callback
                stream.stream.write(new Uint8Array([]), (err) =>
                    err ? reject(streamError(err)) : resolve()
                );
            }
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
            OUTPUT_STREAM_BLOCKING_WRITE_AND_FLUSH |
                    (call & CALL_TYPE_MASK),
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
                        outputStream.writableHighWaterMark -
                            outputStream.writableLength,
                        bytesRemaining
                    )
                ))
        ) {
            bytesRemaining -= chunk.byteLength;
            outputStream.stream.write(chunk);
        }
        if (inputStream.stream.errored) {
            throw streamError(inputStream.stream.errored);
        }
        if (outputStream.stream.errored) {
            throw streamError(outputStream.stream.errored);
        }
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
                    .once('drain', (resolve = _resolve))
                    .once('error', (reject = _reject));
            }).then(
                () => {
                    outputStream.stream.off('error', reject);
                },
                (err) => {
                    outputStream.stream.off('drain', resolve);
                    throw streamError(err);
                }
            );
        }
        const inputStream = getStreamOrThrow(payload.src);
        if (!inputStream.stream.readable) {
            promise = promise.then(() =>
                new Promise((_resolve, _reject) => {
                    inputStream.stream
                        .once('readable', (resolve = _resolve))
                        .once('error', (reject = _reject));
                }).then(
                    () => {
                        inputStream.stream.off('error', reject);
                    },
                    (err) => {
                        inputStream.stream.off('readable', resolve);
                        throw streamError(err);
                    }
                )
            );
        }
        return promise.then(() =>
            handle(OUTPUT_STREAM_SPLICE, id, payload)
        );
    }
    case OUTPUT_STREAM_DISPOSE: {
        const stream = streams.get(id);
        verifyPollsDroppedForDrop(stream.pollState, 'output stream');
        stream.stream.end();
        streams.delete(id);
        return;
    }

    case POLL_POLLABLE_READY:
        return polls.get(id).ready;
    case POLL_POLLABLE_BLOCK:
        payload = [id];
        // [intentional case fall-through]
    case POLL_POLL_LIST: {
        if (payload.length === 0) {
            throw new Error('wasi-io trap: attempt to poll on empty list');
        }
        const doneList = [];
        const pollList = payload.map((pollId) => polls.get(pollId));
        for (const [idx, pollState] of pollList.entries()) {
            pollStateCheck(pollState);
            if (pollState.ready) {
                doneList.push(idx);
            }
        }
        if (doneList.length > 0) {
            return new Uint32Array(doneList);
        }
        let readyPromiseResolve;
        const readyPromise = new Promise(
            (resolve) => void (readyPromiseResolve = resolve)
        );
        for (const poll of pollList) {
            poll.listener = readyPromiseResolve;
        }
        return readyPromise.then(() => {
            for (const [idx, pollState] of pollList.entries()) {
                pollState.listener = null;
                if (pollState.ready) {
                    doneList.push(idx);
                }
            }
            return new Uint32Array(doneList);
        });
    }
    case POLL_POLLABLE_DISPOSE:
        if (!polls.delete(id)) {
            throw new Error(
                `wasi-io trap: Disposed a poll ${id} that does not exist`
            );
        }
        return;

    case FUTURE_TAKE_VALUE:
        return futureTakeValue(id);

    case FUTURE_SUBSCRIBE: {
        const { pollState } = futures.get(id);
        const pollId = ++pollCnt;
        polls.set(pollId, pollState);
        return pollId;
    }
    case FUTURE_DISPOSE:
        return void futureDispose(id, true);
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
function createPoll(pollState) {
    const pollId = ++pollCnt;
    pollState.polls.push(pollId);
    polls.set(pollId, pollState);
    return pollId;
}

function subscribeInstant(pollState, instant) {
    const duration = instant - hrtime.bigint();
    if (duration <= 0) {
        return pollStateReady(pollState);
    }
    function cb() {
        if (hrtime.bigint() < instant) {
            return subscribeInstant(pollState, instant);
        }
        pollStateReady(pollState);
    }
    if (duration < 10e6) {
        setImmediate(cb);
    } else {
        setTimeout(cb, Number(duration) / 1e6);
    }
}

/**
 * @param {PollState} pollState
 * @param {string} polledResourceDebugName
 */
export function verifyPollsDroppedForDrop(pollState, polledResourceDebugName) {
    for (const pollId of pollState.polls) {
        const poll = polls.get(pollId);
        if (poll) {
            throw new Error(
                `wasi-io trap: Cannot drop ${polledResourceDebugName} as it has a child poll resource which has not yet been dropped`
            );
        }
    }
}

/**
 * @param {PollState} pollState
 * @param {bool} finished
 */
export function pollStateReady(pollState) {
    if (pollState.ready && pollState.listener) {
        uncaughtException = new Error(
            'wasi-io trap: poll already ready with listener attached'
        );
    }
    pollState.ready = true;
    if (pollState.listener) {
        pollState.listener();
        pollState.listener = null;
    }
}

/**
 * @param {PollState} pollState
 */
function pollStateCheck(pollState) {
    if (pollState.ready && pollState.parentStream) {
        // stream ONLY applies to readable streams here
        const stream = pollState.parentStream;
        const res = stream.read(0);
        if (res !== null) {
            throw new Error('wasi-io trap: got data for a null read');
        }
        if (
            pollState.ready &&
            stream.readableLength === 0 &&
            !stream.readableEnded &&
            !stream.errored
        ) {
            pollState.ready = false;
            stream.once('readable', () => {
                pollStateReady(pollState);
            });
        }
    }
}

/**
 *
 * @param {Promise<any>} promise
 * @param {PollState | undefined} pollState
 * @returns {number}
 */
export function createFuture(promise, pollState) {
    const futureId = ++futureCnt;
    if (pollState) {
        pollState.ready = false;
    } else {
        pollState = {
            ready: false,
            listener: null,
            polls: [],
            parent: null,
        };
    }
    const future = { tag: 'ok', val: null };
    futures.set(futureId, { future, pollState });
    promise.then(
        (value) => {
            pollStateReady(pollState);
            future.val = value;
        },
        (value) => {
            pollStateReady(pollState);
            future.tag = 'err';
            future.val = value;
        }
    );
    return futureId;
}

/**
 * @param {number} id
 * @returns {undefined | { tag: 'ok', val: any } | { tag: 'err', val: undefined }}
 * @throws {undefined}
 */
export function futureTakeValue(id) {
    const future = futures.get(id);
    // Not ready = return undefined
    if (!future.pollState.ready) {
        return undefined;
    }
    // Ready but already taken = return { tag: 'err', val: undefined }
    if (!future.future) {
        return { tag: 'err', val: undefined };
    }
    const out = { tag: 'ok', val: future.future };
    future.future = null;
    return out;
}

export function futureDispose(id, ownsState) {
    const { pollState } = futures.get(id);
    if (ownsState) {
        verifyPollsDroppedForDrop(pollState, 'future');
    }
    return void futures.delete(id);
}

let uncaughtException;
process.on('uncaughtException', (err) => (uncaughtException = err));

const debug = runAsWorker(handle);
