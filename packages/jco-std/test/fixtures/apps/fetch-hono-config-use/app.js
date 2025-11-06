import { Hono } from 'hono';

// NOTE: we must use 0.2.3 here, because StarlingMonkey determines
// the version of `wasi:http` that is used with the built in fetch-event
// integration, and as of now that is `wasi:http@0.2.3`
import {
    fire,
    wasiEnvMiddleware,
    wasiConfigMiddleware
} from '@bytecodealliance/jco-std/wasi/0.2.3/http/adapters/hono';

const app = new Hono();

// Enable the wasi env middleware which will populate c.get('env')
// with environment variables provided by the platform underneath
app.use(wasiEnvMiddleware());

// Enable the wasi config middleware which will populate c.get('config')
// with config variables provided by the platform underneath
app.use(wasiConfigMiddleware());

// Use logging middleware, via the custom logger
app.post('/', async (c) => {
    const env = c.get('env');
    const config = c.get('config');

    // Ensure the middlewares worked
    if (!env) { return c.json({ status: 'error', msg: 'missing env helper'}); }
    if (!config) { return c.json({ status: 'error', msg: 'missing config helper'}); }

    // Extract keys from JSON post body
    const reqBody = await c.req.json();
    const envKey = reqBody?.env?.key;
    const configKey = reqBody?.config?.key;

    // Retrieve values
    const envValue = env.getAllObject()[envKey];
    const configValue = config.get(configKey);

    return c.json({
        status: 'success',
        data: {
            env: { key: envKey, value: envValue },
            config: { key: configKey, value: configValue },
        },
    });
});

fire(app, { useFetchEvent: true });
