import { createMiddleware } from "hono/factory";

// NOTE: this import is somewhat "magical", it is filled in by componentize-js when
// building a component.
//
// Transpilers & bundlers must essentially ignore this component when building.
import * as wasiConfig from "wasi:config/store@0.2.0-rc.1";

import { buildConfigHelperFromWASI, type WasiConfigHelper } from "../../../../../0.2.x/config.js";

export type { WasiConfigHelper } from "../../../../../0.2.x/config.js";

export type WASIConfigMiddleware = {
  Variables: {
    config: WasiConfigHelper;
  };
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
    c.set("config", buildConfigHelperFromWASI(wasiConfig));
    await next();
  });
};
