import assert from 'node:assert/strict';

import { echo } from './dist/p3-stream-echo-qjs.js';

const messages = ['hello', 'from', 'QuickJS'];
const firstEcho = Promise.withResolvers();

async function* input() {
    yield messages[0];
    // Waiting for the first echo proves output starts before input ends; buffering would stall here.
    await firstEcho.promise;
    yield* messages.slice(1);
}

// Awaiting the export gives us stream/future handles, without waiting for input to finish.
const { messages: echoedMessages, completion } = await echo.echo(input());
const echoed = [];

for await (const message of echoedMessages) {
    echoed.push(message);
    console.log(message);
    firstEcho.resolve();
}

assert.deepEqual(echoed, messages);
// Await the host future for its tagged WIT result; a QuickJS guest would use await readable.read().
assert.deepEqual(await completion, { tag: 'ok', val: messages.length });

let inputClosed = false;
async function* cancellableInput() {
    try {
        let index = 0;
        while (true) {
            yield `message ${index++}`;
        }
    } finally {
        inputClosed = true;
    }
}

const { messages: cancellableMessages, completion: cancelledCompletion } = await echo.echo(cancellableInput());
// `break` awaits iterator.return(), which propagates cancellation back to the input generator.
for await (const message of cancellableMessages) {
    assert.equal(message, 'message 0');
    break;
}

// Cancelling this stream resolves its completion future with an error value rather than rejecting it.
assert.deepEqual(await cancelledCompletion, { tag: 'err', val: 'cancelled' });
assert.equal(inputClosed, true);
