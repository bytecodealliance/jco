export function dropFields(fields) {
  console.log("[types] Drop fields");
}
export function newFields(entries) {
  console.log("[types] New fields");
}
export function fieldsGet(fields, name) {
  console.log("[types] Fields get");
}
export function fieldsSet(fields, name, value) {
  console.log("[types] Fields set");
}
export function fieldsDelete(fields, name) {
  console.log("[types] Fields delete");
}
export function fieldsAppend(fields, name, value) {
  console.log("[types] Fields append");
}
export function fieldsEntries(fields) {
  console.log("[types] Fields entries");
}
export function fieldsClone(fields) {
  console.log("[types] Fields clone");
}
export function finishIncomingStream(s) {
  console.log(`[types] Finish incoming stream ${s}`);
}
export function finishOutgoingStream(s, trailers) {
  console.log(`[types] Finish outgoing stream ${s}`);
}
export function dropIncomingRequest(req) {
  console.log("[types] Drop incoming request");
}
export function dropOutgoingRequest(req) {
  console.log("[types] Drop outgoing request");
}
export function incomingRequestMethod(req) {
  console.log("[types] Incoming request method");
}
export function incomingRequestPath(req) {
  console.log("[types] Incoming request path");
}
export function incomingRequestQuery(req) {
  console.log("[types] Incoming request query");
}
export function incomingRequestScheme(req) {
  console.log("[types] Incoming request scheme");
}
export function incomingRequestAuthority(req) {
  console.log("[types] Incoming request authority");
}
export function incomingRequestHeaders(req) {
  console.log("[types] Incoming request headers");
}
export function incomingRequestConsume(req) {
  console.log("[types] Incoming request consume");
}
export function newOutgoingRequest(method, path, query, scheme, authority, headers) {
  console.log("[types] New outgoing request");
}
export function outgoingRequestWrite(req) {
  console.log("[types] Outgoing request write");
}
export function dropResponseOutparam(res) {
  console.log("[types] Drop response outparam");
}
export function setResponseOutparam(response) {
  console.log("[types] Drop fields");
}
export function dropIncomingResponse(res) {
  console.log("[types] Drop incoming response");
}
export function dropOutgoingResponse(res) {
  console.log("[types] Drop outgoing response");
}
export function incomingResponseStatus(res) {
  console.log("[types] Incoming response status");
}
export function incomingResponseHeaders(res) {
  console.log("[types] Incoming response headers");
}
export function incomingResponseConsume(res) {
  console.log("[types] Incoming response consume");
}
export function newOutgoingResponse(statusCode, headers) {
  console.log("[types] New outgoing response");
}
export function outgoingResponseWrite(res) {
  console.log("[types] Outgoing response write");
}
export function dropFutureIncomingResponse(f) {
  console.log("[types] Drop future incoming response");
}
export function futureIncomingResponseGet(f) {
  console.log("[types] Future incoming response get");
}
export function listenToFutureIncomingResponse(f) {
  console.log("[types] Listen to future incoming response");
}
