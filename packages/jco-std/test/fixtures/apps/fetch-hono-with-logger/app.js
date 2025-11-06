import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { fire, buildLogger } from '@bytecodealliance/jco-std/wasi/0.2.3/http/adapters/hono';

const app = new Hono();

const log = buildLogger({ context: 'test-app' });

// Use logging middleware, via the custom logger
app.use(logger(log));

app.get('/', (c) => {
    log.debug('entered handler');
    return c.text('Hello World!');
});

fire(app, { useFetchEvent: true });
