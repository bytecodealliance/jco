/*
Copyright Joyent, Inc. and other Node contributors.

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
/**
 * Runs only inside the opt-in Node provider's native worker. Install this guest's
 * environment snapshot before loading the application. Application workerData and
 * native parentPort remain ordinary node:worker_threads exports.
 */
import workers from "node:worker_threads";
import { Module, syncBuiltinESMExports } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

interface BootstrapData {
  filename: string;
  filenameIsURL: boolean;
  eval: boolean;
  data: unknown;
  environment: Map<unknown, unknown>;
}
const startup = workers.workerData as BootstrapData;
for (const [key, value] of startup.environment) {
  Reflect.apply(workers.setEnvironmentData, workers, [key, value]);
}
Object.defineProperty(workers, "workerData", {
  value: startup.data,
  writable: true,
  enumerable: true,
  configurable: true,
});
syncBuiltinESMExports();

// These native CommonJS loader members are used by Node's own eval bootstrap,
// but are intentionally absent from its public TypeScript declarations.
interface CompilableModule extends Module {
  _compile(source: string, filename: string): unknown;
}
interface CommonJSModuleConstructor {
  new (id: string): CompilableModule;
  _nodeModulePaths(directory: string): string[];
}

if (startup.eval) {
  // Module setup adapted from Node v24.20.0 lib/internal/process/execution.js,
  // createModule(), commit 71b8b174857e25106d39b61a9e6f30d927da8b01 (MIT).
  // Compile with Node's real CommonJS loader instead of approximating require/module.
  const CommonJSModule = Module as unknown as CommonJSModuleConstructor;
  const module = new CommonJSModule("[worker eval]");
  module.filename = resolve("[worker eval]");
  module.paths = CommonJSModule._nodeModulePaths(process.cwd());
  module._compile(startup.filename, module.filename);
} else {
  await import(
    startup.filenameIsURL ? startup.filename : pathToFileURL(resolve(startup.filename)).href
  );
}
