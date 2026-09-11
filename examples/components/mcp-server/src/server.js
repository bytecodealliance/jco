import { Buffer } from 'node:buffer';
import { createServer as createHttpServer } from 'node:http';
import { posix as path } from 'node:path';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import {
    createMcpHandler,
    McpServer,
    originValidationResponse,
    localhostAllowedOrigins,
} from '@modelcontextprotocol/server';
import { z } from 'zod';

function createServer() {
    const server = new McpServer({ name: 'jco-text-tools', version: '1.0.0' });

    server.registerTool(
        'inspect-text',
        {
            description:
                'Describe and base64-encode text associated with a file name, without accessing the filesystem.',
            inputSchema: z.object({
                filename: z.string(),
                chunks: z.array(z.string()),
            }),
        },
        async ({ filename, chunks }) => {
            const contents = await text(Readable.from(chunks));

            const bytes = Buffer.from(contents, 'utf8');

            const result = {
                filename: path.basename(path.normalize(filename)),
                bytes: bytes.length,
                base64: bytes.toString('base64'),
            };

            return {
                content: [{ type: 'text', text: JSON.stringify(result) }],
                structuredContent: result,
            };
        },
    );

    return server;
}

// The SDK creates a server per request and handles the 2026-07-28 protocol.
// No initialization handshake or protocol-level session is needed.
const handler = createMcpHandler(createServer, { legacy: 'reject' });

async function handleRequest(request) {
    if (new URL(request.url).pathname !== '/mcp') {
        return new Response('Not found', { status: 404 });
    }

    return originValidationResponse(request, localhostAllowedOrigins()) ?? handler.fetch(request);
}

// The MCP SDK accepts Web Requests. Keep the Node HTTP bridge here so the
// exact same request handling runs natively and inside the component.
async function handleNodeRequest(request, response) {
    try {
        const url = new URL(request.url, 'http://localhost');

        const init = {
            method: request.method,
            headers: request.headers,
        };

        if (request.method !== 'GET' && request.method !== 'HEAD') {
            init.body = await text(request);
        }

        const result = await handleRequest(new Request(url, init));

        const body = Buffer.from(await result.arrayBuffer());

        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(body);
    } catch (error) {
        console.error(error);
        response.writeHead(500);
        response.end('Internal server error');
    }
}

let server;

export async function start(port) {
    server ??= createHttpServer(handleNodeRequest);

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
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
    });
}
