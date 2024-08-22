import {
  FUTURE_DISPOSE,
  FUTURE_SUBSCRIBE,
  FUTURE_TAKE_VALUE,
  HTTP_CREATE_REQUEST,
  HTTP_OUTGOING_BODY_DISPOSE,
  HTTP_OUTPUT_STREAM_FINISH,
  HTTP_SERVER_CLEAR_OUTGOING_RESPONSE,
  HTTP_SERVER_SET_OUTGOING_RESPONSE,
  HTTP_SERVER_START,
  HTTP_SERVER_STOP,
  OUTPUT_STREAM_CREATE,
  OUTPUT_STREAM_DISPOSE,
} from "../io/calls.js";
import {
  earlyDispose,
  inputStreamCreate,
  ioCall,
  outputStreamCreate,
  pollableCreate,
  registerDispose,
  registerIncomingHttpHandler,
} from "../io/worker-io.js";
import { HTTP } from "../io/calls.js";

import * as http from "node:http";
const { validateHeaderName = () => {}, validateHeaderValue = () => {} } = http;

const symbolDispose = Symbol.dispose || Symbol.for("dispose");
export const _forbiddenHeaders = new Set(["connection", "keep-alive", "host"]);

class IncomingBody {
  #finished = false;
  #stream = undefined;
  stream() {
    if (!this.#stream) throw undefined;
    const stream = this.#stream;
    this.#stream = null;
    return stream;
  }
  static finish(incomingBody) {
    if (incomingBody.#finished)
      throw new Error("incoming body already finished");
    incomingBody.#finished = true;
    return futureTrailersCreate();
  }
  [symbolDispose]() {}
  static _create(streamId) {
    const incomingBody = new IncomingBody();
    incomingBody.#stream = inputStreamCreate(HTTP, streamId);
    return incomingBody;
  }
}
const incomingBodyCreate = IncomingBody._create;
delete IncomingBody._create;

class IncomingRequest {
  #method;
  #pathWithQuery;
  #scheme;
  #authority;
  #headers;
  #streamId;
  method() {
    return this.#method;
  }
  pathWithQuery() {
    return this.#pathWithQuery;
  }
  scheme() {
    return this.#scheme;
  }
  authority() {
    return this.#authority;
  }
  headers() {
    return this.#headers;
  }
  consume() {
    return incomingBodyCreate(this.#streamId);
  }
  [symbolDispose]() {}
  static _create(method, pathWithQuery, scheme, authority, headers, streamId) {
    const incomingRequest = new IncomingRequest();
    incomingRequest.#method = method;
    incomingRequest.#pathWithQuery = pathWithQuery;
    incomingRequest.#scheme = scheme;
    incomingRequest.#authority = authority;
    incomingRequest.#headers = headers;
    incomingRequest.#streamId = streamId;
    return incomingRequest;
  }
}
const incomingRequestCreate = IncomingRequest._create;
delete IncomingRequest._create;

class FutureTrailers {
  #requested = false;
  subscribe() {
    return pollableCreate(0, this);
  }
  get() {
    if (this.#requested) return { tag: "err" };
    this.#requested = true;
    return {
      tag: "ok",
      val: {
        tag: "ok",
        val: undefined,
      },
    };
  }
  static _create() {
    const res = new FutureTrailers();
    return res;
  }
}
const futureTrailersCreate = FutureTrailers._create;
delete FutureTrailers._create;

class OutgoingResponse {
  #body;
  /** @type {number} */ #statusCode = 200;
  /** @type {Fields} */ #headers;

  /**
   * @param {number} statusCode
   * @param {Fields} headers
   */
  constructor(headers) {
    fieldsLock(headers);
    this.#headers = headers;
  }

  statusCode() {
    return this.#statusCode;
  }

  setStatusCode(statusCode) {
    this.#statusCode = statusCode;
  }

  headers() {
    return this.#headers;
  }

  body() {
    let contentLengthValues = this.#headers.get("content-length");
    let contentLength;
    if (contentLengthValues.length > 0)
      contentLength = Number(new TextDecoder().decode(contentLengthValues[0]));
    this.#body = outgoingBodyCreate(contentLength);
    return this.#body;
  }

  static _body(outgoingResponse) {
    return outgoingResponse.#body;
  }
}

const outgoingResponseBody = OutgoingResponse._body;
delete OutgoingResponse._body;

class ResponseOutparam {
  #setListener;
  static set(param, response) {
    param.#setListener(response);
  }
  static _create(setListener) {
    const responseOutparam = new ResponseOutparam();
    responseOutparam.#setListener = setListener;
    return responseOutparam;
  }
}
const responseOutparamCreate = ResponseOutparam._create;
delete ResponseOutparam._create;

const defaultHttpTimeout = 600_000_000_000n;

class RequestOptions {
  #connectTimeout = defaultHttpTimeout;
  #firstByteTimeout = defaultHttpTimeout;
  #betweenBytesTimeout = defaultHttpTimeout;
  connectTimeout() {
    return this.#connectTimeout;
  }
  setConnectTimeout(duration) {
    this.#connectTimeout = duration;
  }
  firstByteTimeout() {
    return this.#firstByteTimeout;
  }
  setFirstByteTimeout(duration) {
    this.#firstByteTimeout = duration;
  }
  betweenBytesTimeout() {
    return this.#betweenBytesTimeout;
  }
  setBetweenBytesTimeout(duration) {
    this.#betweenBytesTimeout = duration;
  }
}

class OutgoingRequest {
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
    let contentLengthValues = this.#headers.get("content-length");
    if (contentLengthValues.length === 0)
      contentLengthValues = this.#headers.get("Content-Length");
    let contentLength;
    if (contentLengthValues.length > 0)
      contentLength = Number(new TextDecoder().decode(contentLengthValues[0]));
    this.#body = outgoingBodyCreate(contentLength);
  }
  body() {
    if (this.#bodyRequested) throw new Error("Body already requested");
    this.#bodyRequested = true;
    return this.#body;
  }
  method() {
    return this.#method;
  }
  setMethod(method) {
    if (method.tag === "other" && !method.val.match(/^[a-zA-Z-]+$/))
      throw undefined;
    this.#method = method;
  }
  pathWithQuery() {
    return this.#pathWithQuery;
  }
  setPathWithQuery(pathWithQuery) {
    if (
      pathWithQuery &&
      !pathWithQuery.match(/^[a-zA-Z0-9.\-_~!$&'()*+,;=:@%?/]+$/)
    )
      throw undefined;
    this.#pathWithQuery = pathWithQuery;
  }
  scheme() {
    return this.#scheme;
  }
  setScheme(scheme) {
    if (scheme?.tag === "other" && !scheme.val.match(/^[a-zA-Z]+$/))
      throw undefined;
    this.#scheme = scheme;
  }
  authority() {
    return this.#authority;
  }
  setAuthority(authority) {
    if (authority) {
      const [host, port, ...extra] = authority.split(":");
      const portNum = Number(port);
      if (
        extra.length ||
        (port !== undefined &&
          (portNum.toString() !== port || portNum > 65535)) ||
        !host.match(/^[a-zA-Z0-9-.]+$/)
      )
        throw undefined;
    }
    this.#authority = authority;
  }
  headers() {
    return this.#headers;
  }
  [symbolDispose]() {}
  static _handle(request, options) {
    const connectTimeout = options?.connectTimeout();
    const betweenBytesTimeout = options?.betweenBytesTimeout();
    const firstByteTimeout = options?.firstByteTimeout();
    const scheme = schemeString(request.#scheme);
    // note: host header is automatically added by Node.js
    const headers = [];
    const decoder = new TextDecoder();
    for (const [key, value] of request.#headers.entries()) {
      headers.push([key, decoder.decode(value)]);
    }
    if (!request.#pathWithQuery)
      throw { tag: 'HTTP-request-URI-invalid' };
    return futureIncomingResponseCreate(
      request.#method.val || request.#method.tag,
      scheme,
      request.#authority,
      request.#pathWithQuery,
      headers,
      outgoingBodyOutputStreamId(request.#body),
      connectTimeout,
      betweenBytesTimeout,
      firstByteTimeout,
    );
  }
}

const outgoingRequestHandle = OutgoingRequest._handle;
delete OutgoingRequest._handle;

class OutgoingBody {
  #outputStream = null;
  #outputStreamId = null;
  #contentLength = undefined;
  #finalizer;
  write() {
    // can only call write once
    const outputStream = this.#outputStream;
    if (outputStream === null) throw undefined;
    this.#outputStream = null;
    return outputStream;
  }
  /**
   * @param {OutgoingBody} body
   * @param {Fields | undefined} trailers
   */
  static finish(body, trailers) {
    if (trailers) throw { tag: "internal-error", val: "trailers unsupported" };
    // this will verify content length, and also verify not already finished
    // throwing errors as appropriate
    ioCall(HTTP_OUTPUT_STREAM_FINISH, body.#outputStreamId, null);
  }
  static _outputStreamId(outgoingBody) {
    return outgoingBody.#outputStreamId;
  }
  static _create(contentLength) {
    const outgoingBody = new OutgoingBody();
    outgoingBody.#contentLength = contentLength;
    outgoingBody.#outputStreamId = ioCall(
      OUTPUT_STREAM_CREATE | HTTP,
      null,
      outgoingBody.#contentLength
    );
    outgoingBody.#outputStream = outputStreamCreate(
      HTTP,
      outgoingBody.#outputStreamId
    );
    outgoingBody.#finalizer = registerDispose(
      outgoingBody,
      null,
      outgoingBody.#outputStreamId,
      outgoingBodyDispose
    );
    return outgoingBody;
  }
  [symbolDispose]() {
    if (this.#finalizer) {
      earlyDispose(this.#finalizer);
      this.#finalizer = null;
    }
  }
}

function outgoingBodyDispose(id) {
  ioCall(HTTP_OUTGOING_BODY_DISPOSE, id, null);
}

const outgoingBodyOutputStreamId = OutgoingBody._outputStreamId;
delete OutgoingBody._outputStreamId;

const outgoingBodyCreate = OutgoingBody._create;
delete OutgoingBody._create;

class IncomingResponse {
  /** @type {Fields} */ #headers = undefined;
  #status = 0;
  /** @type {number} */ #bodyStream;
  status() {
    return this.#status;
  }
  headers() {
    return this.#headers;
  }
  consume() {
    if (this.#bodyStream === undefined) throw undefined;
    const bodyStream = this.#bodyStream;
    this.#bodyStream = undefined;
    return bodyStream;
  }
  [symbolDispose]() {
    if (this.#bodyStream) this.#bodyStream[symbolDispose]();
  }
  static _create(status, headers, bodyStreamId) {
    const res = new IncomingResponse();
    res.#status = status;
    res.#headers = headers;
    res.#bodyStream = incomingBodyCreate(bodyStreamId);
    return res;
  }
}

const incomingResponseCreate = IncomingResponse._create;
delete IncomingResponse._create;

class FutureIncomingResponse {
  #id;
  #finalizer;
  subscribe() {
    return pollableCreate(
      ioCall(FUTURE_SUBSCRIBE | HTTP, this.#id, null),
      this
    );
  }
  get() {
    const ret = ioCall(FUTURE_TAKE_VALUE | HTTP, this.#id, null);
    if (ret === undefined) return undefined;
    if (ret.tag === "ok" && ret.val.tag === "ok") {
      const textEncoder = new TextEncoder();
      const { status, headers, bodyStreamId } = ret.val.val;
      ret.val.val = incomingResponseCreate(
        status,
        fieldsFromEntriesChecked(
          headers.map(([key, val]) => [key, textEncoder.encode(val)])
        ),
        bodyStreamId
      );
    }
    return ret;
  }
  static _create(
    method,
    scheme,
    authority,
    pathWithQuery,
    headers,
    body,
    connectTimeout,
    betweenBytesTimeout,
    firstByteTimeout
  ) {
    const res = new FutureIncomingResponse();
    res.#id = ioCall(HTTP_CREATE_REQUEST, null, {
      method,
      scheme,
      authority,
      pathWithQuery,
      headers,
      body,
      connectTimeout,
      betweenBytesTimeout,
      firstByteTimeout,
    });
    res.#finalizer = registerDispose(
      res,
      null,
      res.#id,
      futureIncomingResponseDispose
    );
    return res;
  }
  [symbolDispose]() {
    if (this.#finalizer) {
      earlyDispose(this.#finalizer);
      this.#finalizer = null;
    }
  }
}

function futureIncomingResponseDispose(id) {
  ioCall(FUTURE_DISPOSE | HTTP, id, null);
}

const futureIncomingResponseCreate = FutureIncomingResponse._create;
delete FutureIncomingResponse._create;

class Fields {
  #immutable = false;
  /** @type {[string, Uint8Array[]][]} */ #entries = [];
  /** @type {Map<string, [string, Uint8Array[]][]>} */ #table = new Map();

  /**
   * @param {[string, Uint8Array[][]][]} entries
   */
  static fromList(entries) {
    const fields = new Fields();
    for (const [key, value] of entries) {
      fields.append(key, value);
    }
    return fields;
  }
  get(name) {
    const tableEntries = this.#table.get(name.toLowerCase());
    if (!tableEntries) return [];
    return tableEntries.map(([, v]) => v);
  }
  set(name, values) {
    if (this.#immutable) throw { tag: "immutable" };
    try {
      validateHeaderName(name);
    } catch {
      throw { tag: "invalid-syntax" };
    }
    for (const value of values) {
      try {
        validateHeaderValue(name, new TextDecoder().decode(value));
      } catch {
        throw { tag: "invalid-syntax" };
      }
      throw { tag: "invalid-syntax" };
    }
    const lowercased = name.toLowerCase();
    if (_forbiddenHeaders.has(lowercased)) throw { tag: "forbidden" };
    const tableEntries = this.#table.get(lowercased);
    if (tableEntries)
      this.#entries = this.#entries.filter(
        (entry) => !tableEntries.includes(entry)
      );
    tableEntries.splice(0, tableEntries.length);
    for (const value of values) {
      const entry = [name, value];
      this.#entries.push(entry);
      tableEntries.push(entry);
    }
  }
  has(name) {
    return this.#table.has(name.toLowerCase());
  }
  delete(name) {
    if (this.#immutable) throw { tag: "immutable" };
    const lowercased = name.toLowerCase();
    const tableEntries = this.#table.get(lowercased);
    if (tableEntries) {
      this.#entries = this.#entries.filter(
        (entry) => !tableEntries.includes(entry)
      );
      this.#table.delete(lowercased);
    }
  }
  append(name, value) {
    if (this.#immutable) throw { tag: "immutable" };
    try {
      validateHeaderName(name);
    } catch {
      throw { tag: "invalid-syntax" };
    }
    try {
      validateHeaderValue(name, new TextDecoder().decode(value));
    } catch {
      throw { tag: "invalid-syntax" };
    }
    const lowercased = name.toLowerCase();
    if (_forbiddenHeaders.has(lowercased)) throw { tag: "forbidden" };
    const entry = [name, value];
    this.#entries.push(entry);
    const tableEntries = this.#table.get(lowercased);
    if (tableEntries) {
      tableEntries.push(entry);
    } else {
      this.#table.set(lowercased, [entry]);
    }
  }
  entries() {
    return this.#entries;
  }
  clone() {
    return fieldsFromEntriesChecked(this.#entries);
  }
  static _lock(fields) {
    fields.#immutable = true;
    return fields;
  }
  // assumes entries are already validated
  static _fromEntriesChecked(entries) {
    const fields = new Fields();
    fields.#entries = entries;
    for (const entry of entries) {
      const lowercase = entry[0].toLowerCase();
      const existing = fields.#table.get(lowercase);
      if (existing) {
        existing.push(entry);
      } else {
        fields.#table.set(lowercase, [entry]);
      }
    }
    return fields;
  }
}
const fieldsLock = Fields._lock;
delete Fields._lock;
const fieldsFromEntriesChecked = Fields._fromEntriesChecked;
delete Fields._fromEntriesChecked;

export const outgoingHandler = {
  /**
   * @param {OutgoingRequest} request
   * @param {RequestOptions | undefined} options
   * @returns {FutureIncomingResponse}
   */
  handle: outgoingRequestHandle,
};

function httpErrorCode(err) {
  if (err.payload) return err.payload;
  return {
    tag: "internal-error",
    val: err.message,
  };
}

export const types = {
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
  RequestOptions,
  httpErrorCode,
};

function schemeString(scheme) {
  if (!scheme) return "https:";
  switch (scheme.tag) {
    case "HTTP":
      return "http:";
    case "HTTPS":
      return "https:";
    case "other":
      return scheme.val.toLowerCase() + ":";
  }
}

const supportedMethods = [
  "get",
  "head",
  "post",
  "put",
  "delete",
  "connect",
  "options",
  "trace",
  "patch",
];
function parseMethod(method) {
  const lowercase = method.toLowerCase();
  if (supportedMethods.includes(method.toLowerCase()))
    return { tag: lowercase };
  return { tag: "other", val: lowercase };
}

const httpServers = new Map();
let httpServerCnt = 0;
export class HTTPServer {
  #id = ++httpServerCnt;
  #liveEventLoopInterval;
  constructor(incomingHandler) {
    httpServers.set(this.#id, this);
    if (typeof incomingHandler?.handle !== "function") {
      console.error("Not a valid HTTP server component to execute.");
      process.exit(1);
    }
    registerIncomingHttpHandler(
      this.#id,
      ({ method, pathWithQuery, host, headers, responseId, streamId }) => {
        const textEncoder = new TextEncoder();
        const request = incomingRequestCreate(
          parseMethod(method),
          pathWithQuery,
          { tag: "HTTP" },
          host,
          fieldsLock(
            fieldsFromEntriesChecked(
              headers
                .filter(([key]) => !_forbiddenHeaders.has(key))
                .map(([key, val]) => [key, textEncoder.encode(val)])
            )
          ),
          streamId
        );
        let outgoingBodyStreamId;
        const responseOutparam = responseOutparamCreate((response) => {
          if (response.tag === "ok") {
            const outgoingResponse = response.val;
            const statusCode = outgoingResponse.statusCode();
            const headers = outgoingResponse.headers().entries();
            const body = outgoingResponseBody(outgoingResponse);
            outgoingBodyStreamId = outgoingBodyOutputStreamId(body);
            ioCall(HTTP_SERVER_SET_OUTGOING_RESPONSE, responseId, {
              statusCode,
              headers,
              streamId: outgoingBodyStreamId,
            });
          } else {
            ioCall(HTTP_SERVER_CLEAR_OUTGOING_RESPONSE, responseId, null);
            console.error(response.val);
            process.exit(1);
          }
        });
        incomingHandler.handle(request, responseOutparam);
        if (outgoingBodyStreamId) {
          ioCall(OUTPUT_STREAM_DISPOSE, outgoingBodyStreamId, null);
        }
      }
    );
  }
  listen(port, host) {
    // set a dummy interval, to keep the process alive since the server is off-thread
    this.#liveEventLoopInterval = setInterval(() => {}, 10_000);
    ioCall(HTTP_SERVER_START, this.#id, { port, host });
  }
  stop() {
    clearInterval(this.#liveEventLoopInterval);
    ioCall(HTTP_SERVER_STOP, this.#id, null);
    httpServers.delete(this.#id);
  }
}
