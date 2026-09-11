import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

async function startServer(t, script) {
    const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
        env: { ...process.env, PORT: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    const exited = new Promise((resolve) => child.once('close', resolve));

    t.after(async () => {
        const forceKill = setTimeout(() => child.kill('SIGKILL'), 1_000);

        child.kill();
        await exited;
        clearTimeout(forceKill);
    });

    let output = '';

    let errors = '';

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
        errors += chunk;
    });

    return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Server did not start.\n${output}\n${errors}`));
        }, 30_000);

        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk) => {
            output += chunk;

            const match = output.match(/MCP server listening at (http:\/\/127\.0\.0\.1:\d+\/mcp)\n/);

            if (match) {
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

for (const [runtime, script] of [
    ['Node.js', '../serve-node.js'],
    ['WebAssembly component', '../run-transpiled.js'],
]) {
    test(`MCP SDK round trip on ${runtime}`, { timeout: 60_000 }, async (t) => {
        const url = await startServer(t, script);

        // A tool call is valid as the very first request: no initialize,
        // discovery, or session cookie is needed by the stateless protocol.
        const direct = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
                'MCP-Protocol-Version': '2026-07-28',
                'Mcp-Method': 'tools/call',
                'Mcp-Name': 'inspect-text',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: 'inspect-text',
                    arguments: { filename: 'first.txt', chunks: ['first'] },
                    _meta: {
                        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                        'io.modelcontextprotocol/clientInfo': { name: 'direct', version: '1.0.0' },
                        'io.modelcontextprotocol/clientCapabilities': {},
                    },
                },
            }),
        });

        assert.equal(direct.status, 200);
        assert.equal(direct.headers.get('mcp-session-id'), null);
        assert.deepEqual((await direct.json()).result.structuredContent, {
            filename: 'first.txt',
            bytes: 5,
            base64: 'Zmlyc3Q=',
        });

        const client = new Client(
            { name: 'jco-example-client', version: '1.0.0' },
            { versionNegotiation: { mode: { pin: '2026-07-28' } } },
        );

        const exchanges = [];

        const transport = new StreamableHTTPClientTransport(url, {
            async fetch(input, init) {
                const request = new Request(input, init);

                const body = await request.clone().json();

                const response = await fetch(request);

                exchanges.push({ body, headers: request.headers });
                assert.equal(response.headers.get('mcp-session-id'), null);
                assert.match(
                    response.headers.get('content-type') ?? '',
                    /application\/json/,
                    await response.clone().text(),
                );

                return response;
            },
        });

        t.after(() => client.close());

        await client.connect(transport);
        assert.equal(client.getServerVersion().name, 'jco-text-tools');
        assert.ok(client.getServerCapabilities().tools);
        assert.equal(transport.sessionId, undefined);

        assert.ok(client.getDiscoverResult());
        assert.deepEqual(client.getDiscoverResult().supportedVersions, ['2026-07-28']);

        const { tools } = await client.listTools();
        assert.deepEqual(
            tools.map((tool) => tool.name),
            ['inspect-text'],
        );
        assert.equal(tools[0].inputSchema.properties.filename.type, 'string');

        for (const chunks of [['Hello, ', '🌍!'], [], ['another request']]) {
            const result = await client.callTool({
                name: 'inspect-text',
                arguments: { filename: 'notes/../greeting.txt', chunks },
            });

            const bytes = Buffer.from(chunks.join(''));

            const expected = {
                filename: 'greeting.txt',
                bytes: bytes.length,
                base64: bytes.toString('base64'),
            };

            assert.notEqual(result.isError, true);
            assert.deepEqual(result.structuredContent, expected);
            assert.deepEqual(JSON.parse(result.content[0].text), expected);
        }

        const invalid = await client.callTool({
            name: 'inspect-text',
            arguments: { filename: 42, chunks: [] },
        });
        assert.equal(invalid.isError, true);

        assert.equal(exchanges[0].body.method, 'server/discover');
        for (const { body, headers } of exchanges) {
            assert.notEqual(body.method, 'initialize');
            assert.equal(body.params._meta['io.modelcontextprotocol/protocolVersion'], '2026-07-28');
            assert.equal(headers.get('mcp-protocol-version'), '2026-07-28');
            assert.equal(headers.get('mcp-method'), body.method);
            assert.equal(headers.get('mcp-session-id'), null);
        }

        const missing = await fetch(new URL('/missing', url));
        assert.equal(missing.status, 404);
        await missing.text();

        const malformed = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
            },
            body: '{',
        });
        assert.equal(malformed.status, 400);
        assert.equal((await malformed.json()).error.code, -32700);

        const forbidden = await fetch(url, { headers: { Origin: 'https://untrusted.example' } });
        assert.equal(forbidden.status, 403);
        await forbidden.text();
    });
}
