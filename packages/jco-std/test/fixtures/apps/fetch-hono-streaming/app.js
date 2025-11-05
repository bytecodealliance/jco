import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { fire } from '@bytecodealliance/jco-std/wasi/0.2.3/http/adapters/hono';

const app = new Hono();
app.get('/', (c) => {
    return stream(c, async (stream) => {
        stream.onAbort(() => {
            console.error('ABORTED STREAM');
        });
        await stream.pipe(c.body);
    });
});

fire(app, { useFetchEvent: true });
