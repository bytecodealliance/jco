import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { fire, buildLogger } from '@bytecodealliance/jco-std/wasi/0.2.3/http/adapters/hono';

const app = new Hono();
// Use logging middleware, via the custom logger
app.use(logger(buildLogger({ context: 'test-app' })));
app.get('/', (c) => {
    logger.debug('entered handler');
    c.text('Hello World!');
});

fire(app, { useFetchEvent: true });
