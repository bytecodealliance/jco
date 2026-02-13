/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */

import type { Hono, Schema as HonoSchema, Env as HonoEnv } from "hono";
import { FetchEventLike } from "hono/types";

import { ensureGlobalAddEventListener } from "../globals.js";

/** Strategy for interfacing with WASI environment */
enum AppAdapterType {
  WasiHTTP = "wasi-http",
  FetchEvent = "fetch-event",
}

/** Options for building a `AppAdapter` */
interface AppAdapterOpts<Env extends HonoEnv, Schema extends HonoSchema, BasePath extends string> {
  /** The Hono app */
  app: Hono<Env, Schema, BasePath>;

  /** How the hono App should be adapted */
  type?: AppAdapterType;

  /** Function that enables creating a web platform request, given some WASI implementation */
  readWASIRequest: (incomingWasiReq: any) => Promise<Request>;

  /** Function that enables writing a wasi response, given  a web `Response` and some WASI implementation */
  writeWebResponse: (resp: Response, outgoingWasiResp: any) => Promise<void>;
}

/**
 * Adapter that converts a Hono application into one that can run
 * in a WebAssembly HTTP (i.e `wasi:http/incoming-handler`) context.
 *
 * There are multiple ways to run in an WASI HTTP context, namely:
 * - via manual `wasi:http/incoming-handler` bindings
 * - via WinterTC `fetch-event` integration
 *
 * The goal of this adapter is to enable easy use of a Hono applications via
 * the `wasi:http/incoming-adapter` by creating the relevant component export.
 *
 * @class WasiHttpAdapter
 */
class WasiHttpAdapter<Env extends HonoEnv, Schema extends HonoSchema, BasePath extends string> {
  /** The Hono App that should be used */
  private app: Hono<Env, Schema, BasePath>;

  /** The Hono App that should be used */
  private adapterType: AppAdapterType;

  /** Function that enables creating a web platform request, given some WASI implementation */
  private readWASIRequest: (incomingWasiReq: any) => Promise<Request>;

  /** Function that enables writing a wasi response, given  a web `Response` and some WASI implementation */
  private writeWebResponse: (resp: Response, outgoingWasiResp: any) => Promise<void>;

  constructor(opts: AppAdapterOpts<Env, Schema, BasePath>) {
    if (!opts.app) {
      throw TypeError("Hono app must be provided");
    }
    this.app = opts.app;
    this.adapterType = opts.type ?? AppAdapterType.WasiHTTP;

    this.readWASIRequest = opts.readWASIRequest;
    this.writeWebResponse = opts.writeWebResponse;
  }

  getAdapterType() {
    return this.adapterType;
  }

  /**
   * Build an ESM export that represents the app
   */
  asESMExport() {
    const app = this.app;

    const readWASIRequest = this.readWASIRequest;
    const writeWebResponse = this.writeWebResponse;

    switch (this.adapterType) {
      // Build an export that would satisfy wasi:http/incoming-handler
      case AppAdapterType.WasiHTTP:
        return {
          incomingHandler: {
            async handle(
              wasiRequest: any, // IncomingRequest
              wasiResponse: any, // ResponseOutparam
            ) {
              const request = await readWASIRequest(wasiRequest);
              const resp = await app.fetch(request);
              await writeWebResponse(resp, wasiResponse);
            },
          },
        };

      // Given that fetch-event is implemented natively for StarlingMonkey,
      // we know that we have already set the handle  already set the we only ahve
      case AppAdapterType.FetchEvent:
      default:
        throw new Error(
          `unexpected adapter type [${this.adapterType}], fetch-event adapters should be use via 'fire()'`,
        );
    }
  }
}

/** This global variable will be set to the application adapter when present */
let ADAPTER: WasiHttpAdapter<any, any, any>;

/**
 * A pre-made incomingHandler export for downstream users to export.
 *
 * This export should *not* be used at the top level of a component
 * that implements `fetch`-based HTTP handlers.
 */
export const incomingHandler = {
  async handle(
    req: any, // IncomingRequest
    resp: any, // ResponseOutparam
  ) {
    if (!ADAPTER) {
      throw new Error("app has not been set, ensure fire() was called with your app");
    }
    const adapterType = ADAPTER.getAdapterType();
    if (adapterType !== AppAdapterType.WasiHTTP) {
      throw new Error(
        `invalid adapter type [${adapterType}], expected WASI HTTP. For fetch-event, use 'fire()'`,
      );
    }
    const { incomingHandler } = ADAPTER.asESMExport();
    if (!incomingHandler) {
      throw new Error("unexpectedly missing incomingHandler generated ESM export");
    }
    await incomingHandler.handle(req, resp);
  },
};

/** Options for calling `fire()` */
export interface FireOpts {
  /**
   * Whether to use the `fetch-event` integration
   * rather than `wasi:http/incoming-handler`.
   *
   * At some point, `fetch-event` will be the default.
   */
  useFetchEvent?: boolean;
}

interface BuildFireFnArgs {
  /** Function that enables creating a web platform request, given some WASI implementation */
  readWASIRequest: (incomingWasiReq: any) => Promise<Request>;

  /** Function that enables writing a wasi response, given  a web `Response` and some WASI implementation */
  writeWebResponse: (resp: Response, outgoingWasiResp: any) => Promise<void>;
}

/**
 * This function builds a function that can be used as a `fire` function
 * to set up Hono.
 *
 * This function does one of two things:
 * - Sets up the machinery for fetch-event
 * - Sets the built HTTP adapter for later use (wasi:http incomingHandler export)
 */
export function buildFireFn(args: BuildFireFnArgs) {
  const { readWASIRequest, writeWebResponse } = args;

  return function fire<
    Env extends HonoEnv = HonoEnv,
    Schema extends HonoSchema = {},
    BasePath extends string = "/",
  >(app: Hono<Env, Schema, BasePath>, opts?: FireOpts) {
    const adapter = new WasiHttpAdapter({
      app,
      type: opts?.useFetchEvent ? AppAdapterType.FetchEvent : AppAdapterType.WasiHTTP,
      readWASIRequest,
      writeWebResponse,
    });
    const adapterType = adapter.getAdapterType();

    // If we're not doing fetch-event (i.e. we're using `wasi:http/incoming-handler`),
    // then we should set up the adapter, as we expect the user to have exported this
    // file's `incomingHandler` export.
    if (adapterType === AppAdapterType.WasiHTTP) {
      ADAPTER = adapter;
      return;
    }

    // If we're doing fetch-event, set up the application and exit early
    try {
      // NOTE: addEventListener does not yet have typings for FetchEvent
      const addEventListener = ensureGlobalAddEventListener() as any;
      addEventListener("fetch", (evt: FetchEventLike) => {
        evt.respondWith(app.fetch(evt.request));
      });
    } catch (err) {
      console.error("failed to build fetch event listener", err);
      throw err;
    }
  };
}
