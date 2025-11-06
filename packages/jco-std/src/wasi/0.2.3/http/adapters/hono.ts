import type { Hono, Schema as HonoSchema, Env as HonoEnv } from "hono";
import { createMiddleware } from "hono/factory";

import * as wasiEnv from "wasi:cli/environment@0.2.3";
import * as wasiConfig from "wasi:config/store@0.2.0-rc.1";

import { buildFireFn, type FireOpts } from '../../../0.2.x/hono.js';
import { buildConfigHelperFromWASI, type WasiConfigHelper } from '../../../0.2.x/config.js';
import { buildEnvHelperFromWASI, type WasiEnvironmentHelper } from '../../../0.2.x/cli/environment.js';

import { readWASIRequest } from '../types/request.js';
import { writeWebResponse } from '../types/response.js';


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

type WASIEnvMiddleware = {
    Variables: {
        env: WasiEnvironmentHelper,
    },
};
export const wasiEnvMiddleware = () => {
    return createMiddleware<WASIEnvMiddleware>(async (c, next) => {
        c.set('env', buildEnvHelperFromWASI(wasiEnv))
        await next();
    });
};

type WASIConfigMiddleware = {
    Variables: {
        config: WasiConfigHelper,
    },
};
export const wasiConfigMiddleware = () => {
    return createMiddleware<WASIConfigMiddleware>(async (c, next) => {
        c.set('config', buildConfigHelperFromWASI(wasiConfig))
        await next();
    });
};

export { incomingHandler } from '../../../0.2.x/hono.js';
export { buildLogger } from '../../../0.2.x/logging.js';
