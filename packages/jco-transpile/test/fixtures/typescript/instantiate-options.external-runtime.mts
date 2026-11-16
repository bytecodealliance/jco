// Type-checks that `instantiate` takes no `debug` option when the bindings import
// an external runtime, whose logger is shared between instances and configured
// by its provider. See `instantiate-options.mts`.
import { instantiate } from './component.js';

declare const load: (path: string) => WebAssembly.Module;

instantiate(load, {}, undefined, { onTrap: () => {} });
// @ts-expect-error An external runtime does not take the logging choice of an instance.
instantiate(load, {}, undefined, { debug: true });
