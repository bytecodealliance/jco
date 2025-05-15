import { app } from "./app.js";

/**
 * Register the Hono application with the global fetch listener as supported by the underlying StarlingMonkey JS runtime.
 *
 * Since both Hono and StarlingMonkey are aligned Web Standards (WinterCG/WinterTC),
 * this enables Hono to run smoothly in WASI-enabled (`wasi:http`) Webassembly environments.
 *
 * See: https://github.com/bytecodealliance/ComponentizeJS#using-starlingmonkeys-fetch-event
 * See: https://hono.dev/docs/concepts/web-standard
 * See: https://wintertc.org/
 * See: https://github.com/WebAssembly/wasi-http
 */
app.fire();
