import { ResourceWorker } from '../workers/resource-worker.js';
import { StreamReader } from '../stream.js';
import { FutureReader } from '../future.js';
import { _fieldsFromEntriesChecked } from './fields.js';
import { HttpError } from './error.js';
import { Response } from './response.js';

let WORKER = null;
function worker() {
    return (WORKER ??= new ResourceWorker(
        new URL('../workers/http-worker.js', import.meta.url)
    ));
}

export class HttpClient {
    /**
     * Send a Request, return a fully-formed Response object
     *
     * @param {Request} req
     * @returns {Promise<Response>}
     * @throws {HttpError}
     */
    static async request(req) {
        const scheme = req.scheme() ?? 'http';
        const authority = req.authority();

        if (!authority) {
            throw new HttpError(
                'internal-error',
                'Request.authority must be set for client.request'
            );
        }

        const path = req.pathWithQuery() ?? '/';
        const url = `${scheme}://${authority}${path}`;

        const opts = req.options();
        const connectTimeoutNs = opts?.connectTimeout() ?? null;
        const firstByteTimeoutNs = opts?.firstByteTimeout() ?? null;
        const betweenBytesTimeoutNs = opts?.betweenBytesTimeout() ?? null;

        const { body, trailers } = req.body();
        const { port1: tx, port2: rx } = new MessageChannel();

        const transfer = [rx];
        const stream = body?.intoReadableStream();
        if (stream) {
            transfer.unshift(stream);
        }

        trailers
            .read()
            .then((val) => tx.postMessage({ val }))
            .catch((err) => tx.postMessage({ err }))
            .finally(() => tx.close());

        try {
            const parts = await worker().run(
                {
                    op: 'client-request',
                    url,
                    method: req.method().tag,
                    headers: req.headers().entries(),
                    timeouts: {
                        connectTimeoutNs,
                        firstByteTimeoutNs,
                        betweenBytesTimeoutNs,
                    },
                    trailers: rx,
                    body: stream,
                },
                transfer
            );

            return responseFromParts(parts);
        } catch (err) {
            throw HttpError.from(err);
        }
    }
}

const responseFromParts = (parts) => {
    const { headers, body, trailers, statusCode } = parts;

    // Create a promise that resolves when the worker sends a message with trailers
    const promise = new Promise((resolve, reject) => {
        trailers.once('message', ({ val, err }) => {
            trailers.close();
            if (err) {
                reject(err);
            } else {
                resolve(val);
            }
        });
    });

    const future = new FutureReader(promise);
    const contents = new StreamReader(body);
    const fields = _fieldsFromEntriesChecked(headers);

    const { res } = Response.new(fields, contents, future);
    res.setStatusCode(statusCode);
    return res;
};
