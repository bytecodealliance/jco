import { type WorldMetadata, type NodeBuiltinOptions } from "./types.js";
import { type Plugin } from "rolldown";
import { createGlobalsBuiltin } from "./globals.js";
import { createAssertBuiltin } from "./assert.js";
import { createModuleBuiltin } from "./module.js";
import { createFfiBuiltin } from "./ffi.js";
import { createInspectorBuiltin } from "./inspector.js";
import { createDomainBuiltin } from "./domain.js";
import { createTimersBuiltin } from "./timers.js";
import { createPerfHooksBuiltin } from "./perf-hooks.js";
import { createDiagnosticsChannelBuiltin } from "./diagnostics-channel.js";
import { createAsyncHooksBuiltin } from "./async-hooks.js";
import { createEventsBuiltin } from "./events.js";
import { createProcessBuiltin } from "./process.js";
import { createOsBuiltin } from "./os.js";
import { createTestBuiltin } from "./test.js";
import { createSqliteBuiltin } from "./sqlite.js";
import { createReadlineBuiltin } from "./readline.js";
import { createReplBuiltin } from "./repl.js";
import { createStringDecoderBuiltin } from "./string-decoder.js";
import { createTtyBuiltin } from "./tty.js";
import { createStreamBuiltin } from "./stream.js";
import { createClusterBuiltin } from "./cluster.js";
import { createChildProcessBuiltin } from "./child-process.js";
import { createConsoleBuiltin } from "./console.js";
import { createDnsBuiltin } from "./dns.js";
import { createFsBuiltin } from "./fs.js";
import { createNetBuiltin } from "./net.js";
import { createHttpBuiltin } from "./http.js";
import { createHttpsBuiltin } from "./https.js";
import { createTlsBuiltin } from "./tls.js";
import { createHttp2Builtin } from "./http2.js";
import { createBufferBuiltin } from "./buffer.js";
import { createQuerystringBuiltin } from "./querystring.js";
import { createUrlBuiltin } from "./url.js";
import { createPathBuiltin } from "./path.js";
import { composeBuiltins, VIRTUAL_PREFIX } from "./shared.js";

export type {
    NodeBuiltinOptions,
    NodejsHttpVia,
    NodejsHttp2Via,
    WorldMetadata,
    NodeErrorGlobalsOptions,
    NodeGlobalsOptions,
} from "./types.js";

export { nodeErrorGlobals, nodeGlobals } from "./globals.js";

export { INSPECTOR_CALLBACKS_SPECIFIER } from "./inspector.js";

export { HTTP_CALLBACKS_SPECIFIER } from "./http.js";

export { HTTP2_CALLBACKS_SPECIFIER } from "./http2.js";

/** Create Jco's virtual adapters for supported Node builtins. */
export function nodeBuiltinPlugin(worldMetadata: WorldMetadata, options: NodeBuiltinOptions = {}): Plugin {
    const context = { worldMetadata, options };
    const adapters = [
        createGlobalsBuiltin,
        createAssertBuiltin,
        createModuleBuiltin,
        createFfiBuiltin,
        createInspectorBuiltin,
        createDomainBuiltin,
        createPerfHooksBuiltin,
        createTimersBuiltin,
        createDiagnosticsChannelBuiltin,
        createAsyncHooksBuiltin,
        createEventsBuiltin,
        createProcessBuiltin,
        createOsBuiltin,
        createSqliteBuiltin,
        createReadlineBuiltin,
        createReplBuiltin,
        createTestBuiltin,
        createStringDecoderBuiltin,
        createTtyBuiltin,
        createStreamBuiltin,
        createClusterBuiltin,
        createChildProcessBuiltin,
        createConsoleBuiltin,
        createDnsBuiltin,
        createFsBuiltin,
        createNetBuiltin,
        createHttpBuiltin,
        createHttpsBuiltin,
        createTlsBuiltin,
        createHttp2Builtin,
        createBufferBuiltin,
        createQuerystringBuiltin,
        createPathBuiltin,
        createUrlBuiltin,
    ];
    const composed = composeBuiltins(adapters.map((create) => create(context)));
    return {
        name: "jco-node-builtins",

        resolveId(id, importer) {
            return id.startsWith(VIRTUAL_PREFIX) ? id : composed.resolveId(id, importer);
        },

        load(id) {
            return id.startsWith(VIRTUAL_PREFIX) ? composed.load(id) : null;
        },
    };
}
