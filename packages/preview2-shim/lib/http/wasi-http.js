// Based on:
// https://github.com/bytecodealliance/wasmtime/blob/8eefa7c3af9ed35839892f847c8bb4c57495c520/crates/wasi-http/

/**
 * @typedef {import("../../types/interfaces/wasi-http-types").Fields} Fields
 * @typedef {import("../../types/interfaces/wasi-http-types").FutureIncomingResponse} FutureIncomingResponse
 * @typedef {import("../../types/interfaces/wasi-http-types").Headers} Headers
 * @typedef {import("../../types/interfaces/wasi-http-types").IncomingResponse} IncomingResponse
 * @typedef {import("../../types/interfaces/wasi-http-types").IncomingStream} IncomingStream
 * @typedef {import("../../types/interfaces/wasi-http-types").Method} Method
 * @typedef {import("../../types/interfaces/wasi-http-types").OutgoingRequest} OutgoingRequest
 * @typedef {import("../../types/interfaces/wasi-http-types").RequestOptions} RequestOptions
 * @typedef {import("../../types/interfaces/wasi-http-types").Result} Result
 * @typedef {import("../../types/interfaces/wasi-http-types").Scheme} Scheme
 * @typedef {import("../../types/interfaces/wasi-http-types").StatusCode} StatusCode
 * @typedef {import("../../types/interfaces/wasi-io-streams").StreamStatus} StreamStatus
 * @typedef {import("../../types/interfaces/wasi-poll-poll").Pollable} Pollable
*/

import * as io from '@bytecodealliance/preview2-shim/io';
import * as http from '@bytecodealliance/preview2-shim/http';
import { _createPollable, _getResult } from "../poll/wasi-poll.js";
import { UnexpectedError } from './error.js';

export class WasiHttp {
  requestIdBase = 1;
  responseIdBase = 1;
  fieldsIdBase = 1;
  streamIdBase = 3;
  futureIdBase = 1;
  /** @type {Map<number,ActiveRequest>} */ requests = new Map();
  /** @type {Map<number,ActiveResponse>} */ responses = new Map();
  /** @type {Map<number,ActiveFields>} */ fields = new Map();
  /** @type {Map<number,Uint8Array>} */ streams = new Map();
  /** @type {Map<number,ActiveFuture>} */ futures = new Map();

  constructor() {}

  /**
   * @param {OutgoingRequest} requestId
   * @param {RequestOptions | null} options
   * @returns {FutureIncomingResponse}
   */
  handle = (requestId, options) => {
    const futureId = this.futureIdBase;
    this.futureIdBase += 1;
    const future = new ActiveFuture(futureId, requestId, options, null, null);
    this.futures.set(futureId, future);
    return futureId;
  };

