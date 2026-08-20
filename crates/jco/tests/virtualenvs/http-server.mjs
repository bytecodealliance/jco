import { createServer } from 'node:http';
import { parentPort } from 'node:worker_threads';

let PORT = 8125;

const server = createServer((req, res) => {
    const chunks = [];

    // Do not pipe the request directly into the response. The guest finishes its
    // upload before reading the echo, so Windows response backpressure can stop
    // the server from reading the remaining request and leave both sides waiting
    // indefinitely (https://github.com/bytecodealliance/jco/issues/1038).
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
        res.writeHead(200, {
            'x-wasmtime-test-method': req.method,
            'x-wasmtime-test-uri': req.url,
            'content-type': 'text/html',
        });
        res.end(Buffer.concat(chunks));
    });
});

let retry = false;
do {
    retry = await new Promise((resolve, reject) => {
        server.listen(PORT, resolve);
        server.on('error', (e) => {
            if (e.code === 'EADDRINUSE') {
                PORT++;
                resolve(true);
            } else {
                reject(e);
            }
        });
    });
} while (retry);

parentPort.postMessage(PORT);
