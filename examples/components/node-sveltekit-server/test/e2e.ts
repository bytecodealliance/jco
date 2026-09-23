import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test, type TestContext } from 'node:test';

interface ServerTarget {
    runtime: string;
    script: string;
    arguments?: readonly string[];
}

async function startServer(t: TestContext, target: ServerTarget): Promise<URL> {
    const port = 0;
    const child = spawn(
        process.execPath,
        [
            '--experimental-wasm-jspi',
            fileURLToPath(new URL(target.script, import.meta.url)),
            ...(target.arguments ?? []),
        ],
        {
            env: { ...process.env, PORT: String(port) },
            stdio: ['ignore', 'pipe', 'pipe'],
        },
    );

    const exited = new Promise<number | null>((resolve) => child.once('close', resolve));

    t.after(async () => {
        const forceKill = setTimeout(() => child.kill('SIGKILL'), 1_000);

        child.kill();
        await exited;
        clearTimeout(forceKill);
    });

    let output = '';
    let errors = '';

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
        errors += chunk;
    });

    return await new Promise<URL>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Server did not start.\n${output}\n${errors}`));
        }, 60_000);

        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
            output += chunk;

            const match = output.match(
                /SvelteKit TODO server(?: \([^)]+\))? listening at (http:\/\/127\.0\.0\.1:\d+)\n/,
            );

            if (match?.[1]) {
                clearTimeout(timer);
                resolve(new URL(match[1]));
            }
        });

        child.once('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });

        child.once('exit', (code, signal) => {
            clearTimeout(timer);
            reject(new Error(`Server exited (${code ?? signal}).\n${output}\n${errors}`));
        });
    });
}

async function submit(url: URL, action: string, fields: Record<string, string>): Promise<Response> {
    return await fetch(new URL(`/?/${action}`, url), {
        method: 'POST',
        headers: {
            Accept: 'text/html',
            'Content-Type': 'application/x-www-form-urlencoded',
            Origin: url.origin,
        },
        body: new URLSearchParams(fields),
    });
}

async function fetchWhenReady(url: URL): Promise<Response> {
    const deadline = Date.now() + 10_000;

    while (true) {
        try {
            return await fetch(url);
        } catch (error) {
            if (Date.now() >= deadline) {
                throw error;
            }

            await new Promise<void>((resolve) => setTimeout(resolve, 25));
        }
    }
}

const targets: readonly ServerTarget[] = [
    { runtime: 'Node.js', script: '../src/serve-node.ts' },
    {
        runtime: 'StarlingMonkey WebAssembly component',
        script: '../src/run-transpiled.ts',
    },
];

for (const target of targets) {
    test(`SvelteKit TODO round trip on ${target.runtime}`, { timeout: 90_000 }, async (t) => {
        const url = await startServer(t, target);
        const initial = await fetchWhenReady(url);
        const initialHtml = await initial.text();

        assert.equal(initial.status, 200);
        assert.match(initial.headers.get('content-type') ?? '', /^text\/html/);

        assert.match(initialHtml, /Make space for what matters\./);
        assert.match(initialHtml, /Read the component model notes/);
        assert.match(initialHtml, /aria-label="2 open tasks"/);

        const cssPath = initialHtml.match(/href="([^"]+\.css)"/)?.[1];

        assert.ok(cssPath, 'SSR HTML references the generated stylesheet');
        const stylesheet = await fetch(new URL(cssPath, url));

        assert.equal(stylesheet.status, 200);
        assert.match(stylesheet.headers.get('content-type') ?? '', /^text\/css/);
        assert.ok((await stylesheet.text()).length > 1_000);

        const added = await submit(url, 'add', { title: 'Test both runtimes' });

        assert.equal(added.status, 200);

        const addedHtml = await added.text();

        assert.match(addedHtml, /Test both runtimes/);
        assert.match(addedHtml, /aria-label="3 open tasks"/);

        const toggled = await submit(url, 'toggle', { id: '4' });

        assert.equal(toggled.status, 200);

        const toggledHtml = await toggled.text();

        assert.match(toggledHtml, /aria-label="2 open tasks"/);
        assert.match(toggledHtml, /Mark Test both runtimes as open/);

        const removed = await submit(url, 'remove', { id: '4' });

        assert.equal(removed.status, 200);
        assert.doesNotMatch(await removed.text(), /Test both runtimes/);

        const invalid = await submit(url, 'add', { title: '   ' });

        assert.equal(invalid.status, 400);
        assert.match(await invalid.text(), /Give this task a short, useful name\./);

        const missing = await fetch(new URL('/missing', url));

        assert.equal(missing.status, 404);
        await missing.text();
    });
}
