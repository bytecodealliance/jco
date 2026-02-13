import { streams, poll } from "./io.js";

const { InputStream, OutputStream } = streams;
const { Pollable } = poll;

const symbolDispose = Symbol.dispose || Symbol.for("dispose");
const utf8Decoder = new TextDecoder();
const forbiddenHeaders = new Set(["connection", "keep-alive", "host"]);
const DEFAULT_HTTP_TIMEOUT_NS = 600_000_000_000n;

// RFC 9110 compliant header validation
const TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const FIELD_VALUE_RE = /^[\t\x20-\x7E\x80-\xFF]*$/;

function validateHeaderName(name) {
  if (!TOKEN_RE.test(name)) {
    throw { tag: "invalid-syntax" };
  }
}

function validateHeaderValue(value) {
  const str = typeof value === "string" ? value : utf8Decoder.decode(value);
  if (!FIELD_VALUE_RE.test(str)) {
    throw { tag: "invalid-syntax" };
  }
}

class Fields {
  #immutable = false;
  /** @type {[string, Uint8Array][]} */ #entries = [];
  /** @type {Map<string, [string, Uint8Array][]>} */ #table = new Map();

  static fromList(entries) {
    const fields = new Fields();
    for (const [key, value] of entries) {
      fields.append(key, value);
    }
    return fields;
  }

  get(name) {
    const tableEntries = this.#table.get(name.toLowerCase());
    if (!tableEntries) {
      return [];
    }
    return tableEntries.map(([, v]) => v);
  }

  set(name, values) {
    if (this.#immutable) {
      throw { tag: "immutable" };
    }
    validateHeaderName(name);
    for (const value of values) {
      validateHeaderValue(value);
    }
    const lowercased = name.toLowerCase();
    if (forbiddenHeaders.has(lowercased)) {
      throw { tag: "forbidden" };
    }
    const tableEntries = this.#table.get(lowercased);
    if (tableEntries) {
      this.#entries = this.#entries.filter((entry) => !tableEntries.includes(entry));
      tableEntries.splice(0, tableEntries.length);
    } else {
      this.#table.set(lowercased, []);
    }
    const newTableEntries = this.#table.get(lowercased);
    for (const value of values) {
      const entry = [name, value];
      this.#entries.push(entry);
      newTableEntries.push(entry);
    }
  }

  has(name) {
    return this.#table.has(name.toLowerCase());
  }

  delete(name) {
    if (this.#immutable) {
      throw { tag: "immutable" };
    }
    const lowercased = name.toLowerCase();
    const tableEntries = this.#table.get(lowercased);
    if (tableEntries) {
      this.#entries = this.#entries.filter((entry) => !tableEntries.includes(entry));
      this.#table.delete(lowercased);
    }
  }

