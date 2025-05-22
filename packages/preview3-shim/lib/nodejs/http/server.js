import { ResourceWorker } from '../workers/resource-worker.js';
import { StreamReader } from '../stream.js';
import { FutureReader } from '../future.js';
import { Request } from './request.js';

import { HttpError } from './error.js';
import { _fieldsFromEntriesChecked } from './fields.js';

const _worker = new ResourceWorker(
    new URL('../workers/http-worker.js', import.meta.url)
);

/**
 * HttpServer uses a background worker thread to handle raw HTTP connections,
 * while the main thread invokes the user-provided handler and sends back the
 * response.
 */
export class HttpServer {
    #serverId = null;
    #handler = null;
    #shutdown = null;

    constructor(handler) {
        if (typeof handler?.handle !== 'function') {
            throw HttpError(
                'invalid-argument',
                'Not a valid HTTP server component to execute.'
            );
        }
        this.#handler = handler;
    }

    async listen(port, host) {
        this.#serverId = await _worker.run({
            op: 'http-server-start',
            port,
            host,
        });

        this.#shutdown = this.#serveLoop();
    }

    async stop() {
        if (!this.#serverId) return;

        await _worker.run({
            op: 'http-server-stop',
            serverId: this.#serverId,
        });

        await this.#shutdown;
    }

    async close() {
        if (!this.#serverId) return;

        await this.stop();
        await _worker.run({
            op: 'http-server-close',
            serverId: this.#serverId,
        });

        this.#serverId = null;
    }

    async #serveLoop() {
        let next;

        const nextRequest = async () =>
            await _worker.run({
                op: 'http-server-next',
                serverId: this.#serverId,
            });

        while ((next = await nextRequest()) !== null) {
            try {
                const { requestId } = next;

                const req = requestFromParts(next);
                const outcome = await this.#handler.handle(req);

                if (outcome.tag === 'ok') {
                    const res = outcome.val;
                    const { body, trailers } = res.body();
                    const { port1: tx, port2: rx } = new MessageChannel();

                    const stream = body.intoStream();

                    // Send trailers when ready
                    trailers
                        .read()
                        .then((val) => tx.postMessage({ val }))
                        .catch((err) => tx.postMessage({ err }))
                        .finally(() => tx.close());

                    await _worker.run(
                        {
                            op: 'http-server-response',
                            serverId: this.#serverId,
                            requestId,
                            statusCode: res.statusCode(),
                            headers: res.headers().entries(),
                            trailers: rx,
                            stream,
                        },
                        [stream, rx]
                    );
                } else {
                    await _worker.run({
                        op: 'http-server-response',
                        serverId: this.#serverId,
                        requestId,
                        statusCode: 500,
                        headers: [],
                    });
                }
            } catch (err) {
                console.error('Serve loop failure:', err);
            }
        }
    }
}

const requestFromParts = (parts) => {
    const { headers, body, trailers, method, url } = parts;

    // Create a promise that resolves when the worker sends a message with trailers
    const promise = new Promise((resolve, reject) => {
        trailers.once('message', ({ val, err }) => {
            trailers.close();
            if (err) reject(err);
            else resolve(val);
        });
    });

    const future = new FutureReader(promise);
    const contents = new StreamReader(body);
    const fields = _fieldsFromEntriesChecked(headers);

    const { req } = Request.new(fields, contents, future, null);
    req.setMethod(method);
    req.setPathWithQuery(url);
    return req;
};
