import { Hono } from "hono";
import { logger } from 'hono/logger';

/**
 * jco-std contains an optional adapter that makes it easy to use Hono with your
 * project. The import below enables us to use the builtin `wasi:http@0.2.6`
 * WIT interface supported by jco-std.
 *
 * @see https://github.com/WebAssembly/wasi-http
 */
import { fire, buildLogger } from '@bytecodealliance/jco-std/wasi/0.2.6/http/adapters/hono';

const app = new Hono();

// Build a logger that
const log = buildLogger();

app.use(logger(log));

app.get("/", (c) => {
    log.debug('entered handler');
    return c.text("Hello World!!!!");
});

fire(app);

// Although we've called `fire()` with wasi HTTP configured for use above,
// we still need to actually export the `wasi:http/incoming-handler` interface object,
// as jco will be looking for the ES module export.
export { incomingHandler } from '@bytecodealliance/jco-std/wasi/0.2.6/http/adapters/hono';
