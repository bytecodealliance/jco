import * as console from "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/console/host";
import * as http from "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http/host";
import * as timers from "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/timers/host";

// Match the CLI's default-denied mappings for portable globals. Tests opt in to
// real capabilities by supplying their own providers.
export function withDefaultNodeImports(imports) {
    return { "jco:node/console": console, "jco:node/http": http, "jco:node/timers": timers, ...imports };
}
