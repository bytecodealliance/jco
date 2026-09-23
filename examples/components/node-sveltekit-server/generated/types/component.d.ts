// world example:node-sveltekit-server/component
import type * as JcoNodeFs from './interfaces/jco-node-fs.js'; // jco:node/fs@0.1.0
import type * as JcoNodeHttp from './interfaces/jco-node-http.js'; // jco:node/http@0.1.0
import type * as JcoNodeProcess from './interfaces/jco-node-process.js'; // jco:node/process@0.1.0
import type * as JcoNodeTty from './interfaces/jco-node-tty.js'; // jco:node/tty@0.1.0
import type * as JcoNodeTypes from './interfaces/jco-node-types.js'; // jco:node/types@0.1.0
import type * as WasiCliEnvironment from './interfaces/wasi-cli-environment.js'; // wasi:cli/environment@0.2.12
import type * as JcoNodeHttpCallbacks from './interfaces/jco-node-http-callbacks.js'; // jco:node/http-callbacks@0.1.0
export interface ImportObject {
  'jco:node/fs@0.1.0': typeof JcoNodeFs,
  'jco:node/http@0.1.0': typeof JcoNodeHttp,
  'jco:node/process@0.1.0': typeof JcoNodeProcess,
  'jco:node/tty@0.1.0': typeof JcoNodeTty,
  'jco:node/types@0.1.0': typeof JcoNodeTypes,
  'wasi:cli/environment@0.2.12': typeof WasiCliEnvironment,
}
export interface Component {
  'jco:node/http-callbacks@0.1.0': typeof JcoNodeHttpCallbacks,
  httpCallbacks: typeof JcoNodeHttpCallbacks,
  start(port: number): Promise<number>,
  stop(): Promise<void>,
}

/**
* Instantiates this component with the provided imports and
* returns a map of all the exports of the component.
*
* This function is intended to be similar to the
* `WebAssembly.Instantiate` constructor. The second `imports`
* argument is the "import object" for wasm, except here it
* uses component-model-layer types instead of core wasm
* integers/numbers/etc.
*
* The first argument to this function, `getCoreModule`, is
* used to compile core wasm modules within the component.
* Components are composed of core wasm modules and this callback
* will be invoked per core wasm module. The caller of this
* function is responsible for reading the core wasm module
* identified by `path` and returning its compiled
* `WebAssembly.Module` object. This would use the
* `WebAssembly.Module` constructor on the web, for example.
*/
export function instantiate(
getCoreModule: (path: string) => WebAssembly.Module,
imports: ImportObject,
instantiateCore?: (module: WebAssembly.Module, imports: Record<string, any>) => WebAssembly.Instance
): Component;
export function instantiate(
getCoreModule: (path: string) => WebAssembly.Module | Promise<WebAssembly.Module>,
imports: ImportObject,
instantiateCore?: (module: WebAssembly.Module, imports: Record<string, any>) => WebAssembly.Instance | Promise<WebAssembly.Instance>
): Component | Promise<Component>;

