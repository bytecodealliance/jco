import { WasiP2Shim } from "./wasi-shim.js";

export { WasiP2Shim } from "./wasi-shim.js";

/**
* Generate a WASI imports object that can be used for
* manual component instantiation of a transpiled component.
*
* Normally, transpiled components contain mapping for WASI interfaces
* and/or imports that import the relevant packages (ex. `@bytecodealliance/preview2-shim/clocks`)
* from the right sources.
*
* This function makes use of the `WasiShim` object to provide an object that can be easily
* fed to the `instantiate` function produced by a transpiled component:
*
* ```js
* import { imports } from "@bytecodealliance/preview2-shim.js"
* // ...
* import { instantiate } from "path/to/transpiled/component.js"
* // ...
* const component = instantiate(null, imports())
* ```
*
* You can also replace imports that you'd like to override with custom implementations,
* by using the `WasiShim` object directly:
*
* ```js
* import { imports, WasiShim } from "@bytecodealliance/preview2-shim.js"
* // ...
* import { instantiate } from "path/to/transpiled/component.js"
* // ...
* const defaultImports = imports();
* const customImports = new WasiShim({
*     random: {
*         random: defaultImports["wasi:random/random"],
*         insecure: {
*             // Your custom implementation for the `wasi:random/insecure` interface goes here
*         }
*         insecure-seed: defaultImports["wasi:random/insecure-seed"],
*     }
* });
*
* const component = instantiate(null, customImports.importObject())
* ```
*/
export function imports()  {
  const shim = new WasiP2Shim();
  return shim.importObject();
}