  append(name, value) {
    if (this.#immutable) {
      throw { tag: "immutable" };
    }
    validateHeaderName(name);
    validateHeaderValue(value);
    const lowercased = name.toLowerCase();
    if (forbiddenHeaders.has(lowercased)) {
      throw { tag: "forbidden" };
    }
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

class RequestOptions {
  #connectTimeout = DEFAULT_HTTP_TIMEOUT_NS;
  #firstByteTimeout = DEFAULT_HTTP_TIMEOUT_NS;
  #betweenBytesTimeout = DEFAULT_HTTP_TIMEOUT_NS;
  connectTimeout() {
    return this.#connectTimeout;
  }
  setConnectTimeout(duration) {
    if (duration < 0n) {
      throw new Error("duration must not be negative");
    }
    this.#connectTimeout = duration;
  }
  firstByteTimeout() {
    return this.#firstByteTimeout;
  }
  setFirstByteTimeout(duration) {
    if (duration < 0n) {
      throw new Error("duration must not be negative");
    }
    this.#firstByteTimeout = duration;
  }
  betweenBytesTimeout() {
    return this.#betweenBytesTimeout;
  }
  setBetweenBytesTimeout(duration) {
    if (duration < 0n) {
      throw new Error("duration must not be negative");
    }
    this.#betweenBytesTimeout = duration;
  }
}

class OutgoingBody {
  #outputStream = null;
  #chunks = [];
  #finished = false;

  write() {
    const outputStream = this.#outputStream;
    if (outputStream === null) {
      throw undefined;
    }
    this.#outputStream = null;
    return outputStream;
  }

  static finish(body, trailers) {
    if (trailers) {
      throw { tag: "internal-error", val: "trailers unsupported" };
    }
    if (body.#finished) {
      throw { tag: "internal-error", val: "body already finished" };
    }
    body.#finished = true;
  }

  static _bodyData(outgoingBody) {
    if (outgoingBody.#chunks.length === 0) {
      return null;
    }
    let totalLen = 0;
    for (const chunk of outgoingBody.#chunks) {
      totalLen += chunk.byteLength;
    }
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of outgoingBody.#chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }

  static _create() {
    const outgoingBody = new OutgoingBody();
    const chunks = outgoingBody.#chunks;
    outgoingBody.#outputStream = new OutputStream({
      write(buf) {
        chunks.push(new Uint8Array(buf));
      },
      flush() {},
      blockingFlush() {},
      subscribe() {
        return new Pollable();
      },
    });
    return outgoingBody;
  }

  [symbolDispose]() {}
}
const outgoingBodyCreate = OutgoingBody._create;
delete OutgoingBody._create;
const outgoingBodyData = OutgoingBody._bodyData;
delete OutgoingBody._bodyData;

class OutgoingRequest {
  /** @type {{ tag: string, val?: string }} */ #method = { tag: "get" };
  /** @type {{ tag: string, val?: string } | undefined} */ #scheme = undefined;
  /** @type {string | undefined} */ #pathWithQuery = undefined;
  /** @type {string | undefined} */ #authority = undefined;
  /** @type {Fields} */ #headers;
  /** @type {OutgoingBody} */ #body;
  #bodyRequested = false;

  constructor(headers) {
    fieldsLock(headers);
    this.#headers = headers;
    this.#body = outgoingBodyCreate();
  }

  body() {
    if (this.#bodyRequested) {
      throw new Error("Body already requested");
    }
    this.#bodyRequested = true;
    return this.#body;
  }

  method() {
    return this.#method;
  }

  setMethod(method) {
    if (method.tag === "other" && !method.val.match(/^[a-zA-Z-]+$/)) {
      throw undefined;
    }
    this.#method = method;
  }

  pathWithQuery() {
    return this.#pathWithQuery;
  }

  setPathWithQuery(pathWithQuery) {
    if (pathWithQuery && !pathWithQuery.match(/^[a-zA-Z0-9.\-_~!$&'()*+,;=:@%?/]+$/)) {
      throw undefined;
    }
    this.#pathWithQuery = pathWithQuery;
  }

  scheme() {
    return this.#scheme;
  }

  setScheme(scheme) {
    if (scheme?.tag === "other" && !scheme.val.match(/^[a-zA-Z]+$/)) {
      throw undefined;
    }
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
        (port !== undefined && (portNum.toString() !== port || portNum > 65535)) ||
        !host.match(/^[a-zA-Z0-9-.]+$/)
      ) {
        throw undefined;
      }
    }
    this.#authority = authority;
  }

  headers() {
    return this.#headers;
  }

  [symbolDispose]() {}

  static _handle(request, options) {
    const scheme = schemeString(request.#scheme);
    const method = request.#method.val || request.#method.tag;

    if (!request.#pathWithQuery) {
      throw { tag: "HTTP-request-URI-invalid" };
    }

    const url = `${scheme}//${request.#authority || ""}${request.#pathWithQuery}`;

    const headers = new Headers();
    for (const [key, value] of request.#headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (!forbiddenHeaders.has(lowerKey)) {
        headers.set(key, utf8Decoder.decode(value));
      }
    }

    const bodyData = outgoingBodyData(request.#body);

    let timeoutMs = Number(DEFAULT_HTTP_TIMEOUT_NS / 1_000_000n);
    if (options) {
      const ct = options.connectTimeout?.() ?? DEFAULT_HTTP_TIMEOUT_NS;
      const fbt = options.firstByteTimeout?.() ?? DEFAULT_HTTP_TIMEOUT_NS;
      const minTimeout = ct < fbt ? ct : fbt;
      timeoutMs = Number(minTimeout / 1_000_000n);
    }

    return futureIncomingResponseCreate(url, method.toUpperCase(), headers, bodyData, timeoutMs);
  }
}
const outgoingRequestHandle = OutgoingRequest._handle;
delete OutgoingRequest._handle;

class IncomingBody {
  #finished = false;
  #stream = undefined;

