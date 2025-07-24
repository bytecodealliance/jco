import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

// NOTE: we must use 0.2.3 here, because StarlingMonkey determines
// the version of `wasi:http` that is used with the built in fetch-event
// integration, and as of now that is `wasi:http@0.2.3`
import { fire } from '@bytecodealliance/jco-std/wasi/0.2.3/http/adapters/hono';

const app = new Hono();

// Use logging middleware, via the custom logger
app.get('/', (c, ctx) => {
    const key = c.param('key');
    if (!ctx.config) {
        throw new HTTPException(500, {
            message: 'unexpectedly missing config helper',
        });
    }
    return c.text(ctx.config.get(key));
});

fire(app);
