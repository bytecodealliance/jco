import { Random as RandomImports } from './imports/random';
import { Console as ConsoleImports } from './imports/console';
import { Poll as PollImports } from './imports/poll';
import { Streams as StreamsImports } from './imports/streams';
import { Types as TypesImports } from './imports/types';
import { DefaultOutgoingHttp as DefaultOutgoingHttpImports } from './imports/default-outgoing-HTTP';
import { Http as HttpExports } from './exports/HTTP';
export interface ImportObject {
  'random': typeof RandomImports,
  'console': typeof ConsoleImports,
  'poll': typeof PollImports,
  'streams': typeof StreamsImports,
  'types': typeof TypesImports,
  'default-outgoing-HTTP': typeof DefaultOutgoingHttpImports,
}
export interface WasiProxy {
  'HTTP': typeof HttpExports,
}

/**
* Instantiates this component with the provided imports and
* returns a map of all the exports of the component.
*
* This function is intended to be similar to the
* `WebAssembly.instantiate` function. The second `imports`
* argument is the "import object" for wasm, except here it
* uses component-model-layer types instead of core wasm
* integers/numbers/etc.
*
* The first argument to this function, `compileCore`, is
* used to compile core wasm modules within the component.
* Components are composed of core wasm modules and this callback
* will be invoked per core wasm module. The caller of this
* function is responsible for reading the core wasm module
* identified by `path` and returning its compiled
* WebAssembly.Module object. This would use `compileStreaming`
* on the web, for example.
*/
export function instantiate(
compileCore: (path: string, imports: Record<string, any>) => Promise<WebAssembly.Module>,
imports: ImportObject,
instantiateCore?: (module: WebAssembly.Module, imports: Record<string, any>) => Promise<WebAssembly.Instance>
): Promise<WasiProxy>;

