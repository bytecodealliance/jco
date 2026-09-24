/**
 * This is the WebAssembly component entrypoint.
 *
 * Execution flow:
 * 1. Jco componentizes this module and exports `start` and `stop` through WIT.
 * 2. The runtime embedder instantiates the component and connects its host capabilities.
 * 3. The host calls `start(port)`, which loads the Node and SvelteKit runtime lazily.
 * 4. The runtime creates an HTTP server, begins listening, and returns the bound port.
 * 5. The host calls `stop()` to close active connections and shut down the server.
 */
import type { Server } from 'node:http';

let server: Server | undefined;

export async function start(port: number): Promise<number> {
    // During Jco componentization, Wizer runs this JavaScript module once and
    // snapshots its initialized StarlingMonkey state into Wasm. The future
    // runtime embedder's host capabilities are not connected during that
    // build-time execution.
    //
    // Loading `node:http` initializes host-backed Node state, while SvelteKit's
    // adapter entry point reads the host environment and indexes its built
    // client assets. Dynamically importing the runtime (which imports
    // `node:http`) delays both until the embedder has supplied HTTP, process,
    // and filesystem capabilities.
    const { createSvelteKitServer } = await import('./runtime.ts');

    server ??= await createSvelteKitServer();

    await new Promise<void>((resolve, reject) => {
        server!.once('error', reject);
        server!.listen(port, '127.0.0.1', () => {
            server!.off('error', reject);
            resolve();
        });
    });

    const address = server.address();

    if (!address || typeof address === 'string') {
        throw new Error('SvelteKit server did not bind to a TCP port');
    }

    return address.port;
}

export async function stop(): Promise<void> {
    if (!server) {
        return;
    }

    server.closeAllConnections();

    await new Promise<void>((resolve, reject) => {
        server!.close((error) => (error ? reject(error) : resolve()));
    });
}
