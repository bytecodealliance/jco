import { createMiddleware } from "hono/factory";

// NOTE: this import is somewhat "magical", it is filled in by componentize-js when
// building a component.
//
// Transpilers & bundlers must essentially ignore this component when building.
import * as wasiEnv from "wasi:cli/environment@0.2.6";

import {
  buildEnvHelperFromWASI,
  type WasiEnvironmentHelper,
} from "../../../../../0.2.x/cli/environment.js";

export { type WasiEnvironmentHelper } from "../../../../../0.2.x/cli/environment.js";

export type WASIEnvMiddleware = {
  Variables: {
    env: WasiEnvironmentHelper;
  };
};

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
    c.set("env", buildEnvHelperFromWASI(wasiEnv));
    await next();
  });
};
