/**
 * Node 24's builtin module list, verbatim.
 *
 * Captured from the pinned release rather than written by hand:
 *
 * ```console
 * node -e 'console.log(require("node:module").builtinModules.join("\n"))'
 * ```
 *
 * This is a *classification*, not an availability list: it answers "is this a Node builtin?", which
 * is the question `isBuiltin` asks. Whether Jco resolves a given builtin is a separate matter -- see
 * the compatibility table in the docs for what a component can actually import.
 */
export const builtinModules: readonly string[] = Object.freeze([
  "_http_agent",
  "_http_client",
  "_http_common",
  "_http_incoming",
  "_http_outgoing",
  "_http_server",
  "_stream_duplex",
  "_stream_passthrough",
  "_stream_readable",
  "_stream_transform",
  "_stream_wrap",
  "_stream_writable",
  "_tls_common",
  "_tls_wrap",
  "assert",
  "assert/strict",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "dns/promises",
  "domain",
  "events",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "inspector",
  "inspector/promises",
  "module",
  "net",
  "os",
  "path",
  "path/posix",
  "path/win32",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "readline/promises",
  "repl",
  "stream",
  "stream/consumers",
  "stream/promises",
  "stream/web",
  "string_decoder",
  "sys",
  "timers",
  "timers/promises",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "util/types",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
  "node:sea",
  "node:sqlite",
  "node:test",
  "node:test/reporters",
]);

/** Builtins reachable only as `node:x`, such as `node:test`. */
const PREFIXED = new Set(builtinModules.filter((name) => name.startsWith("node:")));

/** Builtins reachable without a scheme, such as `fs`. */
const BARE = new Set(builtinModules.filter((name) => !name.startsWith("node:")));

/**
 * Node's `module.isBuiltin(name)`.
 *
 * A bare name matches only the scheme-less builtins: `isBuiltin("test")` is **false**, because
 * `node:test` exists only under the prefix. A `node:`-prefixed name matches either set.
 *
 * @param name - the specifier to classify
 */
export function isBuiltin(name: string): boolean {
  if (!name.startsWith("node:")) {
    return BARE.has(name);
  }
  return PREFIXED.has(name) || BARE.has(name.slice("node:".length));
}
