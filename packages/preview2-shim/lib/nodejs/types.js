export function dropFields(_fields) {
  console.log("[types] Drop fields");
}
export function newFields(_entries) {
  console.log("[types] New fields");
}
export function fieldsGet(_fields, _name) {
  console.log("[types] Fields get");
}
export function fieldsSet(_fields, _name, _value) {
  console.log("[types] Fields set");
}
export function fieldsDelete(_fields, _name) {
  console.log("[types] Fields delete");
}
export function fieldsAppend(_fields, _name, _value) {
  console.log("[types] Fields append");
}
export function fieldsEntries(_fields) {
  console.log("[types] Fields entries");
}
export function fieldsClone(_fields) {
  console.log("[types] Fields clone");
}
export function finishIncomingStream(s) {
  console.log(`[types] Finish incoming stream ${s}`);
}
export function finishOutgoingStream(s, _trailers) {
  console.log(`[types] Finish outgoing stream ${s}`);
}
export function dropIncomingRequest(_req) {
  console.log("[types] Drop incoming request");
}
export function dropOutgoingRequest(_req) {
  console.log("[types] Drop outgoing request");
}
export function incomingRequestMethod(_req) {
  console.log("[types] Incoming request method");
}
export function incomingRequestPath(_req) {
  console.log("[types] Incoming request path");
}
export function incomingRequestQuery(_req) {
  console.log("[types] Incoming request query");
}
export function incomingRequestScheme(_req) {
  console.log("[types] Incoming request scheme");
}
export function incomingRequestAuthority(_req) {
  console.log("[types] Incoming request authority");
}
export function incomingRequestHeaders(_req) {
  console.log("[types] Incoming request headers");
}
export function incomingRequestConsume(_req) {
  console.log("[types] Incoming request consume");
}
export function newOutgoingRequest(_method, _path, _query, _scheme, _authority, _headers) {
  console.log("[types] New outgoing request");
}
export function outgoingRequestWrite(_req) {
  console.log("[types] Outgoing request write");
}
export function dropResponseOutparam(_res) {
  console.log("[types] Drop response outparam");
}
export function setResponseOutparam(_response) {
  console.log("[types] Drop fields");
}
export function dropIncomingResponse(_res) {
  console.log("[types] Drop incoming response");
}
export function dropOutgoingResponse(_res) {
  console.log("[types] Drop outgoing response");
}
export function incomingResponseStatus(_res) {
  console.log("[types] Incoming response status");
}
export function incomingResponseHeaders(_res) {
  console.log("[types] Incoming response headers");
}
export function incomingResponseConsume(_res) {
  console.log("[types] Incoming response consume");
}
export function newOutgoingResponse(_statusCode, _headers) {
  console.log("[types] New outgoing response");
}
export function outgoingResponseWrite(_res) {
  console.log("[types] Outgoing response write");
}
export function dropFutureIncomingResponse(_f) {
  console.log("[types] Drop future incoming response");
}
export function futureIncomingResponseGet(_f) {
  console.log("[types] Future incoming response get");
}
export function listenToFutureIncomingResponse(_f) {
  console.log("[types] Listen to future incoming response");
}
