import { streams } from '../common/io.js';
import { fileURLToPath } from 'node:url';
import { createSyncFn } from '../synckit/index.js';

const { InputStream, OutputStream } = streams;

/**
 * @typedef {import("../../types/interfaces/wasi-http-types").Method} Method
 * @typedef {import("../../types/interfaces/wasi-http-types").RequestOptions} RequestOptions
 * @typedef {import("../../types/interfaces/wasi-http-types").Scheme} Scheme
 * @typedef {import("../../types/interfaces/wasi-http-types").Error} HttpError
*/

const workerPath = fileURLToPath(new URL('../common/make-request.js', import.meta.url));

function send(req) {
  const syncFn = createSyncFn(workerPath);
  let rawResponse = syncFn(req);
  let response = JSON.parse(rawResponse);
  if (response.status) {
    return {
      ...response,
      body: response.body ? Buffer.from(response.body, 'base64') : undefined,
    };
  }
  // HttpError
  throw { tag: 'unexpected-error', val: response.message };
}

function combineChunks (chunks) {
  if (chunks.length === 0)
    return new Uint8Array();
  if (chunks.length === 1)
    return chunks[0];
  const totalLen = chunks.reduce((total, chunk) => total + chunk.byteLength);
  const out = new Uint8Array(totalLen);
  let idx = 0;
  for (const chunk of chunks) {
    out.set(chunk, idx);
    idx += chunk.byteLength;
  }
  return out;
}

export class WasiHttp {
  requestCnt = 1;
  responseCnt = 1;
  fieldsCnt = 1;
  futureCnt = 1;

  constructor() {
    const http = this;

    // TODO
    class IncomingBody {}

    // TODO
    class IncomingRequest {}

    // TODO
    class FutureTrailers {}

    // TODO
    class OutgoingResponse {
      id = http.responseCnt++;
      /** @type {number} */ _statusCode;
      /** @type {Fields} */ _headers;

      /**
       * @param {number} statusCode 
       * @param {Fields} headers 
       */
      constructor (statusCode, headers) {
        this._statusCode = statusCode;
        this.headers = headers;
      }
    }

    class ResponseOutparam {
      static set (_param, _response) {
        // TODO
      }
    }

    class OutgoingRequest {
      id = http.requestCnt++;
      /** @type {Method} */ _method = { tag: 'get' };
      /** @type {Scheme | undefined} */ _scheme = { tag: 'HTTP' };
      /** @type {string | undefined} */ _pathWithQuery = undefined;
      /** @type {string | undefined} */ _authority = undefined;
      /** @type {Fields} */ _headers = undefined;
      /** @type {OutgoingBody} */ _body = new OutgoingBody();
      constructor(method, pathWithQuery, scheme, authority, headers) {
        this._method = method;
        this._pathWithQuery = pathWithQuery;
        this._scheme = scheme;
        this._authority = authority;
        this._headers = headers;
      }
      write () {
        return this._body;
      }
    }

    class OutgoingBody {
      _chunks = [];
      write () {
        const body = this;
        return new OutputStream({
          write (bytes) {
            body._chunks.push(bytes);
          },
          blockingFlush () {}
        });
      }
      /**
       * @param {OutgoingBody} body 
       * @param {Fields | undefined} trailers
       */
      static finish (_body, _trailers) {
        // TODO
      }
    }

    class IncomingResponse {
      id = http.responseCnt++;
      /** @type {InputStream} */ _body;
      /** @type {Fields} */ _headers = undefined;
      _status = 0;
      _chunks = [];
      _bodyConsumed = false;
      _bodyFinished = false;
      constructor () {
        const res = this;
        this._body = new InputStream({
          blockingRead (_len) {
            if (res._bodyFinished)
              throw { tag: 'closed' };
            if (res._chunks.length === 0)
              return new Uint8Array([]);
            // TODO: handle chunk splitting case where len is less than chunk length
            return res._chunks.shift();
          },
          subscribe () {
            // TODO
          }
        });
      }
      status () {
        return this._status;
      }
      headers () {
        return this._headers;
      }
      consume () {
        if (this._bodyConsumed)
          throw { tag: 'unexpected-error', val: 'request body already consumed' };
        this._bodyConsumed = true;
        return this._body;
      }
    }

    class FutureIncomingResponse {
      id = this.futureCnt++;
      /** @type {IncomingResponse | undefined} */ _value;
      /** @type {HttpError | undefined} */ _error;
      subscribe () {
        // TODO
      }
      get () {
        if (this._error)
          return { tag: 'err', val: this._error };
        if (this._value)
          return { tag: 'ok', val: this._value };
      }
    }
    
    class Fields {
      id = http.fieldsCnt++;
      /** @type {Record<string, Uint8Array[]>} */ fields;

      /**
       * @param {[string, Uint8Array[]][]} fields
       */
      constructor(fields) {
        this.fields = Object.fromEntries(fields);
      }
      get (name) {
        return this.fields[name];
      }
      set (name, value) {
        this.fields[name] = value;
      }
      delete (name) {
        delete this.fields[name];
      }
      entries () {
        return Object.entries(this.fields);
      }
      clone () {
        return new Fields(this.entries());
      }
    }

    this.outgoingHandler = {
      /**
       * @param {OutgoingRequest} request
       * @param {RequestOptions | undefined} _options
       * @returns {FutureIncomingResponse}
       */
      handle (request, _options) {
        const scheme = request._scheme.tag === "HTTP" ? "http://" : "https://";
        const url = scheme + request._authority + request._pathWithQuery;
        const headers = {
          "host": request._authority,
        };
        const decoder = new TextDecoder();
        for (const [key, value] of request._headers.entries()) {
          headers[key] = decoder.decode(value);
        }

        let res;
        try {
          res = send({
            method: request._method.tag,
            uri: url,
            headers: headers,
            params: [],
            body: combineChunks(request._body._chunks),
          });
        } catch (err) {
          return Object.assign(new FutureIncomingResponse(), { _error: err });
        }

        const encoder = new TextEncoder();
        const response = Object.assign(new IncomingResponse(), {
          _status: res.status,
          _headers: new Fields(res.headers.map(([key, value]) => [key, encoder.encode(value)])),
          _chunks: [res.body],
        });
        return Object.assign(new FutureIncomingResponse(), { _value: response });
      }
    };

    this.types = {
      Fields,
      FutureIncomingResponse,
      FutureTrailers,
      IncomingBody,
      IncomingRequest,
      IncomingResponse,
      OutgoingBody,
      OutgoingRequest,
      OutgoingResponse,
      ResponseOutparam
    };
  }
}

const http = new WasiHttp();
export const { outgoingHandler, types } = http;
