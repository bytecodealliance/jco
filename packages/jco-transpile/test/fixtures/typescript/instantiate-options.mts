// Type-checks the `options` parameter of generated `instantiate` signatures in
// both instantiation modes. The test copies this file next to a generated
// `component.d.ts` before compiling it.
import { instantiate, type InstantiateOptions } from './component.js';

declare const load: (path: string) => WebAssembly.Module;
const options: InstantiateOptions = { shim: { globals: { WebAssembly } } };

instantiate(load, {});
instantiate(load, {}, undefined, {});
instantiate(load, {}, undefined, { shim: {} });
instantiate(load, {}, undefined, { shim: { globals: {} } });
instantiate(load, {}, undefined, options);
instantiate(load, {}, (module, imports) => new WebAssembly.Instance(module, imports), options);

// @ts-expect-error An incompatible WebAssembly implementation must be rejected.
instantiate(load, {}, undefined, { shim: { globals: { WebAssembly: { compile: () => 0 } } } });
// @ts-expect-error Global overrides belong inside options.shim.globals.
instantiate(load, {}, undefined, { WebAssembly });
// @ts-expect-error Global overrides must be grouped under shim.
instantiate(load, {}, undefined, { globals: { WebAssembly } });
