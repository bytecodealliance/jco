import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { handleRequest } from './src/server.js';

const server = createServer(async (request, response) => {
    try {
        const url = new URL(request.url, 'http://localhost');

        const init = {
            method: request.method,
            headers: request.headers,
        };

        if (request.method !== 'GET' && request.method !== 'HEAD') {
            init.body = Readable.toWeb(request);
            init.duplex = 'half';
        }

        const result = await handleRequest(new Request(url, init));
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(Buffer.from(await result.arrayBuffer()));
    } catch (error) {
        console.error(error);
        response.writeHead(500);
        response.end('Internal server error');
    }
});

server.listen(Number(process.env.PORT ?? 3000), '127.0.0.1', () => {
    console.log(`MCP server listening at http://127.0.0.1:${server.address().port}/mcp`);
});
