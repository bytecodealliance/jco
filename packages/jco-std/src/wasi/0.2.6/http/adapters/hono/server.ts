import type { Hono, Schema as HonoSchema, Env as HonoEnv } from 'hono';

import { buildFireFn, type FireOpts } from '../../../../0.2.x/hono.js';

import { readWASIRequest } from '../../types/request.js';
import { writeWebResponse } from '../../types/response.js';

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

export { incomingHandler } from '../../../../0.2.x/hono.js';
export { buildLogger } from '../../../../0.2.x/logging.js';
