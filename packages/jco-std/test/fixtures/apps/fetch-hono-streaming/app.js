import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { fire } from '@bytecodealliance/jco-std/wasi/0.2.3/http/adapters/hono/server';

const app = new Hono();
app.post('/', (c) => {
    return stream(c, async (stream) => {
        stream.onAbort(() => {
            console.error('ABORTED STREAM');
        });
        await stream.write(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]));
        await stream.sleep(100);
        await stream.write(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]));
        await stream.close();
    });
});

fire(app, { useFetchEvent: true });
