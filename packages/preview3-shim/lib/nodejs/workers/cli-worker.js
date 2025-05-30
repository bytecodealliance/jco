import process from 'node:process';
import { Readable } from 'node:stream';
import { pipeline } from 'stream/promises';

import { Router } from '../workers/resource-worker.js';

Router().op('stdout', handleOp).op('stderr', handleOp);

async function handleOp(msg) {
    const { op, stream } = msg;

    const readable = Readable.fromWeb(stream);
    const writable = op === 'stdout' ? process.stdout : process.stderr;

    await pipeline(readable, writable, { end: false });
    return { ok: true };
}
