import { http, sockets } from '@bytecodealliance/preview2-shim';
import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { instantiate } from './transpiled/component.js';
import { createReverseFilesystem } from './reverse-filesystem.js';
import { createSocketServer } from './socket-server.js';

const status = document.querySelector('#status');
const decoder = new TextDecoder();
const encoder = new TextEncoder();
const coreModules = new Map();
const serverAddress = (port) => ({
    tag: 'ipv4',
    val: { address: [127, 0, 0, 1], port },
});
const clientAddress = serverAddress(8001);

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
    const reverseFilesystem = createReverseFilesystem();
    const tcpSockets = new sockets.InMemoryTcpSockets();
    const udpSockets = new sockets.InMemoryUdpSockets();
    const udpClient = udpSockets.createClient(clientAddress);
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
    const instance = await instantiate(loadCoreModule, imports);
    const httpClient = new http.InMemoryHttpClient(instance.incomingHandler);

    onClick('#write-stdout', async () => await instance.cliDemo.writeToStdout(value('#stdout-message')));
    onClick('#write-stderr', async () => await instance.cliDemo.writeToStderr(value('#stderr-message')));
    onClick('#clear-stderr', resetStderr);

    onClick('#read-clocks', () => {
        const snapshot = instance.clocksDemo.readClocks();
        const wallMilliseconds = Number(snapshot.wallSeconds) * 1_000 + snapshot.wallNanoseconds / 1_000_000;
        output('#clocks-output', {
            wall: new Date(wallMilliseconds).toISOString(),
            monotonicMilliseconds: Number(snapshot.monotonicNanoseconds) / 1_000_000,
        });
    });

    onClick('#write-file', () => {
        const logical = instance.filesystemDemo.writeHelloWorld();
        output('#filesystem-output', {
            componentReads: logical,
            adapterStores: reverseFilesystem.storedText('hello.txt'),
        });
    });

    onClick('#send-http', async () => {
        const response = await httpClient.fetch(
            new Request('https://example.invalid/demo?source=browser', {
                method: 'POST',
                body: value('#http-message'),
            }),
        );
        output('#http-output', `${response.status} ${await response.text()}`);
    });

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

    for (const button of document.querySelectorAll('button[disabled]')) button.disabled = false;
    status.dataset.state = 'ready';
    status.textContent = 'Component ready';
} catch (error) {
    status.dataset.state = 'error';
    status.textContent = `Failed to load component: ${error.message}`;
    console.error(error);
}

async function loadCoreModule(path) {
    let module = coreModules.get(path);
    if (!module) {
        module = WebAssembly.compileStreaming(fetch(new URL(`./transpiled/${path}`, import.meta.url)));
        coreModules.set(path, module);
    }
    return module;
}

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