  stream() {
    if (!this.#stream) {
      throw undefined;
    }
    const stream = this.#stream;
    this.#stream = null;
    return stream;
  }

  static finish(incomingBody) {
    if (incomingBody.#finished) {
      throw new Error("incoming body already finished");
    }
    incomingBody.#finished = true;
    return futureTrailersCreate();
  }

  [symbolDispose]() {}

  static _create(fetchResponse) {
    const incomingBody = new IncomingBody();
    let buffer = null;
    let bufferOffset = 0;
    let done = false;
    let reader = null;
    let readPromise = null;

    function ensureReader() {
      if (!reader && fetchResponse.body) {
        reader = fetchResponse.body.getReader();
      }
    }

    function startRead() {
      if (readPromise || done) {
        return;
      }
      ensureReader();
      if (!reader) {
        done = true;
        return;
      }
      readPromise = reader.read().then(
        (result) => {
          readPromise = null;
          if (result.done) {
            done = true;
          } else {
            buffer = result.value;
            bufferOffset = 0;
          }
        },
        () => {
          readPromise = null;
          done = true;
        },
      );
    }

    incomingBody.#stream = new InputStream({
      read(len) {
        if (done && (buffer === null || bufferOffset >= buffer.byteLength)) {
          throw { tag: "closed" };
        }
        if (buffer !== null && bufferOffset < buffer.byteLength) {
          const available = buffer.byteLength - bufferOffset;
          const toRead = Math.min(Number(len), available);
          const slice = buffer.slice(bufferOffset, bufferOffset + toRead);
          bufferOffset += toRead;
          if (bufferOffset >= buffer.byteLength) {
            buffer = null;
            bufferOffset = 0;
            if (!done) {
              startRead();
            }
          }
          return slice;
        }
        throw { tag: "would-block" };
      },
      blockingRead(len) {
        if (done && (buffer === null || bufferOffset >= buffer.byteLength)) {
          throw { tag: "closed" };
        }
        if (buffer !== null && bufferOffset < buffer.byteLength) {
          const available = buffer.byteLength - bufferOffset;
          const toRead = Math.min(Number(len), available);
          const slice = buffer.slice(bufferOffset, bufferOffset + toRead);
          bufferOffset += toRead;
          if (bufferOffset >= buffer.byteLength) {
            buffer = null;
            bufferOffset = 0;
            if (!done) {
              startRead();
            }
          }
          return slice;
        }
        startRead();
        const waitFor = readPromise || Promise.resolve();
        return waitFor.then(() => {
          if (done && (buffer === null || bufferOffset >= buffer.byteLength)) {
            throw { tag: "closed" };
          }
          if (buffer !== null && bufferOffset < buffer.byteLength) {
            const available = buffer.byteLength - bufferOffset;
            const toRead = Math.min(Number(len), available);
            const slice = buffer.slice(bufferOffset, bufferOffset + toRead);
            bufferOffset += toRead;
            if (bufferOffset >= buffer.byteLength) {
              buffer = null;
              bufferOffset = 0;
              if (!done) {
                startRead();
              }
            }
            return slice;
          }
          throw { tag: "closed" };
        });
      },
      subscribe() {
        if (done || (buffer !== null && bufferOffset < buffer.byteLength)) {
          return new Pollable();
        }
        startRead();
        if (readPromise) {
          return new Pollable(readPromise);
        }
        return new Pollable();
      },
    });

