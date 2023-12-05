import {
  INPUT_STREAM_DISPOSE,
  HTTP_CREATE_REQUEST,
  HTTP_OUTPUT_STREAM_FINISH,
  HTTP_SERVER_START,
  HTTP_SERVER_STOP,
  OUTPUT_STREAM_CREATE,
  FUTURE_GET_VALUE_AND_DISPOSE,
  FUTURE_DISPOSE,
  HTTP_SERVER_SET_OUTGOING_RESPONSE,
  HTTP_SERVER_CLEAR_OUTGOING_RESPONSE,
} from "../io/calls.js";
import {
  ioCall,
  pollableCreate,
  inputStreamCreate,
  outputStreamCreate,
  outputStreamId,
  registerIncomingHttpHandler,
} from "../io/worker-io.js";
import { validateHeaderName, validateHeaderValue } from "node:http";
import { HTTP } from "../io/calls.js";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");
export const _forbiddenHeaders = new Set(["connection", "keep-alive"]);

let requestCnt = 1;
let responseCnt = 1;
let fieldsCnt = 1;
let futureCnt = 1;

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
  _id = futureCnt++;
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
  _id = responseCnt++;
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
    if (contentLengthValues.length === 0)
      contentLengthValues = this.#headers.get("Content-Length");
    let contentLength;
    if (contentLengthValues.length > 0)
      contentLength = Number(new TextDecoder().decode(contentLengthValues[0]));
    return (this.#body = outgoingBodyCreate(contentLength));
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

class RequestOptions {
  #connectTimeoutMs;
  #firstByteTimeoutMs;
  #betweenBytesTimeoutMs;
  connectTimeoutMs() {
    return this.#connectTimeoutMs;
  }
  setConnectTimeoutMs(duration) {
    this.#connectTimeoutMs = duration;
  }
  firstByteTimeoutMs() {
    return this.#firstByteTimeoutMs;
  }
  setFirstByteTimeoutMs(duration) {
    this.#firstByteTimeoutMs = duration;
  }
  betweenBytesTimeoutMs() {
    return this.#betweenBytesTimeoutMs;
  }
  setBetweenBytesTimeoutMs(duration) {
    this.#betweenBytesTimeoutMs = duration;
  }
}

class OutgoingRequest {
  _id = requestCnt++;
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
      !pathWithQuery.match(/^[a-zA-Z0-9.-_~!$&'()*+,;=:@%/]+$/)
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
          (portNum.toString() !== port || portNum > 9999)) ||
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
  static _handle(request, _options) {
    // TODO: handle options timeouts
    const scheme = schemeString(request.#scheme);
    const url = scheme + request.#authority + (request.#pathWithQuery || "");
    const headers = [["host", request.#authority]];
    const decoder = new TextDecoder();
    for (const [key, value] of request.#headers.entries()) {
      headers.push([key, decoder.decode(value)]);
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
  constructor() {
    this.#outputStream = outputStreamCreate(
      HTTP,
      ioCall(OUTPUT_STREAM_CREATE | HTTP, null, this.#contentLength)
    );
    this.#outputStream[symbolDispose] = () => {};
  }
  write() {
    return this.#outputStream;
  }
  [symbolDispose]() {
    this.#outputStream?.[symbolDispose]();
  }
  /**
   * @param {OutgoingBody} body
   * @param {Fields | undefined} trailers
   */
  static finish(body, trailers) {
    if (trailers) throw new Error("Internal error: Trailers TODO");
    // this will verify content length, and also verify not already finished
    // throwing errors as appropriate
    if (body.#outputStream)
      ioCall(
        HTTP_OUTPUT_STREAM_FINISH,
        outputStreamId(body.#outputStream),
        null
      );
    body.#outputStream?.[symbolDispose]();
  }
  static _outputStreamId(outgoingBody) {
    if (outgoingBody.#outputStream)
      return outputStreamId(outgoingBody.#outputStream);
  }
  static _create(contentLength) {
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
  _id = responseCnt++;
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
  _id = futureCnt++;
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
    if (ret.error) return { tag: "ok", val: { tag: "err", val: ret.value } };
    const { status, headers, bodyStreamId } = ret.value;
    const textEncoder = new TextEncoder();
    return {
      tag: "ok",
      val: {
        tag: "ok",
        val: incomingResponseCreate(
          status,
          fieldsFromEntriesChecked(
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
  _id = fieldsCnt++;
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
    } catch (e) {
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
  constructor(incomingHandler) {
    httpServers.set(this.#id, this);
    if (typeof incomingHandler?.handle !== "function") {
      console.error("Not a valid HTTP server component to execute.");
      process.exit(1);
    }
    registerIncomingHttpHandler(
      this.#id,
      ({ method, pathWithQuery, headers, responseId, streamId }) => {
        const textEncoder = new TextEncoder();
        const request = incomingRequestCreate(
          parseMethod(method),
          pathWithQuery,
          { tag: "HTTP" },
          "authority.org",
          fieldsLock(
            fieldsFromEntriesChecked(
              headers.map(([key, val]) => [key, textEncoder.encode(val)])
            )
          ),
          headers,
          streamId
        );
        const responseOutparam = responseOutparamCreate((response) => {
          if (response.tag === "ok") {
            const outgoingResponse = response.val;
            const statusCode = outgoingResponse.statusCode();
            const headers = outgoingResponse.headers().entries();
            const body = outgoingResponseBody(outgoingResponse);
            const streamId = outgoingBodyOutputStreamId(body);
            ioCall(HTTP_SERVER_SET_OUTGOING_RESPONSE, responseId, {
              statusCode,
              headers,
              streamId,
            });
          } else {
            ioCall(HTTP_SERVER_CLEAR_OUTGOING_RESPONSE, responseId);
            console.error("TODO: handle outparam error");
            console.error(response);
            process.exit(1);
          }
        });
        incomingHandler.handle(request, responseOutparam);
      }
    );
  }
  listen(port, host) {
    ioCall(HTTP_SERVER_START, this.#id, { port, host });
  }
  stop() {
    ioCall(HTTP_SERVER_STOP, this.#id);
  }
}
