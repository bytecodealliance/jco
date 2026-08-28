// The Preview 2 shim provides browser-safe host implementations for the component's WASI imports.
import { http, sockets } from '@bytecodealliance/preview2-shim';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

// Jco's transpiled output exposes the component through this generated instantiation function.
import { instantiate } from './transpiled/component.js';

// These demo-specific adapters make the filesystem and guest-owned socket behavior visible on the page.
import { createReverseFilesystem } from './reverse-filesystem.js';
import { createSocketServer } from './socket-server.js';

// Shared browser state used by the host implementations and UI handlers.
const status = document.querySelector('#status');
const decoder = new TextDecoder();
const encoder = new TextEncoder();
const coreModules = new Map();
const serverAddress = (port) => ({
    tag: 'ipv4',
    val: { address: [127, 0, 0, 1], port },
});
const clientAddress = serverAddress(8001);

// Override the default stderr host implementation so component output appears on the page.
let hasStderrOutput = false;
const stderrOutput = document.querySelector('#stderr-output');
const pageStderr = {
    write(bytes) {
        appendStderr(decoder.decode(bytes, { stream: true }));
    },
    flush() {
        appendStderr(decoder.decode());
    },
    blockingFlush() {
        this.flush();
    },
};

try {
    // Build the in-memory host resources that the component will interact with.
    const reverseFilesystem = createReverseFilesystem();
    const tcpSockets = new sockets.InMemoryTcpSockets();
    const udpSockets = new sockets.InMemoryUdpSockets();
    const udpClient = udpSockets.createClient(clientAddress);

    // Collect the configured WASI host implementations into the component's import object.
    const shim = new WASIShim({
        stderr: pageStderr,
        browserFilesystem: {
            adapter: reverseFilesystem.adapter,
            preopens: { '/demo': reverseFilesystem.data },
        },
        tcpSockets,
        udpSockets,
    });
    const imports = shim.getImportObject();
    imports['example:browser-p2-shims/socket-server'] = createSocketServer(imports);

    // Instantiate the component for use below, fulfilling its host imports with the configured shim.
    const instance = await instantiate(loadCoreModule, imports);
    const httpClient = new http.InMemoryHttpClient(instance.incomingHandler);

    // WASI CLI: route component stdout to the console and customized stderr to the page.
    onClick('#write-stdout', async () => await instance.cliDemo.writeToStdout(value('#stdout-message')));
    onClick('#write-stderr', async () => await instance.cliDemo.writeToStderr(value('#stderr-message')));
    onClick('#clear-stderr', resetStderr);

    // WASI clocks: ask the component for host-provided wall and monotonic times.
    onClick('#read-clocks', () => {
        const snapshot = instance.clocksDemo.readClocks();
        const wallMilliseconds = Number(snapshot.wallSeconds) * 1_000 + snapshot.wallNanoseconds / 1_000_000;
        output('#clocks-output', {
            wall: new Date(wallMilliseconds).toISOString(),
            monotonicMilliseconds: Number(snapshot.monotonicNanoseconds) / 1_000_000,
        });
    });

    // WASI filesystem: compare the component's logical file with its reversed host storage.
    onClick('#write-file', () => {
        const logical = instance.filesystemDemo.writeHelloWorld();
        output('#filesystem-output', {
            componentReads: logical,
            adapterStores: reverseFilesystem.storedText('hello.txt'),
        });
    });

    // Incoming WASI HTTP: act as a client sending a fabricated Web Request into the component.
    onClick('#send-http', async () => {
        const response = await httpClient.fetch(
            new Request('https://example.invalid/demo?source=browser', {
                method: 'POST',
                body: value('#http-message'),
            }),
        );
        output('#http-output', `${response.status} ${await response.text()}`);
    });

    // Outgoing WASI HTTP: intercept the component's request and return a recognizable host response.
    onClick('#send-outgoing-http', async () => {
        const hostFetch = globalThis.fetch;
        globalThis.fetch = async (input, init) => {
            const request = new Request(input, init);
            if (new URL(request.url).hostname !== 'mock.invalid') {
                return hostFetch(input, init);
            }
            const body = await request.text();
            return new Response(`Mocked response to ${request.method} ${new URL(request.url).pathname}: ${body}`, {
                status: 202,
                headers: { 'x-intercepted-by': 'browser host' },
            });
        };
        try {
            output('#outgoing-http-output', await instance.outgoingHttpDemo.request(value('#outgoing-http-message')));
        } finally {
            globalThis.fetch = hostFetch;
        }
    });

    // WASI sockets: the page acts as the client while the component controls both in-memory servers.
    onClick('#send-tcp', () => {
        const client = tcpSockets.connect(serverAddress(7000));
        client.write(encoder.encode(value('#tcp-message')));
        instance.tcpDemo.serveOnce();
        output('#tcp-output', decoder.decode(client.read()));
    });

    onClick('#send-udp', () => {
        udpClient.send(encoder.encode(value('#udp-message')), serverAddress(7001));
        instance.udpDemo.serveOnce();
        output('#udp-output', decoder.decode(udpClient.read()));
    });

    // Enable interaction only after the component and all host implementations are ready.
    for (const button of document.querySelectorAll('button[disabled]')) button.disabled = false;
    status.dataset.state = 'ready';
    status.textContent = 'Component ready';
} catch (error) {
    status.dataset.state = 'error';
    status.textContent = `Failed to load component: ${error.message}`;
    console.error(error);
}

// Lazily compile and cache the component's core WebAssembly modules as Jco requests them.
async function loadCoreModule(path) {
    let module = coreModules.get(path);
    if (!module) {
        module = WebAssembly.compileStreaming(fetch(new URL(`./transpiled/${path}`, import.meta.url)));
        coreModules.set(path, module);
    }
    return module;
}

// Small DOM helpers keep the interface examples above focused on their WASI calls.
function onClick(selector, callback) {
    document.querySelector(selector).addEventListener('click', callback);
}

function value(selector) {
    return document.querySelector(selector).value;
}

function output(selector, result) {
    document.querySelector(selector).textContent =
        typeof result === 'string' ? result : JSON.stringify(result, null, 2);
}

// Render bytes written through the custom stderr implementation.
function appendStderr(text) {
    if (!text) return;
    if (!hasStderrOutput) {
        stderrOutput.textContent = '';
        hasStderrOutput = true;
    }
    stderrOutput.append(document.createTextNode(text));
}

function resetStderr() {
    hasStderrOutput = false;
    stderrOutput.innerHTML = '<span class="empty-output">No stderr output yet.</span>';
}
