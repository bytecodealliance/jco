import { createServer } from 'node:http2';
import { Buffer } from 'node:buffer';
import { buffer } from 'node:stream/consumers';
import { Code, ConnectError, createConnectRouter } from '@connectrpc/connect';
import { GreeterService } from './gen/example/greeter/v1/greeter_pb.js';

const router = createConnectRouter({
    grpc: true,
    grpcWeb: false,
    connect: false,
    acceptCompression: [],
    readMaxBytes: 1024 * 1024,
    writeMaxBytes: 1024 * 1024,
});

router.service(GreeterService, {
    greet(request, context) {
        if (!request.name.trim()) {
            throw new ConnectError('name must not be empty', Code.InvalidArgument);
        }

        context.responseHeader.set('x-greeter', 'jco');
        context.responseTrailer.set('x-name-bytes', String(Buffer.byteLength(request.name)));

        return { message: `Hello, ${request.name}!` };
    },
});

const handlers = new Map(router.handlers.map((handler) => [handler.requestPath, handler]));

// Connect handles protobuf, gRPC envelopes, status codes, and trailers. This
// bridge supplies its request/response interface using ordinary Node HTTP/2.
async function handleRequest(request, response) {
    const handler = handlers.get(request.url);

    if (!handler) {
        response.writeHead(404);
        response.end();
        return;
    }

    const controller = new AbortController();

    request.once('aborted', () => controller.abort());

    try {
        const header = new Headers();

        for (const [name, value] of Object.entries(request.headers)) {
            if (name.startsWith(':') || value === undefined) {
                continue;
            }

            for (const item of Array.isArray(value) ? value : [value]) {
                header.append(name, String(item));
            }
        }

        const result = await handler({
            httpVersion: request.httpVersion,
            method: request.method,
            url: new URL(request.url, 'http://localhost').href,
            header,
            body: request,
            signal: controller.signal,
        });

        // The component's HTTP/2 boundary buffers bodies. Collecting here also
        // lets the service finish setting metadata before sending the headers.
        const body = result.body ? await buffer(result.body) : Buffer.alloc(0);

        response.writeHead(result.status, Object.fromEntries(result.header ?? []));
        response.addTrailers(Object.fromEntries(result.trailer ?? []));
        response.end(body);
    } catch (error) {
        console.error(error);
        response.writeHead(500);
        response.end();
    }
}

let server;

export async function start(port) {
    server ??= createServer(handleRequest);

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
            server.off('error', reject);
            resolve();
        });
    });

    return server.address().port;
}

export async function stop() {
    await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
    });
}
