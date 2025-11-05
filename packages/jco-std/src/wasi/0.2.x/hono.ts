/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Hono, Schema as HonoSchema, Env as HonoEnv } from 'hono';
import { FetchEventLike } from 'hono/types';

import { ensureGlobalAddEventListener } from '../globals.js';

import { buildConfigHelperFromWASI, type WASIConfigStoreLike } from './config.js';
import { buildEnvHelperFromWASI, type WASICLIEnvironmentLike } from './cli/environment.js';

/** Strategy for interfacing with WASI environment */
enum AppAdapterType {
    WasiHTTP = 'wasi-http',
    FetchEvent = 'fetch-event',
}

/** Configuration for generating ENV variables that will be used in the Hono app */
export enum WASIEnvGenerationStrategy {
    /** Don't generate environment variables from WASI */

    Never = 'never',
    /** Generate environment variables from WASI once at app startup */

    OnceBeforeStartup = 'once-before-startup',
    /** Generate environment variables from WASI once at app startup */

    OncePerRequest = 'on-request',
}

/** Configuration for the execution context */
interface ExecCtxConfig {
    /** Enable use of the `wasi:config` helper from the execution context */
    enableWasiConfigHelper?: boolean;
}

/** Options for building a `AppAdapter` */
interface AppAdapterOpts<
    Env extends HonoEnv,
    Schema extends HonoSchema,
    BasePath extends string,
