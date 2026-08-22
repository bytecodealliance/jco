import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const componentPath = fileURLToPath(new URL('./component.wasm', import.meta.url));
const jcoPath = fileURLToPath(new URL('../../../packages/jco/dist/jco.js', import.meta.url));

const listener = Deno.listen({ hostname: '127.0.0.1', port: 0 });
const { port } = listener.addr;
listener.close();

const child = new Deno.Command(Deno.execPath(), {
    args: ['run', '--no-check', '--allow-all', jcoPath, 'serve', '--port', String(port), componentPath],
    stdout: 'null',
    stderr: 'piped',
}).spawn();

try {
    const reader = child.stderr.pipeThrough(new TextDecoderStream()).getReader();
    let stderr = '';
    while (!stderr.includes('Server listening')) {
        const { value, done } = await reader.read();
        if (done) {
            throw new Error(`jco serve exited before starting:\n${stderr}`);
        }
        stderr += value;
    }
    reader.releaseLock();

    const response = await fetch(`http://localhost:${port}`);
    const body = await response.json();
    assert.equal(response.status, 200, body.error);
    assert.ok(Object.keys(body.results).length > 0);
    for (const [api, passed] of Object.entries(body.results)) {
        assert.equal(passed, true, `${api} failed`);
    }
    console.log(`Deno-hosted Web APIs passed: ${Object.keys(body.results).join(', ')}`);
} finally {
    child.kill('SIGTERM');
    await child.status;
}
