import assert from 'node:assert/strict';

import { echo } from './dist/p3-stream-echo-qjs.js';

async function* emptyInput() {}

const { messages, completion } = await echo.echo(emptyInput());
const echoed = [];
for await (const message of messages) {
    echoed.push(message);
}

assert.deepEqual(echoed, []);
assert.deepEqual(await completion, { tag: 'ok', val: 0 });

for (const readCount of [0, 1, 3]) {
    let inputClosed = false;

    async function* input() {
        try {
            let index = 0;
            while (true) {
                yield `message ${index++}`;
            }
        } finally {
            inputClosed = true;
        }
    }

    const { messages, completion } = await echo.echo(input());
    if (readCount === 0) {
        await messages[Symbol.asyncIterator]().return();
    } else {
        let index = 0;
        for await (const message of messages) {
            assert.equal(message, `message ${index++}`);
            if (index === readCount) {
                break;
            }
        }
        assert.equal(index, readCount);
    }

    assert.deepEqual(await completion, { tag: 'err', val: 'cancelled' });
    assert.equal(inputClosed, true);
}
