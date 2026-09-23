import { readFileSync } from 'node:fs';
import { createServer, type RequestListener, type Server } from 'node:http';
import { extname, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import 'node:url';

const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
} as const;

export async function createSvelteKitServer(): Promise<Server> {
    // The adapter otherwise assumes HTTPS when no proxy protocol header is
    // configured. This server binds plain HTTP directly, so make that fact
    // explicit for SvelteKit's origin and CSRF checks.
    process.env.PROTOCOL_HEADER = 'x-forwarded-proto';

    const handlerModule = '../build/handler.js';
    const { handler } = (await import(handlerModule)) as { handler: RequestListener };
    const clientDirectory = resolve(process.cwd(), 'build/client');

    const requestListener: RequestListener = (request, response) => {
        request.headers['x-forwarded-proto'] = 'http';
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;

        if ((request.method === 'GET' || request.method === 'HEAD') && pathname.startsWith('/_app/')) {
            const filePath = resolve(clientDirectory, `.${decodeURIComponent(pathname)}`);
            const relativePath = relative(clientDirectory, filePath);

            if (relativePath && relativePath !== '..' && !relativePath.startsWith(`..${sep}`)) {
                try {
                    const body = readFileSync(filePath);
                    const contentType = contentTypes[extname(filePath) as keyof typeof contentTypes];

                    if (contentType) {
                        response.setHeader('Content-Type', contentType);
                    }
                    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                    response.setHeader('Content-Length', body.byteLength);
                    response.end(request.method === 'HEAD' ? undefined : body);
                    return;
                } catch (error: unknown) {
                    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                        throw error;
                    }
                }
            }
        }

        handler(request, response);
    };

    return createServer(requestListener);
}