> {
    /** The Hono app */
    app: Hono<Env, Schema, BasePath>;

    /** How the hono App should be adapted */
    type?: AppAdapterType;

    /** Strategy to use when generating env for requests */
    wasiEnvGenerationStrategy?: WASIEnvGenerationStrategy;

    /** Configuration for how to generate the env passed to Hono */
    execCtx?: ExecCtxConfig;

    /** Adapter that contains `wasi:config` APIs */
    wasiConfigStore: WASIConfigStoreLike,

    /** Adapter that contains `wasi:cli/environment` APIs */
    wasiEnvironment: WASICLIEnvironmentLike,

    /** Function that enables creating a web platform request, given some WASI implementation */
    readWASIRequest: (incomingWasiReq: any) => Promise<Request>;

    /** Function that enables writing a wasi response, given  a web `Response` and some WASI implementation */
    writeWebResponse: (resp: Response, outgoingWasiResp: any) => void;
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
class WasiHttpAdapter<
    Env extends HonoEnv,
    Schema extends HonoSchema,
    BasePath extends string,
> {
    /** The Hono App that should be used */
    private app: Hono<Env, Schema, BasePath>;

    /** The Hono App that should be used */
    private adapterType: AppAdapterType;

    /** The strategy to use for generating environment variables */
    private wasiEnvGenerationStrategy: WASIEnvGenerationStrategy;

    /** Whether to include wasi  strategy to use for generating environment variables */
    private execCtxConfig: ExecCtxConfig;

    /** Adapter that contains `wasi:config` APIs */
    private wasiConfigStore: WASIConfigStoreLike;

    /** Adapter that contains `wasi:cli/environment` APIs */
    private wasiEnvironment: WASICLIEnvironmentLike;

    /** Function that enables creating a web platform request, given some WASI implementation */
    private readWASIRequest: (incomingWasiReq: any) => Promise<Request>;

    /** Function that enables writing a wasi response, given  a web `Response` and some WASI implementation */
    private writeWebResponse: (resp: Response, outgoingWasiResp: any) => void;

    constructor(opts: AppAdapterOpts<Env, Schema, BasePath>) {
        if (!opts.app) {
            throw TypeError('Hono app must be provided');
        }
        this.app = opts.app;
        this.adapterType = opts.type ?? AppAdapterType.WasiHTTP;
        // While more compute-intensive, by default we use once per-request to
        // ensure that if the host platform were to change ENV, it would be noticed by
        // subsequent requests.
        this.wasiEnvGenerationStrategy =
            opts.wasiEnvGenerationStrategy ??
            WASIEnvGenerationStrategy.OncePerRequest;
        this.execCtxConfig = opts.execCtx ?? {};

        this.wasiConfigStore = opts.wasiConfigStore;
        this.wasiEnvironment = opts.wasiEnvironment;
        this.readWASIRequest = opts.readWASIRequest;
        this.writeWebResponse = opts.writeWebResponse;
    }

    getAdapterType() {
        return this.adapterType;
    }

    getEnvGenerationStrategy() {
        return this.wasiEnvGenerationStrategy;
    }

    wasiConfigHelperEnabled() {
        return this.execCtxConfig.enableWasiConfigHelper;
    }

    /**
     * Build an ESM export that represents the app
     */
    asESMExport() {
        const envGenerationStrategy = this.wasiEnvGenerationStrategy;
        const app = this.app;
        const execCtxConfig = this.execCtxConfig;

        const envHelper = buildEnvHelperFromWASI(this.wasiEnvironment);
        const readWASIRequest = this.readWASIRequest;
        const writeWebResponse = this.writeWebResponse;
        const wasiConfigStore = this.wasiConfigStore;

        switch (this.adapterType) {
        // Build an export that would satisfy wasi:http/incoming-handler
        case AppAdapterType.WasiHTTP:
            let env: Record<string, string>;
            if (
                envGenerationStrategy ===
                    WASIEnvGenerationStrategy.OnceBeforeStartup
            ) {
                env = envHelper.getAllObject();
            }

            return {
                incomingHandler: {
                    async handle(
                        wasiRequest: any,// IncomingRequest
                        wasiResponse: any // ResponseOutparam
                    ) {
                        if (
                            envGenerationStrategy ===
                                WASIEnvGenerationStrategy.OncePerRequest
                        ) {
                            env = envHelper.getAllObject();
                        }
                        const request = await readWASIRequest(wasiRequest);
                        const resp = await app.fetch(
                            request,
                            env,
                            buildExecContext({
                                adapterConfigHelperEnabled: execCtxConfig.enableWasiConfigHelper,
                                wasiConfigStore,
                            }),
                        );
                        writeWebResponse(resp, wasiResponse);
                    },
                },
            };

            // Given that fetch-event is implemented natively for StarlingMonkey,
            // we know that we have already set the handle  already set the we only ahve
        case AppAdapterType.FetchEvent:
        default:
            throw new Error(
                `unexpected adapter type [${this.adapterType}], fetch-event adapters should be use via 'fire()'`
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
    handle(
        req: any, // IncomingRequest
        resp: any, // ResponseOutparam
    ) {
        if (!ADAPTER) {
            throw new Error(
                'app has not been set, ensure fire() was called with your app'
            );
        }
        const adapterType = ADAPTER.getAdapterType();
        if (adapterType !== AppAdapterType.WasiHTTP) {
            throw new Error(
                `invalid adapter type [${adapterType}], expected WASI HTTP. For fetch-event, use 'fire()'`
            );
        }
        const { incomingHandler } = ADAPTER.asESMExport();
        if (!incomingHandler) {
            throw new Error(
                'unexpectedly missing incomingHandler generated ESM export'
            );
        }
        incomingHandler.handle(req, resp);
    },
};

/** Options for calling `fire()` */
export interface FireOpts {
    /**
     * Whether to use the `wasi:http/incoming-handler` adapter
     * rather than the default WinterTC `fetch-event` integration.
     */
    useWasiHTTP?: boolean;

    // Configuration for how to generate the env passed to Hono
    wasiEnvGenerationStrategy?: WASIEnvGenerationStrategy;

    // Configuration for how to generate the env passed to Hono
    execCtx?: {
        /** Enable use of the `wasi:config` helper from the execution context */
        wasiConfig?: boolean;
    };
}

interface BuildFireFnArgs {
    /** Adapter that contains `wasi:config` APIs */
    wasiConfigStore: WASIConfigStoreLike;

    /** Adapter that contains `wasi:cli/environment` APIs */
    wasiEnvironment: WASICLIEnvironmentLike;

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
    const { wasiConfigStore, wasiEnvironment, readWASIRequest, writeWebResponse } = args;

    const envHelper = buildEnvHelperFromWASI(wasiEnvironment);

    return function fire<
        Env extends HonoEnv = HonoEnv,
    Schema extends HonoSchema = {}, // eslint-disable-line @typescript-eslint/no-empty-object-type
    BasePath extends string = '/',
        >(
        app: Hono<Env, Schema, BasePath>,
        opts?: FireOpts,
    ) {
        const adapter = new WasiHttpAdapter({
            app,
            type: opts?.useWasiHTTP
                ? AppAdapterType.WasiHTTP
                : AppAdapterType.FetchEvent,
            wasiEnvGenerationStrategy: opts?.wasiEnvGenerationStrategy,
            wasiConfigStore,
            wasiEnvironment,
            readWASIRequest,
            writeWebResponse,
        });
        const adapterType = adapter.getAdapterType();
        const adapterEnvGenerationStrategy = adapter.getEnvGenerationStrategy();
        const adapterConfigHelperEnabled = adapter.wasiConfigHelperEnabled();

        // If we're not doing fetch-event (i.e. we're using `wasi:http/incoming-handler`),
        // then we should set up the adapter, as we expect the user to have exported this
        // file's `incomingHandler` export.
        if (adapterType === AppAdapterType.WasiHTTP) {
            ADAPTER = adapter;
            return;
        }

        // If we're doing fetch-event, set up the application and exit early
        let env: Record<string, string>;
        if (
            adapterEnvGenerationStrategy ===
                    WASIEnvGenerationStrategy.OnceBeforeStartup
        ) {
            env = envHelper.getAllObject();
        }

        try {
            // NOTE: addEventListener does not yet have typings for FetchEvent
            const addEventListener = ensureGlobalAddEventListener() as any;
            addEventListener('fetch', (evt: FetchEventLike) => {
                if (
                    adapterEnvGenerationStrategy ===
                            WASIEnvGenerationStrategy.OncePerRequest
                ) {
                    env = envHelper.getAllObject();
                }
                evt.respondWith(
                    app.fetch(
                        evt.request,
                        env,
                        buildExecContext({ adapterConfigHelperEnabled, wasiConfigStore })
                    )
                );
            });
        } catch (err) {
            console.error('failed to build fetch event listener', err);
            throw err;
        }

    }
}

/** Arguments for `buildExecContext()` */
interface BuildExecContextArgs {
    adapterConfigHelperEnabled?: boolean;
    wasiConfigStore: WASIConfigStoreLike;
}

/** Build a execution context from a given adapter */
function buildExecContext(args: BuildExecContextArgs) {
    return {
        waitUntil: () => {
            throw new Error('waitUntil is not yet implemented for WASI');
        },
        passThroughOnException: () => {
            throw new Error(
                'passThroughOnException is not yet implemented for WASI'
            );
        },
        props: {
            config: args.adapterConfigHelperEnabled
                ? buildConfigHelperFromWASI(args.wasiConfigStore)
                : undefined,
        },
    };
}
