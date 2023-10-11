/**
 * @typedef {import("../../types/interfaces/wasi-http-types").Fields} Fields
 * @typedef {import("../../types/interfaces/wasi-http-types").FutureIncomingResponse} FutureIncomingResponse
 * @typedef {import("../../types/interfaces/wasi-http-types").Headers} Headers
 * @typedef {import("../../types/interfaces/wasi-http-types").IncomingStream} IncomingStream
 * @typedef {import("../../types/interfaces/wasi-http-types").Method} Method
 * @typedef {import("../../types/interfaces/wasi-http-types").RequestOptions} RequestOptions
 * @typedef {import("../../types/interfaces/wasi-http-types").Result} Result
 * @typedef {import("../../types/interfaces/wasi-http-types").Scheme} Scheme
 * @typedef {import("../../types/interfaces/wasi-http-types").StatusCode} StatusCode
 * @typedef {import("../../types/interfaces/wasi-io-streams").StreamStatus} StreamStatus
*/

import { fileURLToPath } from 'node:url';
import { createSyncFn } from './synckit/index.js';

const workerPath = fileURLToPath(new URL('./make-request.js', import.meta.url));

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
  throw new UnexpectedError(response.message);
}

class UnexpectedError extends Error {
  payload;
  constructor(message = "unexpected-error") {
    super(message);
    this.payload = {
      tag: "unexpected-error",
      val: message,
    };
  }
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
  /** @type {Map<number,OutgoingRequest>} */ requests = new Map();
  /** @type {Map<number,IncomingResponse>} */ responses = new Map();
  /** @type {Map<number,Fields>} */ fields = new Map();
  /** @type {Map<number,Future>} */ futures = new Map();

