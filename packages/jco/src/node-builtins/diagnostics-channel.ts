import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";

const DIAGNOSTICS_CHANNEL_SPECIFIER = "node:diagnostics_channel";

/**
 * Source of the `node:diagnostics_channel` adapter.
 *
 * Capability-free: in-process publish/subscribe with no host involvement.
 */
function diagnosticsChannelAdapter(diagnosticsChannelModule: string): string {
    return `
import diagnosticsChannel from ${JSON.stringify(diagnosticsChannelModule)};
export default diagnosticsChannel;
export {
    Channel,
    TracingChannel,
    channel,
    hasSubscribers,
    subscribe,
    tracingChannel,
    unsubscribe,
} from ${JSON.stringify(diagnosticsChannelModule)};
`;
}

export function createDiagnosticsChannelBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(DIAGNOSTICS_CHANNEL_SPECIFIER, () =>
        diagnosticsChannelAdapter(stdModule(options.diagnosticsChannelModule, "diagnostics-channel")),
    );
}
