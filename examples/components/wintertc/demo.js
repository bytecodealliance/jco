import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

const componentPath = fileURLToPath(new URL('./component.wasm', import.meta.url));

const port = await new Promise((resolve) => {
    const server = createServer();
    server.listen(0, () => {
        const { port } = server.address();
        server.close(() => resolve(port));
    });
});

const child = spawn(process.env.JCO_PATH ?? 'jco', ['serve', '--port', port, componentPath], {
    stdio: 'pipe',
});

try {
    await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code) => reject(new Error(`jco serve exited with code ${code}`)));
        child.stderr.on('data', (data) => {
            if (data.includes('Server listening')) {
                resolve();
            }
        });
    });

    const response = await fetch(`http://localhost:${port}`);
    const body = await response.json();
    assert.equal(response.status, 200, body.error);
    assert.ok(Object.keys(body.results).length > 0);
    for (const [api, passed] of Object.entries(body.results)) {
        assert.equal(passed, true, `${api} failed`);
    }
    console.log(`WinterTC-style Web APIs passed: ${Object.keys(body.results).join(', ')}`);
} finally {
    await new Promise((resolve) => {
        child.once('exit', resolve);
        child.kill('SIGTERM');
    });
}
