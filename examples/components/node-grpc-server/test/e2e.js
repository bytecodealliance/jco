import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { connect } from 'node:http2';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { create, toBinary, fromBinary } from '@bufbuild/protobuf';
import { GreetRequestSchema, GreetResponseSchema } from '../src/gen/example/greeter/v1/greeter_pb.js';

const require = createRequire(import.meta.url);

const buf = require.resolve('@bufbuild/buf/bin/buf');

const run = promisify(execFile);

const cwd = fileURLToPath(new URL('..', import.meta.url));

const rpcPath = '/example.greeter.v1.GreeterService/Greet';

async function bufCall(url, name) {
    return await run(
        process.execPath,
        [
            buf,
            'curl',
            '--schema',
            'proto',
            '--protocol',
            'grpc',
            '--http2-prior-knowledge',
            '--data',
            JSON.stringify({ name }),
            new URL(rpcPath, url).href,
        ],
        { cwd, timeout: 10_000 },
    );
}

// Inspect the actual gRPC response frames as well as exercising Buf's client.
async function wireCall(session, name, path = rpcPath) {
    const message = toBinary(GreetRequestSchema, create(GreetRequestSchema, { name }));

    const prefix = Buffer.alloc(5);

    prefix.writeUInt32BE(message.length, 1);

    return await new Promise((resolve, reject) => {
        const stream = session.request({
            ':method': 'POST',
            ':path': path,
            'content-type': 'application/grpc+proto',
            te: 'trailers',
        });

        const chunks = [];

        let headers;

        let trailers;

        stream.once('response', (value) => {
            headers = value;
        });
        stream.once('trailers', (value) => {
            trailers = value;
        });
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.once('error', reject);
        stream.once('end', () => resolve({ headers, trailers, body: Buffer.concat(chunks) }));
        stream.end(Buffer.concat([prefix, message]));
    });
}

async function startServer(t, script) {
    const child = spawn(
        process.execPath,
        ['--experimental-wasm-jspi', fileURLToPath(new URL(script, import.meta.url))],
        {
            env: { ...process.env, PORT: '0' },
            stdio: ['ignore', 'pipe', 'pipe'],
        },
    );

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

            const match = output.match(/gRPC server listening at (http:\/\/127\.0\.0\.1:\d+)\n/);

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
    test(`Buf gRPC round trip on ${runtime}`, { timeout: 60_000 }, async (t) => {
        const url = await startServer(t, script);

        for (const name of ['World', '世界 🌍']) {
            const { stdout } = await bufCall(url, name);

            assert.deepEqual(JSON.parse(stdout), { message: `Hello, ${name}!` });
        }

        await assert.rejects(bufCall(url, ''), (error) => {
            assert.match(error.stderr, /invalid_argument|InvalidArgument/i);
            assert.match(error.stderr, /name must not be empty/);
            return true;
        });

        const session = connect(url);

        t.after(() => session.destroy());

        for (const name of ['metadata', '世界 🌍', 'x'.repeat(32_768)]) {
            const { headers, trailers, body } = await wireCall(session, name);

            assert.equal(headers[':status'], 200);
            assert.match(headers['content-type'], /^application\/grpc/);
            assert.equal(headers['x-greeter'], 'jco');
            assert.equal(headers['grpc-status'], undefined);
            assert.equal(trailers['grpc-status'], '0');
            assert.equal(trailers['x-name-bytes'], String(Buffer.byteLength(name)));
            assert.equal(body[0], 0);
            assert.equal(body.readUInt32BE(1), body.length - 5);
            assert.equal(fromBinary(GreetResponseSchema, body.subarray(5)).message, `Hello, ${name}!`);
        }

        const invalid = await wireCall(session, '');

        assert.equal(invalid.body.length, 0);
        assert.equal((invalid.trailers ?? invalid.headers)['grpc-status'], '3');

        const missing = await wireCall(session, 'World', '/missing');

        assert.equal(missing.headers[':status'], 404);
        session.close();
    });
}