  /**
   * 
   * @param {import('../common/io.js').Io} io 
   * @returns 
   */
  constructor(io) {
    const http = this;

    class OutgoingRequest {
      /** @type {number} */ id;
      bodyFinished = false;
      /** @type {Method} */ method = { tag: 'get' };
      /** @type {Scheme | undefined} */ scheme = { tag: 'HTTP' };
      pathWithQuery = undefined;
      authority = undefined;
      /** @type {number | undefined} */ headers = undefined;
      chunks = [];
      body = io.createStream(this);
      constructor() {
        http.requests.set(this.id = http.requestCnt++, this);
      }
      write (bytes) {
        this.chunks.push(bytes);
      }
    }
    class IncomingResponse {
      /** @type {number} */ id;
      bodyFinished = false;
      status = 0;
      chunks = [];
      body = io.createStream(this);
      /** @type {number | undefined} */ headers = undefined;
      constructor() {
        http.responses.set(this.id = http.responseCnt++, this);
      }
      read (_len) {
        if (this.chunks.length === 0)
          return [new Uint8Array([]), this.bodyFinished ? 'ended' : 'open'];
        if (this.chunks.length === 1)
          return [this.chunks[0], this.bodyFinished ? 'ended' : 'open'];
        return [this.chunks.shift(), 'open'];
      }
    }

    class Future {
      /** @type {number} */ id;
      /** @type {number} */ responseId;
    
      constructor(responseId) {
        http.futures.set(this.id = http.futureCnt++, this);
        this.responseId = responseId;
      }
    }
    
    class Fields {
      /** @type {number} */ id;
      /** @type {Map<string, Uint8Array[]>} */ fields;
    
      constructor(fields) {
        http.fields.set(this.id = http.fieldsCnt++, this);
        const encoder = new TextEncoder();
        this.fields = new Map(fields.map(([k, v]) => [k, encoder.encode(v)]));
      }
    }

    this.incomingHandler = {
      // TODO
      handle () {

      }
    };

    this.outgoingHandler = {
      /**
       * @param {OutgoingRequest} requestId
       * @param {RequestOptions | undefined} options
       * @returns {FutureIncomingResponse}
       */
      handle (requestId, _options) {
        const request = http.requests.get(requestId);
        if (!request) throw Error("not found!");

        const response = new IncomingResponse();

        const scheme = request.scheme.tag === "HTTP" ? "http://" : "https://";

        const url = scheme + request.authority + request.pathWithQuery;
        const headers = {
          "host": request.authority,
        };
        if (request.headers) {
          const requestHeaders = http.fields.get(request.headers);
          const decoder = new TextDecoder();
          for (const [key, value] of requestHeaders.fields.entries()) {
            headers[key] = decoder.decode(value);
          }
        }

        const res = send({
          method: request.method.tag,
          uri: url,
          headers: headers,
          params: [],
          body: combineChunks(request.chunks),
        });

        response.status = res.status;
        if (res.headers && res.headers.length > 0) {
          response.headers = types.newFields(res.headers);
        }
        http.responses.set(response.id, response);
        response.chunks = [res.body];

        const future = new Future(response.id);
        return future.id;
      }
    };

    const types = this.types = {
      /**
       * @param {Fields} fields
       */
      dropFields(fields) {
        http.fields.delete(fields);
      },

      /**
       * @param {[string, string][]} entries
       * @returns {Fields}
       */
      newFields(entries) {
        return new Fields(entries).id;
      },

      fieldsGet(_fields, _name) {
        console.log("[types] Fields get");
      },
      fieldsSet(_fields, _name, _value) {
        console.log("[types] Fields set");
      },
      fieldsDelete(_fields, _name) {
        console.log("[types] Fields delete");
      },
      fieldsAppend(_fields, _name, _value) {
        console.log("[types] Fields append");
      },

      /**
       * @param {Fields} fields
       * @returns {[string, Uint8Array][]}
       */
      fieldsEntries(fields) {
        const activeFields = http.fields.get(fields);
        return activeFields ? Array.from(activeFields.fields) : [];
      },

      fieldsClone(_fields) {
        console.log("[types] Fields clone");
      },
      finishIncomingStream(s) {
        io.getStream(s).bodyFinished = true;
      },
      finishOutgoingStream(s, _trailers) {
        io.getStream(s).bodyFinished = true;
      },
      dropIncomingRequest(_req) {
        console.log("[types] Drop incoming request");
      },

      /**
       * @param {OutgoingRequest} request
       */
      dropOutgoingRequest(request) {
        http.requests.delete(request);
      },

      incomingRequestMethod(_req) {
        console.log("[types] Incoming request method");
      },
      incomingRequestPathWithQuery(_req) {
        console.log("[types] Incoming request path with query");
      },
      incomingRequestScheme(_req) {
        console.log("[types] Incoming request scheme");
      },
      incomingRequestAuthority(_req) {
        console.log("[types] Incoming request authority");
      },
      incomingRequestHeaders(_req) {
        console.log("[types] Incoming request headers");
      },
      incomingRequestConsume(_req) {
        console.log("[types] Incoming request consume");
      },

      /**
       * @param {Method} method
       * @param {string | undefined} pathWithQuery
       * @param {Scheme | undefined} scheme
       * @param {string | undefined} authority
       * @param {Headers} headers
       * @returns {number}
       */
      newOutgoingRequest(method, pathWithQuery, scheme, authority, headers) {
        const req = new OutgoingRequest();
        req.pathWithQuery = pathWithQuery;
        req.authority = authority;
        req.method = method;
        req.headers = headers;
        req.scheme = scheme;
        return req.id;
      },

      /**
       * @param {OutgoingRequest} request
       * @returns {OutgoingStream}
       */
      outgoingRequestWrite(request) {
        return http.requests.get(request).body;
      },

      dropResponseOutparam(_res) {
        console.log("[types] Drop response outparam");
      },
      setResponseOutparam(_response) {
        console.log("[types] Set response outparam");
      },

      /**
       * @param {IncomingResponse} response
       */
      dropIncomingResponse(response) {
        http.responses.delete(response);
      },

      dropOutgoingResponse(_res) {
        console.log("[types] Drop outgoing response");
      },

      /**
       * @param {IncomingResponse} response
       * @returns {StatusCode}
       */
      incomingResponseStatus(response) {
        const r = http.responses.get(response);
        return r.status;
      },

      /**
       * @param {IncomingResponse} response
       * @returns {Headers}
       */
      incomingResponseHeaders(response) {
        const r = http.responses.get(response);
        return r.headers ?? 0;
      },

      /**
       * @param {IncomingResponse} response
       * @returns {IncomingStream}
       */
      incomingResponseConsume(response) {
        const r = http.responses.get(response);
        return r.body;
      },

      newOutgoingResponse(_statusCode, _headers) {
        console.log("[types] New outgoing response");
      },
      outgoingResponseWrite(_res) {
        console.log("[types] Outgoing response write");
      },


      /**
       * @param {FutureIncomingResponse} future
       */
      dropFutureIncomingResponse(future) {
        return http.futures.delete(future);
      },

      /**
       * @param {FutureIncomingResponse} future
       * @returns {Result<IncomingResponse, Error> | undefined}
       */
      futureIncomingResponseGet(future) {
        const f = http.futures.get(future);
        if (!f) {
          return {
            tag: "err",
            val: UnexpectedError(`no such future ${f}`),
          };
        }
        // For now this will assume the future will return
        // the response immediately
        const response = f.responseId;
        const r = http.responses.get(response);
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
      },
      
      listenToFutureIncomingResponse(_f) {
        console.log("[types] Listen to future incoming response");
      }
    };
  }
}
