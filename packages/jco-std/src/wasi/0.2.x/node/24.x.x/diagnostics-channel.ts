/**
 * `node:diagnostics_channel`, in-process publish/subscribe for instrumentation.
 *
 * Capability-free: no host involvement, so it needs no WIT import. Channels are interned by name,
 * so a publisher and a subscriber that never share a reference still meet on the same object.
 *
 * `Channel.bindStore` takes anything offering `run(value, fn)`, which includes jco-std's
 * `AsyncLocalStorage`. Store scoping is therefore synchronous: a bound store is visible while
 * subscribers run, and does not follow an `await`. See `async-hooks.ts` for why that limit exists
 * and what would lift it.
 */

export {
  Channel,
  TracingChannel,
  channel,
  hasSubscribers,
  subscribe,
  tracingChannel,
  unsubscribe,
} from "./diagnostics-channel/index.js";

export type {
  BoundStore,
  MessageHandler,
  StoreTransform,
  TracingChannelSubscribers,
  TracingEvent,
} from "./diagnostics-channel/index.js";

import * as diagnosticsChannel from "./diagnostics-channel/index.js";

export default diagnosticsChannel;
