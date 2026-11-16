// Type-checks the `debug` option of `instantiate`, which bindings accept when
// they contain their runtime. See `instantiate-options.mts`.
import { instantiate, type InstantiateOptions } from './component.js';

declare const load: (path: string) => WebAssembly.Module;
const options: InstantiateOptions = { debug: true };

instantiate(load, {}, undefined, options);
instantiate(load, {}, undefined, { debug: false });
instantiate(load, {}, undefined, { debug: undefined });
// @ts-expect-error The debug option must be boolean.
instantiate(load, {}, undefined, { debug: '1' });
