// Based on:
// https://github.com/bytecodealliance/wasmtime/blob/8efcb9851602287fd07a1a1e91501f51f2653d7e/crates/wasi-http/

/**
 * @typedef {import("../../types/imports/wasi-http-types").Fields} Fields
 * @typedef {import("../../types/imports/wasi-http-types").FutureIncomingResponse} FutureIncomingResponse
 * @typedef {import("../../types/imports/wasi-http-types").Headers} Headers
 * @typedef {import("../../types/imports/wasi-http-types").IncomingResponse} IncomingResponse
 * @typedef {import("../../types/imports/wasi-http-types").IncomingStream} IncomingStream
 * @typedef {import("../../types/imports/wasi-http-types").Method} Method
 * @typedef {import("../../types/imports/wasi-http-types").OutgoingRequest} OutgoingRequest
 * @typedef {import("../../types/imports/wasi-http-types").RequestOptions} RequestOptions
 * @typedef {import("../../types/imports/wasi-http-types").Result} Result
 * @typedef {import("../../types/imports/wasi-http-types").Scheme} Scheme
 * @typedef {import("../../types/imports/wasi-http-types").StatusCode} StatusCode
 * @typedef {import("../../types/imports/wasi-io-streams").StreamStatus} StreamStatus
*/

import * as io from '@bytecodealliance/preview2-shim/io';
import * as http from '@bytecodealliance/preview2-shim/http';
import { UnexpectedError } from './error.js';

export class WasiHttp {
  requestIdBase = 1;
  responseIdBase = 1;
  fieldsIdBase = 1;
  streamIdBase = 3;
  futureIdBase = 1;
  /** @type {Map<number,ActiveRequest>} */ requests = new Map();
  /** @type {Map<number,ActiveResponse>} */ responses = new Map();
  /** @type {Map<number,Map<string,string[]>>} */ fields = new Map();
  /** @type {Map<number,Uint8Array>} */ streams = new Map();
  /** @type {Map<number,ActiveFuture>} */ futures = new Map();

  constructor() {}

  /**
   * @param {OutgoingRequest} requestId
   * @param {RequestOptions | null} options
   * @returns {FutureIncomingResponse}
   */
  handle = (requestId, _options) => {
    const request = this.requests.get(requestId);
    if (!request) throw Error("not found!");

    const responseId = this.responseIdBase;
    this.responseIdBase += 1;
    const response = new ActiveResponse(responseId);

    const scheme = request.scheme.tag === "HTTP" ? "http://" : "https://";

    const url = scheme + request.authority + request.pathWithQuery;
    const headers = {
      "host": request.authority,
    };
    if (request.headers && request.headers.size > 0) {
      for (const [key, value] of request.headers.entries()) {
        headers[key] = Array.isArray(value) ? value.join(",") : value;
      }
    }
    const body =  this.streams.get(request.body);

    const res = http.send({
      method: request.method.tag,
      uri: url,
      headers: headers,
      params: [],
      body: body && body.length > 0 ? body : undefined,
    });

    response.status = res.status;
    if (res.headers && res.headers.size > 0) {
      for (const [key, value] of res.headers) {
        response.responseHeaders.set(key, [value]);
      }
    }
    const buf = res.body;
    response.body = this.streamIdBase;
    this.streamIdBase += 1;
    this.streams.set(response.body, buf);
    this.responses.set(responseId, response);

    const futureId = this.futureIdBase;
    this.futureIdBase += 1;
    const future = new ActiveFuture(futureId, responseId);
    this.futures.set(futureId, future);
    return futureId;
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

  write = (stream, buf) => {
    return this.blockingWrite(stream, buf);
  }

  /**
   * @param {OutputStream} stream 
   * @param {Uint8Array} buf 
   * @returns {[bigint, StreamStatus]}
   */
  blockingWrite = (stream, buf) => {
    if (stream < 3) {
      return io.streams.blockingWrite(stream, buf);
    }
    this.streams.set(stream, buf);
    return [BigInt(buf.byteLength), 'ended'];
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
    const map = new Map(entries);

    const id = this.fieldsIdBase;
    this.fieldsIdBase += 1;
    this.fields.set(id, map);

    return id;
  }

  /**
   * @param {Fields} fields
   * @returns {[string, string][]}
   */
  fieldsEntries = (fields) => {
    return this.fields.get(fields) ?? [];
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
    req.headers = this.fields.get(headers);
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
    const id = this.fieldsIdBase;
    this.fieldsIdBase += 1;

    this.fields.set(id, r.responseHeaders);
    return id;
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
        val: UnexpectedError(`no such future ${f}`),
      };
    }
    // For now this will assume the future will return
    // the response immediately
    const response = f.responseId;
    const r = this.responses.get(response);
    if (!r) {
      return {
        tag: "err",
        val: UnexpectedError(`no such response ${response}`),
      };
    }
    return {
      tag: "ok",
      val: response,
    };
  }
}

class ActiveRequest {
  /** @type {number} */ id;
  activeRequest = false;
  /** @type {Method} */ method = { tag: 'get' };
  /** @type {Scheme | null} */ scheme = { tag: 'HTTP' };
  pathWithQuery = null;
  authority = null;
  /** @type {Map<string,string[]>} */ headers = new Map();
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
  /** @type {Map<string,string[]>} */ responseHeaders = new Map();

  constructor(id) {
    this.id = id;
  }
}

class ActiveFuture {
  /** @type {number} */ id;
  /** @type {number} */ responseId;

  constructor(id, responseId) {
    this.id = id;
    this.responseId = responseId;
  }
}
