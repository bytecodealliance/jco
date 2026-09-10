import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";
import { unenvModule } from "./unenv.js";

const EVENTS_SPECIFIER = "node:events";

/**
 * Source of the `node:events` adapter.
 *
 * unenv's `EventEmitter` is faithful to Node and is reused whole, including `once`, `on`,
 * `getEventListeners`, `addAbortListener` and `EventEmitterAsyncResource`. Three module-level
 * functions are not: `listenerCount` and `setMaxListeners` are `notImplemented` stubs that throw
 * when called, and `getMaxListeners` throws when handed an `EventTarget`. jco-std implements those
 * three against the core, so guests get a complete module rather than one that fails at runtime.
 *
 * @param eventsCoreModule - unenv's `node:events`, supplying `EventEmitter`
 * @param eventsModule - jco-std's `completeEvents`
 */
function eventsAdapter(eventsCoreModule: string, eventsModule: string): string {
    return `
import { completeEvents } from ${JSON.stringify(eventsModule)};
import events from ${JSON.stringify(eventsCoreModule)};
export * from ${JSON.stringify(eventsCoreModule)};
const completed = completeEvents(events);
// Explicit exports shadow the star re-export above, replacing the stubs with the real thing.
export const getMaxListeners = completed.getMaxListeners;
export const listenerCount = completed.listenerCount;
export const setMaxListeners = completed.setMaxListeners;
// Node's module object *is* the EventEmitter class, so \`events === events.EventEmitter\` holds and
// every module export is also a static. Anything reaching these through the class -- or through a
// captured default export -- has to see the completed versions too. Defined rather than assigned:
// unenv exposes \`getMaxListeners\` as a getter-only accessor, so assigning to it throws.
for (const [name, value] of Object.entries(completed)) {
    Object.defineProperty(events, name, { configurable: true, value, writable: true });
}
export default events;
`;
}

export function createEventsBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(EVENTS_SPECIFIER, () =>
        eventsAdapter(unenvModule(EVENTS_SPECIFIER, options), stdModule(options.eventsModule, "events")),
    );
}
