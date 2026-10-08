// Type-checks the `options` parameter against the overloads that only async
// instantiation output provides. See `instantiate-options.mts`.
import { instantiate } from './component.js';

declare const load: (path: string) => WebAssembly.Module;

instantiate(async (path) => load(path), {}, WebAssembly.instantiate, { shim: { globals: { WebAssembly } } });
