import * as calls from "../io/calls.js";
import {
  ioCall,
  pollableCreate,
  inputStreamCreate,
  outputStreamCreate,
  streamTypes,
} from "../io/worker-io.js";

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
        return inputStreamCreate(streamTypes.INCOMING_BODY, streamId);
      }
      static finish(incomingBody) {
        if (incomingBody.#finished)
          throw new Error('incoming body already finished');
        incomingBody.#finished = true;
        return futureTrailersCreate(new Fields([]), false);
      }
      [symbolDispose]() {
        if (!this.#finished)
          ioCall(calls.INPUT_STREAM_DROP, this.#streamId);
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
      /** @type {OutgoingBody} */ #body = new OutgoingBody();
      constructor(headers) {
        this.#headers = headers;
      }
      body() {
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
          null
        );
      }
    }

    const outgoingRequestHandle = OutgoingRequest._handle;
    delete OutgoingRequest._handle;

    class OutgoingBody {
      #finished = false;
      #outputStream = null;
      write() {
        if (this.#outputStream)
          throw new Error("output stream already created for writing");
        return (this.#outputStream = outputStreamCreate(
          streamTypes.OUTGOING_BODY
        ));
      }
      /**
       * @param {OutgoingBody} body
       * @param {Fields | undefined} trailers
       */
      static finish(body, _trailers) {
        body.#finished = true;
      }
    }

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
        if (this.#bodyStreamId === null) throw undefined;
        const bodyStreamId = this.#bodyStreamId;
        this.#bodyStreamId = null;
        return incomingBodyCreate(bodyStreamId);
      }
      [symbolDispose] () {
        if (this.#bodyStreamId)
          ioCall(calls.INPUT_STREAM_DROP, this.#bodyStreamId);
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
        if (!this.#pollId) return;
        const { value, error } = ioCall(
          calls.FUTURE_DROP_AND_GET_VALUE,
          this.#pollId
        );
        this.#pollId = undefined;
        if (error) return { tag: "err", val: value };
        const { status, headers, bodyStreamId } = value;
        const textEncoder = new TextEncoder();
        return {
          tag: "ok",
          val: incomingResponseCreate(
            status,
            Fields.fromList(
              headers.map(([key, val]) => [key, textEncoder.encode(val)])
            ),
            bodyStreamId
          ),
        };
      }
      [symbolDispose]() {
        if (this.#pollId) ioCall(calls.FUTURE_DROP, this.#pollId);
      }
      static _create(method, url, headers, body) {
        const res = new FutureIncomingResponse();
        res.#pollId = ioCall(calls.HTTP_CREATE_REQUEST, null, {
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
      /** @type {Record<string, Uint8Array[]>} */ #fields = Object.create(null);

      /**
       * @param {[string, Uint8Array[]][]} entries
       */
      static fromList(entries) {
        const fields = new Fields();
        fields.#fields = Object.fromEntries(entries);
        return fields;
      }
      get(name) {
        return this.#fields[name];
      }
      set(name, value) {
        this.#fields[name] = value;
      }
      delete(name) {
        delete this.#fields[name];
      }
      append(_name, _value) {
        // TODO
      }
      entries() {
        return Object.entries(this.#fields);
      }
      clone() {
        return Fields.fromList(this.entries());
      }
    }

    this.outgoingHandler = {
      /**
       * @param {OutgoingRequest} request
       * @param {RequestOptions | undefined} _options
       * @returns {FutureIncomingResponse}
       */
      handle: outgoingRequestHandle,
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
      ResponseOutparam,
    };
  }
}

export const { outgoingHandler, types } = new WasiHttp();
