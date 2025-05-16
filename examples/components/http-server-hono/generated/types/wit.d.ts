/// <reference path="./interfaces/wasi-cli-environment.d.ts" />
/// <reference path="./interfaces/wasi-clocks-monotonic-clock.d.ts" />
/// <reference path="./interfaces/wasi-http-incoming-handler.d.ts" />
/// <reference path="./interfaces/wasi-http-types.d.ts" />
/// <reference path="./interfaces/wasi-io-error.d.ts" />
/// <reference path="./interfaces/wasi-io-poll.d.ts" />
/// <reference path="./interfaces/wasi-io-streams.d.ts" />
declare module 'example:hono/component' {
  export type * as WasiCliEnvironment023 from 'wasi:cli/environment@0.2.3'; // import wasi:cli/environment@0.2.3
  export type * as WasiClocksMonotonicClock023 from 'wasi:clocks/monotonic-clock@0.2.3'; // import wasi:clocks/monotonic-clock@0.2.3
  export type * as WasiHttpTypes023 from 'wasi:http/types@0.2.3'; // import wasi:http/types@0.2.3
  export type * as WasiIoError023 from 'wasi:io/error@0.2.3'; // import wasi:io/error@0.2.3
  export type * as WasiIoPoll023 from 'wasi:io/poll@0.2.3'; // import wasi:io/poll@0.2.3
  export type * as WasiIoStreams023 from 'wasi:io/streams@0.2.3'; // import wasi:io/streams@0.2.3
  export * as incomingHandler from 'wasi:http/incoming-handler@0.2.3'; // export wasi:http/incoming-handler@0.2.3
}