  #handleAsync = (future) => {
    return (resolve, reject) => {
      const { requestId } = future;
      const request = this.requests.get(requestId);
      if (!request) return reject(Error("not found!"));
  
      const responseId = this.responseIdBase;
      this.responseIdBase += 1;
      const response = new ActiveResponse(responseId);
      this.responses.set(responseId, response);

      const scheme = request.scheme.tag === "HTTP" ? "http://" : "https://";

      const url = scheme + request.authority + request.pathWithQuery;
      const headers = {
        "host": request.authority,
      };
      if (request.headers) {
        const requestHeaders = this.fields.get(request.headers);
        const decoder = new TextDecoder();
        for (const [key, value] of requestHeaders.fields.entries()) {
          headers[key] = decoder.decode(value);
        }
      }
      const body = this.streams.get(request.body);

      const res = http.send({
        method: request.method.tag,
        uri: url,
        headers: headers,
        params: [],
        body: body && body.length > 0 ? body : undefined,
      });

      response.status = res.status;
      if (res.headers && res.headers.length > 0) {
        response.headers = this.newFields(res.headers);
      }

      const buf = res.body;
      if (buf) {
        response.body = this.streamIdBase;
        this.streamIdBase += 1;
        this.streams.set(response.body, buf);
      }
      return resolve(responseId);
    };
  }

  read = (stream, len) => {
    return this.blockingRead(stream, len);
  }

  /**
   * @param {InputStream} stream 
   * @param {bigint} len 
   * @returns {[Uint8Array | ArrayBuffer, StreamStatus]}
   */
  blockingRead = (stream, len) => {
    if (stream < 3) {
      return io.streams.blockingRead(stream);
    }
    const s = this.streams.get(stream);
    if (!s) throw Error(`stream not found: ${stream}`);
    const position = Number(len);
    if (position === 0) {
      return [new Uint8Array(), s.byteLength > 0 ? 'open' : 'ended'];
    } else if (s.byteLength > position) {
      this.streams.set(stream, s.slice(position, s.byteLength));
      return [s.slice(0, position), 'open'];
    } else {
      return [s.slice(0, position), 'ended'];
    }
  }

  /**
   * @param {InputStream} stream 
   * @returns {Pollable}
   */
  subscribeToInputStream = (stream) => {
    // TODO: not implemented yet
    console.log(`[streams] Subscribe to input stream ${stream}`);
  }

  /**
   * @param {InputStream} stream 
   */
  dropInputStream = (stream) => {
    const s = this.streams.get(stream);
    if (!s) throw Error(`no such input stream ${stream}`);
    s.set([]);
  }

  checkWrite = (stream) => {
    // TODO: implement
    return io.streams.checkWrite(stream);
  }

  /**
   * @param {OutputStream} stream 
   * @param {Uint8Array} buf 
   */
  write = (stream, buf) => {
    if (stream < 3) {
      return io.streams.write(stream, buf);
    }
    this.streams.set(stream, buf);
  }

  blockingWriteAndFlush = (stream, buf) => {
    if (stream < 3) {
      return io.streams.blockingWriteAndFlush(stream, buf);
    }
    // TODO: implement
  }

  flush = (stream) => {
    return this.blockingFlush(stream);
  }

  blockingFlush = (stream) => {
    if (stream < 3) {
      return io.streams.blockingFlush(stream);
    }
    // TODO: implement
  }

  /**
   * @param {OutputStream} stream 
   * @returns {Pollable}
   */
  subscribeToOutputStream = (stream) => {
    // TODO: not implemented yet
    console.log(`[streams] Subscribe to output stream ${stream}`);
  }

  /**
   * @param {OutputStream} stream 
   */
  dropOutputStream = (stream) => {
    const s = this.streams.get(stream);
    if (!s) throw Error(`no such output stream ${stream}`);
    s.set([]);
  }

  /**
   * @param {Fields} fields
   */
  dropFields = (fields) => {
    this.fields.delete(fields);
  }

  /**
   * @param {[string, string][]} entries
   * @returns {Fields}
   */
  newFields = (entries) => {
    const id = this.fieldsIdBase;
    this.fieldsIdBase += 1;
    this.fields.set(id, new ActiveFields(id, entries));

    return id;
  }

  /**
   * @param {Fields} fields
   * @returns {[string, Uint8Array][]}
   */
  fieldsEntries = (fields) => {
    const activeFields = this.fields.get(fields);
    return activeFields ? Array.from(activeFields.fields) : [];
  }

  /**
   * @param {OutgoingRequest} request
   */
  dropOutgoingRequest = (request) => {
    this.requests.delete(request);
  }

  /**
   * @param {Method} method
   * @param {string | null} pathWithQuery
   * @param {Scheme | null} scheme
   * @param {string | null} authority
   * @param {Headers} headers
   * @returns {number}
   */
  newOutgoingRequest = (method, pathWithQuery, scheme, authority, headers) => {
    const id = this.requestIdBase;
    this.requestIdBase += 1;

    const req = new ActiveRequest(id);
    req.pathWithQuery = pathWithQuery;
    req.authority = authority;
    req.method = method;
    req.headers = headers;
    req.scheme = scheme;
    this.requests.set(id, req);
    return id;
  }

  /**
   * @param {OutgoingRequest} request
   * @returns {OutgoingStream}
   */
  outgoingRequestWrite = (request) => {
    const req = this.requests.get(request);
    req.body = this.streamIdBase;
    this.streamIdBase += 1;
    return req.body;
  }
  
  /**
   * @param {IncomingResponse} response
   */
  dropIncomingResponse = (response) => {
    this.responses.delete(response);
  }

  /**
   * @param {IncomingResponse} response
   * @returns {StatusCode}
   */
  incomingResponseStatus = (response) => {
    const r = this.responses.get(response);
    return r.status;
  }

  /**
   * @param {IncomingResponse} response
   * @returns {Headers}
   */
  incomingResponseHeaders = (response) => {
    const r = this.responses.get(response);
    return r.headers ?? 0;
  }

  /**
   * @param {IncomingResponse} response
   * @returns {IncomingStream}
   */
  incomingResponseConsume = (response) => {
    const r = this.responses.get(response);
    return r.body;
  }

  /**
   * @param {FutureIncomingResponse} future
   */
  dropFutureIncomingResponse = (future) => {
    return this.futures.delete(future);
  }

  /**
   * @param {FutureIncomingResponse} future
   * @returns {Result<IncomingResponse, Error> | null}
   */
  futureIncomingResponseGet = (future) => {
    const f = this.futures.get(future);
    if (!f) {
      return {
        tag: "err",
        val: new UnexpectedError(`no such future ${f}`),
      };
    }
    if (!f.pollableId) {
      return null;
    }
    const response = _getResult(f.pollableId);
    if (response instanceof Error) {
      return {
        tag: "err",
        val: new UnexpectedError(response.message),
      };
    }
    const r = this.responses.get(response);
    if (!r) {
      return {
        tag: "err",
        val: new UnexpectedError(`no such response ${response}`),
      };
    }
    return {
      tag: "ok",
      val: response,
    };
  }

  /**
   * @param {FutureIncomingResponse} future
   * @returns {Pollable}
   */
  listenToFutureIncomingResponse = (future) => {
    const f = this.futures.get(future);
    if (!f) {
      return {
        tag: "err",
        val: new UnexpectedError(`no such future ${f}`),
      };
    }
    if (f.pollableId) {
      return f.pollableId;
    }

    this.futures.set(future, f);
    const promise = this.#handleAsync(f);
    const pollableId = _createPollable(promise);
    f.pollableId = pollableId;
    return pollableId;
  };
}

