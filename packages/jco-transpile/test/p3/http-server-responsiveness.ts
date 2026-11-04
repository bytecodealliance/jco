import { Worker } from 'node:worker_threads';
import { expect, test } from 'vitest';
import { startP3HttpServer } from './helpers/http.js';

test.concurrent('the fixture HTTP server responds while the test worker is blocked', async () => {
    const server = await startP3HttpServer();
    const gate = new Int32Array(new SharedArrayBuffer(4));
    const client = new Worker(
        `
        const { parentPort, workerData } = require('node:worker_threads');
        const { request } = require('node:http');
        const req = request('http://' + workerData.address + '/echo?blocked=1', {
            method: 'POST', headers: { 'content-length': '5' },
        }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => parentPort.postMessage({ status: res.statusCode, headers: res.headers, body }));
        });
        req.setTimeout(500, () => req.destroy(new Error('fixture server response timed out')));
        req.on('error', (error) => { throw error; });
        req.end('hello');
        const gate = new Int32Array(workerData.gate);
        Atomics.store(gate, 0, 1);
        Atomics.notify(gate, 0);
    `,
        { eval: true, execArgv: [], workerData: { address: server.address, gate: gate.buffer } },
    );
    let responded = false;
    const response = new Promise<{
        status: number;
        headers: Record<string, string | string[] | undefined>;
        body: string;
    }>((resolve, reject) => {
        client.once('message', (message) => {
            responded = true;
            resolve(message);
        });
        client.once('error', reject);
        client.once('exit', (code) => {
            if (!responded) {
                reject(new Error(`HTTP client worker exited without a response (code ${code})`));
            }
        });
    });
    void response.catch(() => {});
    try {
        // Synchronize without yielding this worker's event loop to a local HTTP
        // server, then keep it blocked longer than the client's response deadline.
        Atomics.wait(gate, 0, 0, 5000);
        expect(Atomics.load(gate, 0)).toBe(1);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
        const result = await response;
        expect(result.status).toBe(200);
        expect(result.body).toBe('hello');
        expect(result.headers['content-type']).toBe('application/octet-stream');
        expect(result.headers['content-length']).toBe('5');
        expect(result.headers['x-wasmtime-test-method']).toBe('POST');
        expect(result.headers['x-wasmtime-test-uri']).toBe('/echo?blocked=1');
    } finally {
        await client.terminate();
        await server.cleanup();
    }
});
