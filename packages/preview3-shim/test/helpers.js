import { createServer as createNetServer } from 'node:net';

// Utility function for getting a random port
export async function getRandomPort() {
    return await new Promise((resolve) => {
        const server = createNetServer();
        server.listen(0, function () {
            const port = this.address().port;
            server.on('close', () => resolve(port));
            server.close();
        });
    });
}
