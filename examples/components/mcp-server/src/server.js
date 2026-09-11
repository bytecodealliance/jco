import { Buffer } from 'node:buffer';
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

export async function handleRequest(request) {
    if (new URL(request.url).pathname !== '/mcp') {
        return new Response('Not found', { status: 404 });
    }

    return originValidationResponse(request, localhostAllowedOrigins()) ?? handler.fetch(request);
}