    startRead();
    return incomingBody;
  }
}
const incomingBodyCreate = IncomingBody._create;
delete IncomingBody._create;

class IncomingResponse {
  /** @type {Fields} */ #headers = undefined;
  #status = 0;
  /** @type {IncomingBody} */ #body;

  status() {
    return this.#status;
  }

  headers() {
    return this.#headers;
  }

  consume() {
    if (this.#body === undefined) {
      throw undefined;
    }
    const body = this.#body;
    this.#body = undefined;
    return body;
  }

  [symbolDispose]() {}

  static _create(fetchResponse) {
    const res = new IncomingResponse();
    res.#status = fetchResponse.status;

    const headerEntries = [];
    const encoder = new TextEncoder();
    fetchResponse.headers.forEach((value, key) => {
      headerEntries.push([key, encoder.encode(value)]);
    });
    res.#headers = fieldsLock(fieldsFromEntriesChecked(headerEntries));
    res.#body = incomingBodyCreate(fetchResponse);
    return res;
  }
}
const incomingResponseCreate = IncomingResponse._create;
delete IncomingResponse._create;

class FutureTrailers {
  #requested = false;
  subscribe() {
    return new Pollable();
  }
  get() {
    if (this.#requested) {
      return { tag: "err" };
    }
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
    return new FutureTrailers();
  }
}
const futureTrailersCreate = FutureTrailers._create;
delete FutureTrailers._create;

function mapFetchError(err) {
  if (err.name === "AbortError") {
    return { tag: "connection-timeout" };
  }
  if (err.name === "TypeError") {
    return { tag: "connection-refused" };
  }
  return { tag: "internal-error", val: err.message };
}

class FutureIncomingResponse {
  #result = undefined;
  #promise = null;

  subscribe() {
    return new Pollable(this.#promise);
  }

  get() {
    if (this.#result === undefined) {
      return undefined;
    }
    const result = this.#result;
    this.#result = { tag: "err" };
    return result;
  }

  [symbolDispose]() {
    this.#promise = null;
  }

  static _create(url, method, headers, bodyData, timeoutMs) {
    const future = new FutureIncomingResponse();

    const controller = new AbortController();
    let timer;
    if (timeoutMs < Infinity) {
      timer = setTimeout(() => controller.abort(), timeoutMs);
    }

    const init = {
      method,
      headers,
      signal: controller.signal,
    };
    if (bodyData && method !== "GET" && method !== "HEAD") {
      init.body = bodyData;
    }

    future.#promise = fetch(url, init).then(
      (response) => {
        if (timer) {
          clearTimeout(timer);
        }
        future.#result = {
          tag: "ok",
          val: {
            tag: "ok",
            val: incomingResponseCreate(response),
          },
        };
      },
      (err) => {
        if (timer) {
          clearTimeout(timer);
        }
        future.#result = {
          tag: "ok",
          val: {
            tag: "err",
            val: mapFetchError(err),
          },
        };
      },
    );

    return future;
  }
}
const futureIncomingResponseCreate = FutureIncomingResponse._create;
delete FutureIncomingResponse._create;

function schemeString(scheme) {
  if (!scheme) {
    return "https:";
  }
  switch (scheme.tag) {
    case "HTTP":
      return "http:";
    case "HTTPS":
      return "https:";
    case "other":
      return scheme.val.toLowerCase() + ":";
  }
}

function httpErrorCode(err) {
  if (err.payload) {
    return err.payload;
  }
  return {
    tag: "internal-error",
    val: err.message,
  };
}

export const outgoingHandler = {
  handle: outgoingRequestHandle,
};

export const incomingHandler = {
  handle() {},
};

export const types = {
  Fields,
  FutureIncomingResponse,
  FutureTrailers,
  IncomingBody,
  IncomingRequest: class IncomingRequest {},
  IncomingResponse,
  OutgoingBody,
  OutgoingRequest,
  OutgoingResponse: class OutgoingResponse {},
  ResponseOutparam: class ResponseOutparam {},
  RequestOptions,
  httpErrorCode,
};
