import { fileURLToPath } from "node:url";
import { UnexpectedError } from "../http/error.js";
import { createSyncFn } from "../http/synckit/index.js";

const workerPath = fileURLToPath(new URL('../http/make-request.js', import.meta.url));

export function send(req) {
  console.log(`[http] Send (nodejs) ${req.uri}`);
  const syncFn = createSyncFn(workerPath);
  let rawResponse = syncFn(req);
  let response = JSON.parse(rawResponse);
  if (response.status) {
    return {
      ...response,
      body: response.body ? Buffer.from(response.body, "base64") : undefined,
    };
  }
  throw new UnexpectedError(response);
}

export const incomingHandler = {
  handle () {

  }
};

export const outgoingHandler = {
  handle () {

  }
};

export const types = {
  dropFields(_fields) {
    console.log("[types] Drop fields");
  },
  newFields(_entries) {
    console.log("[types] New fields");
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
  fieldsEntries(_fields) {
    console.log("[types] Fields entries");
  },
  fieldsClone(_fields) {
    console.log("[types] Fields clone");
  },
  finishIncomingStream(s) {
    console.log(`[types] Finish incoming stream ${s}`);
  },
  finishOutgoingStream(s, _trailers) {
    console.log(`[types] Finish outgoing stream ${s}`);
  },
  dropIncomingRequest(_req) {
    console.log("[types] Drop incoming request");
  },
  dropOutgoingRequest(_req) {
    console.log("[types] Drop outgoing request");
  },
  incomingRequestMethod(_req) {
    console.log("[types] Incoming request method");
  },
  incomingRequestPath(_req) {
    console.log("[types] Incoming request path");
  },
  incomingRequestQuery(_req) {
    console.log("[types] Incoming request query");
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
  newOutgoingRequest(_method, _path, _query, _scheme, _authority, _headers) {
    console.log("[types] New outgoing request");
  },
  outgoingRequestWrite(_req) {
    console.log("[types] Outgoing request write");
  },
  dropResponseOutparam(_res) {
    console.log("[types] Drop response outparam");
  },
  setResponseOutparam(_response) {
    console.log("[types] Drop fields");
  },
  dropIncomingResponse(_res) {
    console.log("[types] Drop incoming response");
  },
  dropOutgoingResponse(_res) {
    console.log("[types] Drop outgoing response");
  },
  incomingResponseStatus(_res) {
    console.log("[types] Incoming response status");
  },
  incomingResponseHeaders(_res) {
    console.log("[types] Incoming response headers");
  },
  incomingResponseConsume(_res) {
    console.log("[types] Incoming response consume");
  },
  newOutgoingResponse(_statusCode, _headers) {
    console.log("[types] New outgoing response");
  },
  outgoingResponseWrite(_res) {
    console.log("[types] Outgoing response write");
  },
  dropFutureIncomingResponse(_f) {
    console.log("[types] Drop future incoming response");
  },
  futureIncomingResponseGet(_f) {
    console.log("[types] Future incoming response get");
  },
  listenToFutureIncomingResponse(_f) {
    console.log("[types] Listen to future incoming response");
  }
};
