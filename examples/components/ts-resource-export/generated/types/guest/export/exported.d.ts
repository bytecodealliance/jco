/// <reference path="./interfaces/test-component-resources.d.ts" />
/// <reference path="./interfaces/wasi-cli-stderr.d.ts" />
/// <reference path="./interfaces/wasi-io-error.d.ts" />
/// <reference path="./interfaces/wasi-io-poll.d.ts" />
/// <reference path="./interfaces/wasi-io-streams.d.ts" />
declare module 'test:component/exported' {
  export type * as WasiCliStderr027 from 'wasi:cli/stderr@0.2.7'; // import wasi:cli/stderr@0.2.7
  export type * as WasiIoError027 from 'wasi:io/error@0.2.7'; // import wasi:io/error@0.2.7
  export type * as WasiIoPoll027 from 'wasi:io/poll@0.2.7'; // import wasi:io/poll@0.2.7
  export type * as WasiIoStreams027 from 'wasi:io/streams@0.2.7'; // import wasi:io/streams@0.2.7
  export * as resources from 'test:component/resources'; // export test:component/resources
}
