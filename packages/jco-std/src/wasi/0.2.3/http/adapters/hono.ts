import type { Hono, Schema as HonoSchema, Env as HonoEnv } from 'hono';

import * as wasiEnv from "wasi:cli/environment@0.2.3";
import * as wasiConfig from "wasi:config/store@0.2.0-rc.1";

import { buildFireFn, type FireOpts } from '../../../0.2.x/hono.js';

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
    const realFireFn = buildFireFn({
        wasiConfigStore: wasiConfig,
        wasiEnvironment: wasiEnv,
        readWASIRequest,
        writeWebResponse,
    })
    realFireFn(app, opts);
}

export { incomingHandler } from '../../../0.2.x/hono.js';
export { buildLogger } from '../../../0.2.x/logging.js';
