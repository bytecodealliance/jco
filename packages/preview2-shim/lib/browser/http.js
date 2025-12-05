/**
 * @param {import("../../types/interfaces/wasi-http-types").Request} req
 * @returns {string}
 */
export function send(req) {
    console.log(`[http] Send (browser) ${req.uri}`);
    try {
        const xhr = new XMLHttpRequest();
        xhr.open(req.method.toString(), req.uri, false);
        const requestHeaders = new Headers(req.headers);
        for (let [name, value] of requestHeaders.entries()) {
            if (name !== 'user-agent' && name !== 'host') {
                xhr.setRequestHeader(name, value);
            }
        }
        xhr.send(req.body && req.body.length > 0 ? req.body : null);
        const body = xhr.response
            ? new TextEncoder().encode(xhr.response)
            : undefined;
        const headers = [];
        xhr.getAllResponseHeaders()
            .trim()
            .split(/[\r\n]+/)
            .forEach((line) => {
                var parts = line.split(': ');
                var key = parts.shift();
                var value = parts.join(': ');
                headers.push([key, value]);
            });
        return {
            status: xhr.status,
            headers,
            body,
        };
    } catch (err) {
        throw new Error(err.message);
    }
}

export const incomingHandler = {
    handle() {},
};

export const outgoingHandler = {
    handle() {},
};

export const types = {
    dropFields(_fields) {
        console.log('[types] Drop fields');
    },
    newFields(_entries) {
        console.log('[types] New fields');
    },
    fieldsGet(_fields, _name) {
        console.log('[types] Fields get');
    },
    fieldsSet(_fields, _name, _value) {
        console.log('[types] Fields set');
    },
    fieldsDelete(_fields, _name) {
        console.log('[types] Fields delete');
    },
    fieldsAppend(_fields, _name, _value) {
        console.log('[types] Fields append');
    },
    fieldsEntries(_fields) {
        console.log('[types] Fields entries');
    },
    fieldsClone(_fields) {
        console.log('[types] Fields clone');
    },
    finishIncomingStream(s) {
        console.log(`[types] Finish incoming stream ${s}`);
    },
    finishOutgoingStream(s, _trailers) {
        console.log(`[types] Finish outgoing stream ${s}`);
    },
    dropIncomingRequest(_req) {
        console.log('[types] Drop incoming request');
    },
    dropOutgoingRequest(_req) {
        console.log('[types] Drop outgoing request');
    },
    incomingRequestMethod(_req) {
        console.log('[types] Incoming request method');
    },
    incomingRequestPathWithQuery(_req) {
        console.log('[types] Incoming request path with query');
    },
    incomingRequestScheme(_req) {
        console.log('[types] Incoming request scheme');
    },
    incomingRequestAuthority(_req) {
        console.log('[types] Incoming request authority');
    },
    incomingRequestHeaders(_req) {
        console.log('[types] Incoming request headers');
    },
    incomingRequestConsume(_req) {
        console.log('[types] Incoming request consume');
    },
    newOutgoingRequest(_method, _pathWithQuery, _scheme, _authority, _headers) {
        console.log('[types] New outgoing request');
    },
    outgoingRequestWrite(_req) {
        console.log('[types] Outgoing request write');
    },
    dropResponseOutparam(_res) {
        console.log('[types] Drop response outparam');
    },
    setResponseOutparam(_response) {
        console.log('[types] Drop fields');
    },
    dropIncomingResponse(_res) {
        console.log('[types] Drop incoming response');
    },
    dropOutgoingResponse(_res) {
        console.log('[types] Drop outgoing response');
    },
    incomingResponseStatus(_res) {
        console.log('[types] Incoming response status');
    },
    incomingResponseHeaders(_res) {
        console.log('[types] Incoming response headers');
    },
    incomingResponseConsume(_res) {
        console.log('[types] Incoming response consume');
    },
    newOutgoingResponse(_statusCode, _headers) {
        console.log('[types] New outgoing response');
    },
    outgoingResponseWrite(_res) {
        console.log('[types] Outgoing response write');
    },
    dropFutureIncomingResponse(_f) {
        console.log('[types] Drop future incoming response');
    },
    futureIncomingResponseGet(_f) {
        console.log('[types] Future incoming response get');
    },
    listenToFutureIncomingResponse(_f) {
        console.log('[types] Listen to future incoming response');
    },
    Fields: class Fields {},
    FutureIncomingResponse: new class FutureIncomingResponse {},
    IncomingBody: new class IncomingBody {},
    IncomingRequest: new class IncomingRequest {},
    IncomingResponse: new class IncomingResponse {},
    OutgoingBody: new class OutgoingBody {},
    OutgoingRequest: new class OutgoingRequest {},
    OutgoingResponse: new class OutgoingResponse {},
    RequestOptions: new class RequestOptions {},
    ResponseOutparam: new class ResponseOutparam {},
};
