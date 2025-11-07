import type { Hono, Schema as HonoSchema, Env as HonoEnv } from 'hono';
import { createMiddleware } from 'hono/factory';

import * as wasiEnv from "wasi:cli/environment@0.2.6";
import * as wasiConfig from "wasi:config/store@0.2.0-rc.1";

import { buildFireFn, type FireOpts } from '../../../0.2.x/hono.js';
import { buildConfigHelperFromWASI, type WasiConfigHelper } from '../../../0.2.x/config.js';
import { buildEnvHelperFromWASI, type WasiEnvironmentHelper } from '../../../0.2.x/cli/environment.js';

import { readWASIRequest } from '../types/request.js';
import { writeWebResponse } from '../types/response.js';

type WASIEnvMiddleware = {
    Variables: {
        env: WasiEnvironmentHelper,
    },
};

type WASIConfigMiddleware = {
    Variables: {
        config: WasiConfigHelper,
    },
};

/** Analog to Hono's fire function, which sets up your Hono application to be served */
export function fire<
    Env extends HonoEnv = HonoEnv,
    Schema extends HonoSchema = {}, // eslint-disable-line @typescript-eslint/no-empty-object-type
    BasePath extends string = '/',
>(
    app: Hono<Env, Schema, BasePath>,
    opts?: FireOpts,
) {
    const realFireFn = buildFireFn({ readWASIRequest, writeWebResponse });
    realFireFn(app, opts);
}

/**
 * A Hono middleware that injects a helper that can retrieve
 * environment variables from the platform on which the WebAssembly
 * component is running.
 *
 * For example:
 *
 * ```
 * import {
 *     wasiEnvMiddleware
 * } from '@bytecodealliance/jco-std/wasi/0.2.3/http/adapters/hono';
 *
 * const app = new Hono();
 *
 * app.use(wasiEnvMiddleware());
 *
 * app.post('/', async (c) => {
 *     const env = c.get('env');
 *     if (!env) { return c.json({ status: 'error', msg: 'missing env helper'}); }
 *
 *     const envValue = env.getAllObject()['SOME_KEY'];
 *
 *     return c.json({ status: 'success', data: envValue });
 * });
 * ```
 *
 * @see https://github.com/WebAssembly/wasi-cli
 * @see https://github.com/WebAssembly/wasi-cli/blob/main/wit/environment.wit
 */
export const wasiEnvMiddleware = () => {
    return createMiddleware<WASIEnvMiddleware>(async (c, next) => {
        c.set('env', buildEnvHelperFromWASI(wasiEnv))
        await next();
    });
};

/**
 * A Hono middleware that injects a helper that can retrieve
 * config variables from the platform on which the WebAssembly
 * component is running.
 *
 * For example:
 *
 * ```
 * import {
 *     wasiConfigMiddleware
 * } from '@bytecodealliance/jco-std/wasi/0.2.3/http/adapters/hono';
 *
 * const app = new Hono();
 *
 * app.use(wasiEnvMiddleware());
 *
 * app.post('/', async (c) => {
 *     const config = c.get('config');
 *     if (!config) { return c.json({ status: 'error', msg: 'missing env helper'}); }

 *     const configValue = config.get('some-config-key');
 *
 *     return c.json({ status: 'success', data: configValue });
 * });
 * ```
 *
 * @see https://github.com/WebAssembly/wasi-config
 * @see https://github.com/WebAssembly/wasi-config/blob/main/wit/store.wit
 */
export const wasiConfigMiddleware = () => {
    return createMiddleware<WASIConfigMiddleware>(async (c, next) => {
        c.set('config', buildConfigHelperFromWASI(wasiConfig))
        await next();
    });
};

export { incomingHandler } from '../../../0.2.x/hono.js';
export { buildLogger } from '../../../0.2.x/logging.js';