class ActiveRequest {
  /** @type {number} */ id;
  activeRequest = false;
  /** @type {Method} */ method = { tag: 'get' };
  /** @type {Scheme | null} */ scheme = { tag: 'HTTP' };
  pathWithQuery = null;
  authority = null;
  /** @type {number | null} */ headers = null;
  body = 3;

  constructor(id) {
    this.id = id;
  }
}

class ActiveResponse {
  /** @type {number} */ id;
  activeResponse = false;
  status = 0;
  body = 3;
  /** @type {number | null} */ headers = null;

  constructor(id) {
    this.id = id;
  }
}

class ActiveFuture {
  /** @type {number} */ id;
  /** @type {number} */ requestId;
  /** @type {RequestOptions | null} */ options;
  /** @type {number | null} */ responseId;
  /** @type {number | null} */ pollableId;

  constructor(id, requestId, options, responseId, pollableId) {
    this.id = id;
    this.requestId = requestId;
    this.options = options;
    this.responseId = responseId;
    this.pollableId = pollableId;
  }
}

class ActiveFields {
  /** @type {number} */ id;
  /** @type {Map<string, Uint8Array[]>} */ fields;

  constructor(id, fields) {
    this.id = id;
    const encoder = new TextEncoder();
    this.fields = new Map(fields.map(([k, v]) => [k, encoder.encode(v)]));
  }
}
