import * as calls from '../io/calls.js';
import { poll, streams, _inputStreamCreate, _outputStreamCreate, _streamTypes } from '../io/worker-io.js';
const { Poll } = poll;
const { InputStream, OutputStream } = streams;


/**
 * @typedef {import("../../types/interfaces/wasi-http-types").Method} Method
 * @typedef {import("../../types/interfaces/wasi-http-types").RequestOptions} RequestOptions
 * @typedef {import("../../types/interfaces/wasi-http-types").Scheme} Scheme
 * @typedef {import("../../types/interfaces/wasi-http-types").Error} HttpError
*/

// function combineChunks (chunks) {
//   if (chunks.length === 0)
//     return new Uint8Array();
//   if (chunks.length === 1)
//     return chunks[0];
//   const totalLen = chunks.reduce((total, chunk) => total + chunk.byteLength);
//   const out = new Uint8Array(totalLen);
//   let idx = 0;
//   for (const chunk of chunks) {
//     out.set(chunk, idx);
//     idx += chunk.byteLength;
//   }
//   return out;
// }

export class WasiHttp {
  requestCnt = 1;
  responseCnt = 1;
  fieldsCnt = 1;
  futureCnt = 1;

  constructor() {
    const http = this;

    class IncomingBody {
      #bodyFinished = false;
      stream () {
        return _inputStreamCreate(_streamTypes.INCOMING_BODY, this);
      }
      static finish (incomingBody) {
        incomingBody.#bodyFinished = true;
        return futureTrailersCreate(new Fields([]), false);
      }
    }

    // TODO
    class IncomingRequest {}

    class FutureTrailers {
      id = this.futureCnt++;
      #value;
      #isError;
      subscribe () {
        // TODO
      }
      get () {
        return { tag: this.#isError ? 'err' : 'ok', val: this.#value };
      }
      static _create (value, isError) {
        const res = new FutureTrailers();
        res.#value = value;
        res.#isError = isError;
        return res;
      }
    }
    const futureTrailersCreate = FutureTrailers._create;
    delete FutureTrailers._create;

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
      /** @type {Method} */ #method = { tag: 'get' };
      /** @type {Scheme | undefined} */ #scheme = undefined;
      /** @type {string | undefined} */ #pathWithQuery = undefined;
      /** @type {string | undefined} */ #authority = undefined;
      /** @type {Fields} */ #headers;
      /** @type {OutgoingBody} */ #body = new OutgoingBody();
      constructor(headers) {
        this.#headers = headers;
      }
      body () {
        return this.#body;
      }
      method () {
        return this.#method;
      }
      setMethod (method) {
        this.#method = method;
      }
      pathWithQuery () {
        return this.#pathWithQuery;
      }
      setPathWithQuery (pathWithQuery) {
        this.#pathWithQuery = pathWithQuery;
      }
      scheme () {
        return this.#scheme;
      }
      setScheme (scheme) {
        this.#scheme = scheme;
      }
      authority () {
        return this.#authority;
      }
      setAuthority (authority) {
        this.#authority = authority;
      }
      headers () {
        return this.#headers;
      }
      static _handle (request) {
        const scheme = request.#scheme.tag === 'HTTP' ? 'http://' : 'https://';
        const url = scheme + request.#authority + request.#pathWithQuery;
        const headers = {
          "host": request.#authority,
        };
        const decoder = new TextDecoder();
        for (const [key, value] of request.#headers.entries()) {
          headers[key] = decoder.decode(value);
        }
        // let res;
        // try {
        //   // res = send({
        //   //   method: request.#method.tag,
        //   //   uri: url,
        //   //   headers: headers,
        //   //   params: [],
        //   //   body: combineChunks(outgoingBodyGetChunks(request.#body)),
        //   // });
        // } catch (err) {
        //   return newFutureIncomingResponse(err.toString(), true);
        // }

        // const encoder = new TextEncoder();
        // const response = newIncomingResponse(res.status, new Fields(res.headers.map(([key, value]) => [key, encoder.encode(value)])), [res.body]);
        // return newFutureIncomingResponse({ tag: 'ok', val: response }, false);
      }
    }

    const outgoingRequestHandle = OutgoingRequest._handle;
    delete OutgoingRequest._handle;

    class OutgoingBody {
      #outputStream = null;
      write () {
        if (this.#outputStream)
          throw new Error('output stream already created for writing');
        return this.#outputStream = _outputStreamCreate(_streamTypes.OUTGOING_BODY);
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
      /** @type {InputStream} */ #body;
      /** @type {Fields} */ #headers = undefined;
      #status = 0;
      #bodyConsumed = false;
      status () {
        return this.#status;
      }
      headers () {
        return this.#headers;
      }
      consume () {
        if (this.#bodyConsumed)
          throw { tag: 'unexpected-error', val: 'request body already consumed' };
        this.#bodyConsumed = true;
        return this.#body;
      }
      static _create (status, headers, chunks) {
        const res = new IncomingResponse();
        res.#status = status;
        res.#headers = headers;
        res.#body = new IncomingBody();
        for (const chunk of chunks) {
          incomingBodyAddChunk(res.#body, chunk);
        }
        return res;
      }
    }

    const newIncomingResponse = IncomingResponse._create;
    delete IncomingResponse._create;

    class FutureIncomingResponse {
      id = this.futureCnt++;
      #value;
      #isError;
      #pollable;
      subscribe () {
        
      }
      get () {
        return { tag: this.#isError ? 'err' : 'ok', val: this.#value };
      }
      static _create (value, isError) {
        const res = new FutureIncomingResponse();
        res.#value = value;
        res.#isError = isError;
        return res;
      }
    }

    const newFutureIncomingResponse = FutureIncomingResponse._create;
    delete FutureIncomingResponse._create;

    class Fields {
      id = http.fieldsCnt++;
      /** @type {Record<string, Uint8Array[]>} */ #fields = Object.create(null);

      /**
       * @param {[string, Uint8Array[]][]} entries
       */
      static fromList (entries) {
        const fields = new Fields();
        fields.#fields = Object.fromEntries(fields);
        return fields;
      }
      get (name) {
        return this.#fields[name];
      }
      set (name, value) {
        this.#fields[name] = value;
      }
      delete (name) {
        delete this.#fields[name];
      }
      append (name, value) {
        // TODO
      }
      entries () {
        return Object.entries(this.#fields);
      }
      clone () {
        return Fields.fromList(this.entries());
      }
    }

    this.outgoingHandler = {
      /**
       * @param {OutgoingRequest} request
       * @param {RequestOptions | undefined} _options
       * @returns {FutureIncomingResponse}
       */
      handle: outgoingRequestHandle
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

export const { outgoingHandler, types } = new WasiHttp();
