import { assert } from 'vitest';

export const config = {
    wit: {
        world: 'hono-fetch-event',
    },
};

export async function test({ server }) {
    const req = await fetch(server.url, { method: 'POST', body: 'echo'});
    assert.strictEqual('echo', await req.text());
}
