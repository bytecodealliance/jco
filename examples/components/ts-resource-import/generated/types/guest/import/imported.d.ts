/// <reference path="./interfaces/test-component-resources.d.ts" />
/// <reference path="./interfaces/wasi-cli-run.d.ts" />
declare module 'test:component/imported' {
  export type * as TestComponentResources from 'test:component/resources'; // import test:component/resources
  export * as run from 'wasi:cli/run@0.2.4'; // export wasi:cli/run@0.2.4
}
