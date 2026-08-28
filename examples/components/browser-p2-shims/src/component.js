import { now as monotonicNow } from 'wasi:clocks/monotonic-clock@0.2.12';
import { now as wallNow } from 'wasi:clocks/wall-clock@0.2.12';
import { getDirectories } from 'wasi:filesystem/preopens@0.2.12';
import { Fields, IncomingBody, OutgoingBody, OutgoingResponse, ResponseOutparam } from 'wasi:http/types@0.2.12';
import { TcpServer, UdpServer } from 'example:browser-p2-shims/socket-server';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const symbolDispose = Symbol.dispose || Symbol.for('dispose');

/**
 * Call path for `wasi:cli`:
 *
 * 1. This code calls console.log(message) or console.error(message).
 * 2. ComponentizeJS lowers the call to a write on the output stream returned by
 *    wasi:cli/stdout.get-stdout or wasi:cli/stderr.get-stderr. The stream is a
 *    wasi:io/streams.output-stream resource.
 * 3. The Jco-generated wrapper routes those WASI imports through the object
 *    returned by WASIShim.getImportObject().
 * 4. The browser host handles the bytes. By default stdout calls console.log;
 *    the demo's customized stderr handler writes them to the page instead.
 */
export const cliDemo = {
    writeToStdout(message) {
        console.log(message);
    },

    writeToStderr(message) {
        console.error(message);
    },
};

/**
 * Call path for `wasi:clocks`:
 *
 * 1. This code calls the imported wall and monotonic clock functions.
 * 2. The component calls `wasi:clocks/wall-clock.now` and
 *    `wasi:clocks/monotonic-clock.now`.
 * 3. The browser shim supplies timestamps from `Date.now()` and
 *    `performance.now()` to the component, which returns them to the page.
 */
export const clocksDemo = {
    readClocks() {
        const wall = wallNow();
        return {
            wallSeconds: wall.seconds,
            wallNanoseconds: wall.nanoseconds,
            monotonicNanoseconds: monotonicNow(),
        };
    },
};

/**
 * Call path for `wasi:filesystem`:
 *
 * 1. This code opens the browser-configured `/demo` preopen, writes
 *    `hello world`, calls `syncData()`, and reads the file back.
 * 2. Those descriptor calls cross `wasi:filesystem/preopens` and
 *    `wasi:filesystem/types`.
 * 3. The host's reverse-storage adapter delegates to the in-memory adapter
 *    while reversing bytes at its boundary.
 */
export const filesystemDemo = {
    writeHelloWorld() {
        const [root] = getDirectories().find(([, path]) => path === '/demo') ?? [];
        if (!root) {
            throw new Error('missing /demo filesystem preopen');
        }
        const file = root.openAt(
            { symlinkFollow: false },
            'hello.txt',
            { create: true, truncate: true },
            { read: true, write: true },
        );
        file.write(encoder.encode('hello world'), 0n);
        file.syncData();
        const [contents] = file.read(11n, 0n);
        return decoder.decode(contents);
    },
};

/**
 * Call path for `wasi:http/outgoing-handler`:
 *
 * 1. This component makes a normal Web `fetch()` request.
 * 2. ComponentizeJS lowers it to `wasi:http/outgoing-handler`; the browser shim
 *    converts the WASI request back into a host Fetch call.
 * 3. The demo host intercepts that call and returns a mocked Web `Response`.
 *    The shim translates it back into the response read here by the component.
 */
export const outgoingHttpDemo = {
    async request(message) {
        const response = await fetch('https://mock.invalid/outgoing?from=component', {
            method: 'POST',
            headers: { 'content-type': 'text/plain' },
            body: message,
        });
        return {
            status: response.status,
            interceptedBy: response.headers.get('x-intercepted-by') ?? '',
            body: await response.text(),
        };
    },
};

/**
 * Call path for `wasi:sockets/tcp`:
 *
 * 1. This component constructs the server socket resource and controls its
 *    bind, listen, accept, read, and write sequence.
 * 2. The imported resource maps those operations to the injected
 *    `wasi:sockets/tcp` namespaces.
 * 3. The page acts only as the client; the in-memory adapter carries its bytes
 *    to this server without opening a real network port.
 */
export const tcpDemo = {
    serveOnce() {
        const socket = new TcpServer();
        socket.startBind(7000);
        socket.finishBind();
        socket.startListen();
        socket.finishListen();
        socket.accept();
        socket.write(`TCP: ${socket.read()}`);
        socket[symbolDispose]();
    },
};

/**
 * Call path for `wasi:sockets/udp`:
 *
 * 1. This component constructs and binds the server socket resource, creates
 *    its datagram streams, and controls receive and send.
 * 2. The imported resource maps those operations to the injected
 *    `wasi:sockets/udp` namespaces.
 * 3. The page acts only as the client; the in-memory adapter routes both
 *    datagrams without using the browser network stack.
 */
export const udpDemo = {
    serveOnce() {
        const socket = new UdpServer();
        socket.startBind(7001);
        socket.finishBind();
        socket.stream();
        socket.send(`UDP: ${socket.receive()}`);
        socket[symbolDispose]();
    },
};

/**
 * Call path for `wasi:http/incoming-handler`:
 *
 * 1. The page fabricates a standard Web `Request` and passes it to the
 *    browser shim's `handleIncomingRequest` helper.
 * 2. The helper converts it to WASI HTTP resources and invokes this exported
 *    component handler.
 * 3. This code reads the request and builds a WASI response; the shim converts
 *    that response back into a standard Web `Response` for the page.
 */
export const incomingHandler = {
    handle(request, responseOut) {
        const incomingBody = request.consume();
        const input = incomingBody.stream();
        const body = input.blockingRead(4_000n);
        input[symbolDispose]();
        IncomingBody.finish(incomingBody)[symbolDispose]();
        const method = formatMethod(request.method());
        const response = new OutgoingResponse(new Fields());
        response.setStatusCode(200);
        const outgoingBody = response.body();
        const output = outgoingBody.write();
        output.blockingWriteAndFlush(
            encoder.encode(`HTTP ${method} ${request.pathWithQuery()}: ${decoder.decode(body)}`),
        );
        output[symbolDispose]();
        OutgoingBody.finish(outgoingBody);
        ResponseOutparam.set(responseOut, { tag: 'ok', val: response });
    },
};

function formatMethod(method) {
    return method.tag === 'other' ? method.val : method.tag.toUpperCase();
}
