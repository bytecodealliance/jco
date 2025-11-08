import { Hono } from "hono";
import { logger } from 'hono/logger';

/**
 * jco-std contains an optional adapter that makes it easy to use Hono with your
 * project. The import below enables us to use the builtin `wasi:http@0.2.6`
 * WIT interface supported by jco-std.
 *
 * @see https://github.com/WebAssembly/wasi-http
 */
import { fire, buildLogger } from '@bytecodealliance/jco-std/wasi/0.2.x/http/adapters/hono/server';

import { wasiEnvMiddleware, type WasiEnvHelper } from '@bytecodealliance/jco-std/wasi/0.2.x/http/adapters/hono/middleware/env';
import { wasiConfigMiddleware, type WasiConfigHelper } from '@bytecodealliance/jco-std/wasi/0.2.x/http/adapters/hono/middleware/config';

const app = new Hono();

// Build a logger that
const log = buildLogger();

app.use(logger(log));

// Enable the wasi env middleware which will populate c.get('env')
// with environment variables provided by the platform underneath
app.use(wasiEnvMiddleware());

// Enable the wasi config middleware which will populate c.get('config')
// with config variables provided by the platform underneath
app.use(wasiConfigMiddleware());

app.get("/", (c) => {
    const env: WasiEnvHelper = c.get('env');
    if (!env) { return c.json({ status: 'error', msg: 'missing env helper'}); }
    const config: WasiConfigHelper = c.get('config');
    if (!config) { return c.json({ status: 'error', msg: 'missing config helper'}); }

    // NOTE: To control what is available via these interfaces
    //
    // see:
    //  - scripts/demo.mjs (host/platform setup, 'wasi:cli/environment' configuration via `jco serve`)
    //  - src/host/bindings/config/env.ts (config builtin)

    // Retrieve values from ENV/config
    const username = env.getAllObject()['USER'] ?? 'unknown';
    // see: host/bindings/config.js
    const testKeyValue = config.get("test-key");

    log.debug('entered handler');
    return c.json({ status: 'success', data: { username, testKeyValue }});
});

fire(app);

// Although we've called `fire()` with wasi HTTP configured for use above,
// we still need to actually export the `wasi:http/incoming-handler` interface object,
// as jco will be looking for the ES module export.
export { incomingHandler } from '@bytecodealliance/jco-std/wasi/0.2.x/http/adapters/hono/server';
