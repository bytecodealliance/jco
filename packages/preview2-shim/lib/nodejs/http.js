import {
  INPUT_STREAM_DISPOSE,
  HTTP_CREATE_REQUEST,
  HTTP_OUTPUT_STREAM_FINISH,
  OUTPUT_STREAM_CREATE,
  FUTURE_GET_VALUE_AND_DISPOSE,
  FUTURE_DISPOSE,
} from "../io/calls.js";
import {
  ioCall,
  pollableCreate,
  inputStreamCreate,
  outputStreamCreate,
  outputStreamId,
} from "../io/worker-io.js";

import { HTTP } from "../io/calls.js";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

/**
 * @typedef {import("../../types/interfaces/wasi-http-types").Method} Method
 * @typedef {import("../../types/interfaces/wasi-http-types").RequestOptions} RequestOptions
 * @typedef {import("../../types/interfaces/wasi-http-types").Scheme} Scheme
 * @typedef {import("../../types/interfaces/wasi-http-types").Error} HttpError
 */

export class WasiHttp {
  requestCnt = 1;
  responseCnt = 1;
  fieldsCnt = 1;
  futureCnt = 1;

  constructor() {
    const http = this;

    class IncomingBody {
      #finished = false;
      #streamId = undefined;
      stream() {
        if (!this.#streamId) throw undefined;
        const streamId = this.#streamId;
        this.#streamId = undefined;
        return inputStreamCreate(HTTP, streamId);
      }
      static finish(incomingBody) {
        if (incomingBody.#finished)
          throw new Error("incoming body already finished");
        incomingBody.#finished = true;
        return futureTrailersCreate(new Fields([]), false);
      }
      [symbolDispose]() {
        if (!this.#finished) {
          ioCall(INPUT_STREAM_DISPOSE | HTTP, this.#streamId);
          this.#streamId = undefined;
        }
      }
      static _create(streamId) {
        const incomingBody = new IncomingBody();
        incomingBody.#streamId = streamId;
        return incomingBody;
      }
    }
    const incomingBodyCreate = IncomingBody._create;
    delete IncomingBody._create;

    // TODO
    class IncomingRequest {}

    class FutureTrailers {
      _id = http.futureCnt++;
      #value;
      #isError;
      subscribe() {
        // TODO
      }
      get() {
        return { tag: this.#isError ? "err" : "ok", val: this.#value };
      }
      static _create(value, isError) {
        const res = new FutureTrailers();
        res.#value = value;
        res.#isError = isError;
        return res;
      }
    }
    const futureTrailersCreate = FutureTrailers._create;
    delete FutureTrailers._create;

    class OutgoingResponse {
      _id = http.responseCnt++;
      /** @type {number} */ #statusCode;
      /** @type {Fields} */ #headers;

      /**
       * @param {number} statusCode
       * @param {Fields} headers
       */
      constructor(statusCode, headers) {
        this.#statusCode = statusCode;
        fieldsLock(headers);
        this.#headers = headers;
      }
    }

    class ResponseOutparam {
      static set(_param, _response) {
        // TODO
      }
    }

    class OutgoingRequest {
      _id = http.requestCnt++;
      /** @type {Method} */ #method = { tag: "get" };
      /** @type {Scheme | undefined} */ #scheme = undefined;
      /** @type {string | undefined} */ #pathWithQuery = undefined;
      /** @type {string | undefined} */ #authority = undefined;
      /** @type {Fields} */ #headers;
      /** @type {OutgoingBody} */ #body;
      #bodyRequested = false;
      constructor(headers) {
        fieldsLock(headers);
        this.#headers = headers;
        let contentLengthValues = this.#headers.get('content-length');
        if (contentLengthValues.length === 0)
          contentLengthValues = this.#headers.get('Content-Length');
        let contentLength;
        if (contentLengthValues.length > 0)
          contentLength = Number(new TextDecoder().decode(contentLengthValues[0]));
        this.#body = outgoingBodyCreate(contentLength);
      }
      body() {
        if (this.#bodyRequested)
          throw new Error('Body already requested');
        this.#bodyRequested = true;
        return this.#body;
      }
      method() {
        return this.#method;
      }
      setMethod(method) {
        this.#method = method;
      }
      pathWithQuery() {
        return this.#pathWithQuery;
      }
      setPathWithQuery(pathWithQuery) {
        this.#pathWithQuery = pathWithQuery;
      }
      scheme() {
        return this.#scheme;
      }
      setScheme(scheme) {
        this.#scheme = scheme;
      }
      authority() {
        return this.#authority;
      }
      setAuthority(authority) {
        this.#authority = authority;
      }
      headers() {
        return this.#headers;
      }
      [symbolDispose] () {
      }
      static _handle(request) {
        const scheme = request.#scheme.tag === "HTTP" ? "http://" : "https://";
        const url = scheme + request.#authority + request.#pathWithQuery;
        const headers = {
          host: request.#authority,
        };
        const decoder = new TextDecoder();
        for (const [key, value] of request.#headers.entries()) {
          headers[key] = decoder.decode(value);
        }
        return futureIncomingResponseCreate(
          request.#method.val || request.#method.tag,
          url,
          Object.entries(headers),
          outgoingBodyOutputStreamId(request.#body)
        );
      }
    }

    const outgoingRequestHandle = OutgoingRequest._handle;
    delete OutgoingRequest._handle;

    class OutgoingBody {
      #outputStream = undefined;
      #contentLength = undefined;
      write() {
        if (this.#outputStream)
          throw new Error("output stream already created for writing");
        this.#outputStream = outputStreamCreate(
          HTTP,
          ioCall(OUTPUT_STREAM_CREATE | HTTP, null, this.#contentLength)
        );
        this.#outputStream[symbolDispose] = () => {};
        return this.#outputStream;
      }
      [symbolDispose] () {
        this.#outputStream?.[symbolDispose]();
      }
      /**
       * @param {OutgoingBody} body
       * @param {Fields | undefined} trailers
       */
      static finish(body, _trailers) {
        // this will verify content length, and also verify not already finished
        // throwing errors as appropriate
        if (body.#outputStream)
          ioCall(HTTP_OUTPUT_STREAM_FINISH, outputStreamId(body.#outputStream), null);
        body.#outputStream?.[symbolDispose]();
      }
      static _outputStreamId (outgoingBody) {
        if (outgoingBody.#outputStream)
          return outputStreamId(outgoingBody.#outputStream);
      }
      static _create (contentLength) {
        const outgoingBody = new OutgoingBody();
        outgoingBody.#contentLength = contentLength;
        return outgoingBody;
      }
    }
    const outgoingBodyOutputStreamId = OutgoingBody._outputStreamId;
    delete OutgoingBody._outputStreamId;

    const outgoingBodyCreate = OutgoingBody._create;
    delete OutgoingBody._create;

    class IncomingResponse {
      _id = http.responseCnt++;
      /** @type {Fields} */ #headers = undefined;
      #status = 0;
      /** @type {number} */ #bodyStreamId;
      status() {
        return this.#status;
      }
      headers() {
        return this.#headers;
      }
      consume() {
        if (this.#bodyStreamId === undefined) throw undefined;
        const bodyStreamId = this.#bodyStreamId;
        this.#bodyStreamId = undefined;
        return incomingBodyCreate(bodyStreamId);
      }
      [symbolDispose]() {
        if (this.#bodyStreamId) {
          ioCall(INPUT_STREAM_DISPOSE | HTTP, this.#bodyStreamId);
          this.#bodyStreamId = undefined;
        }
      }
      static _create(status, headers, bodyStreamId) {
        const res = new IncomingResponse();
        res.#status = status;
        res.#headers = headers;
        res.#bodyStreamId = bodyStreamId;
        return res;
      }
    }

    const incomingResponseCreate = IncomingResponse._create;
    delete IncomingResponse._create;

    class FutureIncomingResponse {
      _id = http.futureCnt++;
      #pollId;
      subscribe() {
        if (this.#pollId) return pollableCreate(this.#pollId);
        // 0 poll is immediately resolving
        return pollableCreate(0);
      }
      get() {
        // already taken
        if (!this.#pollId) return { tag: "err" };
        const ret = ioCall(FUTURE_GET_VALUE_AND_DISPOSE | HTTP, this.#pollId);
        if (!ret) return;
        this.#pollId = undefined;
        if (ret.error)
          return { tag: "ok", val: { tag: "err", val: ret.value } };
        const { status, headers, bodyStreamId } = ret.value;
        const textEncoder = new TextEncoder();
        return {
          tag: "ok",
          val: {
            tag: "ok",
            val: incomingResponseCreate(
              status,
              Fields.fromList(
                headers.map(([key, val]) => [key, textEncoder.encode(val)])
              ),
              bodyStreamId
            ),
          },
        };
      }
      [symbolDispose]() {
        if (this.#pollId) ioCall(FUTURE_DISPOSE | HTTP, this.#pollId);
      }
      static _create(method, url, headers, body) {
        const res = new FutureIncomingResponse();
        res.#pollId = ioCall(HTTP_CREATE_REQUEST, null, {
          method,
          url,
          headers,
          body,
        });
        return res;
      }
    }

    const futureIncomingResponseCreate = FutureIncomingResponse._create;
    delete FutureIncomingResponse._create;

    class Fields {
      _id = http.fieldsCnt++;
      #immutable = false;
      /** @type {Record<string, Uint8Array[]>} */ #fields = Object.create(null);

      /**
       * @param {[string, Uint8Array[][]][]} entries
       */
      static fromList(entries) {
        const fields = new Fields();
        for (const [key, value] of entries) {
          (fields.#fields[key] = fields.#fields[key] || []).push(value);
        }
        return fields;
      }
      get(name) {
        return this.#fields[name] || [];
      }
      set(name, values) {
        if (this.#immutable)
          throw 'immutable';
        this.#fields[name] = values;
      }
      delete(name) {
        if (this.#immutable)
          throw 'immutable';
        delete this.#fields[name];
      }
      append(name, values) {
        if (this.#immutable)
          throw 'immutable';
        const existing = this.get(name);
        this.set(existing.concat(values));
      }
      entries() {
        return Object.entries(this.#fields).flatMap(([key, values]) => values.map(value => [key, value]));
      }
      clone() {
        return Fields.fromList(this.entries());
      }
      static _lock (fields) {
        fields.#immutable = true;
      }
    }
    const fieldsLock = Fields._lock;
    delete Fields._lock;

    this.outgoingHandler = {
      /**
       * @param {OutgoingRequest} request
       * @param {RequestOptions | undefined} _options
       * @returns {FutureIncomingResponse}
       */
      handle: outgoingRequestHandle,
    };

    function httpErrorCode (err) {
      return {
        tag: 'internal-error',
        val: err.message
      };
    }

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
      ResponseOutparam,
      httpErrorCode
    };
  }
}

export const { outgoingHandler, types } = new WasiHttp();
