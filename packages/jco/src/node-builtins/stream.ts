import { createRequire } from "node:module";
import {
    starReexportAdapter,
    type BuiltinContext,
    type BuiltinAdapter,
    builtin,
    stdModule,
    composeBuiltins,
    VIRTUAL_PREFIX,
} from "./shared.js";

const STREAM_SPECIFIER = "node:stream";

const STREAM_PROMISES_SPECIFIER = "node:stream/promises";

const STREAM_CONSUMERS_SPECIFIER = "node:stream/consumers";

const STREAM_ITER_SPECIFIER = "node:stream/iter";

const STREAM_EVENTS_MODULE = `${VIRTUAL_PREFIX}stream-events`;

/** Source of a capability-free Node stream submodule adapter. */
function streamAdapter(module: string): string {
    return starReexportAdapter(module, "streamModule");
}

export function createStreamBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    const modules: Record<string, () => string> = {
        [STREAM_SPECIFIER]: () => stdModule(options.streamModule, "stream"),
        [STREAM_PROMISES_SPECIFIER]: () => stdModule(options.streamPromisesModule, "stream/promises"),
        [STREAM_CONSUMERS_SPECIFIER]: () => stdModule(options.streamConsumersModule, "stream/consumers"),
        [STREAM_ITER_SPECIFIER]: () => stdModule(options.streamIterModule, "stream/iter"),
    };
    return composeBuiltins([
        {
            resolveId(id, importer) {
                // Only the audited portable core's dependencies use legacy bare IDs.
                // Share Buffer/EventEmitter/StringDecoder with ordinary node: imports.
                if (importer?.replaceAll("\\", "/").includes("/node_modules/readable-stream/lib/")) {
                    if (id === "events") {
                        return STREAM_EVENTS_MODULE;
                    }
                    if (id === "process/") {
                        return stdModule(options.streamSchedulerModule, "stream/scheduler");
                    }
                    if (id === "string_decoder/") {
                        return `${VIRTUAL_PREFIX}node:string_decoder`;
                    }
                    if (id === "abort-controller") {
                        return createRequire(importer).resolve(id);
                    }
                    if (id === "buffer" || id === "string_decoder") {
                        return `${VIRTUAL_PREFIX}node:${id}`;
                    }
                }
                if (
                    id === "event-target-shim" &&
                    importer?.replaceAll("\\", "/").includes("/node_modules/abort-controller/dist/")
                ) {
                    return createRequire(importer).resolve(id);
                }
                return null;
            },
            load(id) {
                if (id === `${VIRTUAL_PREFIX}commonjs-stream`) {
                    return `module.exports = require(${JSON.stringify(stdModule(options.streamModule, "stream"))}).default;`;
                }
                if (id !== STREAM_EVENTS_MODULE) {
                    return null;
                }
                return `import * as events from "node:events";
import { callableEmitter } from ${JSON.stringify(stdModule(options.streamEmitterModule, "stream/emitter"))};
export * from "node:events";
export const EventEmitter = callableEmitter(events.EventEmitter);
export default { ...events, EventEmitter };`;
            },
        },
        builtin(Object.keys(modules), (specifier) => streamAdapter(modules[specifier]())),
    ]);
}
