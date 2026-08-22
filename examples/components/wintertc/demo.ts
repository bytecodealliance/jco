import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

type ResultsResponse = {
    results: Record<string, boolean>;
    error?: string;
};

function isResultsResponse(value: unknown): value is ResultsResponse {
    if (typeof value !== 'object' || value === null || !('results' in value)) {
        return false;
    }
    const { results } = value;
    return (
        typeof results === 'object' &&
        results !== null &&
        Object.values(results).every((passed: unknown) => typeof passed === 'boolean')
    );
}

async function getAvailablePort(): Promise<number> {
    return await new Promise<number>((resolve, reject) => {
        const server = createServer();
        server.once('error', reject);
        server.listen(0, () => {
            const { port } = server.address() as AddressInfo;
            server.close((error?: Error) => (error ? reject(error) : resolve(port)));
        });
    });
}

async function main(): Promise<void> {
    const componentPath = fileURLToPath(new URL('./component.wasm', import.meta.url));
    const port = await getAvailablePort();
    const child = spawn(process.env.JCO_PATH ?? 'jco', ['serve', '--port', String(port), componentPath], {
        stdio: 'pipe',
    });

    try {
        await new Promise<void>((resolve, reject) => {
            child.once('error', reject);
            child.once('exit', (code: number | null) => reject(new Error(`jco serve exited with code ${code}`)));
            child.stderr.on('data', (data: Buffer) => {
                if (data.includes('Server listening')) {
                    resolve();
                }
            });
        });

        const response = await fetch(`http://localhost:${port}`);
        const body: unknown = await response.json();
        assert.ok(isResultsResponse(body), 'component returned an invalid response');
        assert.equal(response.status, 200, body.error);
        assert.ok(Object.keys(body.results).length > 0);
        for (const [api, passed] of Object.entries(body.results)) {
            assert.equal(passed, true, `${api} failed`);
        }
        console.log(`WinterTC-style Web APIs passed: ${Object.keys(body.results).join(', ')}`);
    } finally {
        if (child.exitCode === null) {
            await new Promise<void>((resolve) => {
                child.once('exit', () => resolve());
                child.kill('SIGTERM');
            });
        }
    }
}

main()
    .then(() => {})
    .catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    });
