import { createServer } from 'node:http';
import { parentPort } from 'node:worker_threads';

const server = createServer((req, res) => {
    const headers = {
        'content-type': 'application/octet-stream',
        'x-wasmtime-test-method': req.method,
        'x-wasmtime-test-uri': req.url,
    };
    if (req.headers['content-length']) {
        headers['content-length'] = req.headers['content-length'];
    }
    res.writeHead(200, headers);
    res.flushHeaders();
    req.pipe(res);
});
server.on('connect', (_req, socket) => socket.destroy());
parentPort.once('message', ({ type }) => {
    if (type !== 'close') {
        throw new Error(`unexpected P3 HTTP server command: ${type}`);
    }
    server.closeAllConnections();
    server.close((error) => {
        if (error) {
            throw error;
        }
        parentPort.postMessage({ type: 'closed' });
        parentPort.close();
    });
});
server.listen(0, '127.0.0.1', () => {
    const { address, port } = server.address();
    parentPort.postMessage({ type: 'ready', address: `${address}:${port}` });
});
