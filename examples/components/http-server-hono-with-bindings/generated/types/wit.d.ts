/// <reference path="./interfaces/wasi-cli-environment.d.ts" />
/// <reference path="./interfaces/wasi-clocks-monotonic-clock.d.ts" />
/// <reference path="./interfaces/wasi-config-store.d.ts" />
/// <reference path="./interfaces/wasi-http-incoming-handler.d.ts" />
/// <reference path="./interfaces/wasi-http-types.d.ts" />
/// <reference path="./interfaces/wasi-io-error.d.ts" />
/// <reference path="./interfaces/wasi-io-poll.d.ts" />
/// <reference path="./interfaces/wasi-io-streams.d.ts" />
declare module 'example:http-server-hono-with-bindings/component' {
  export type * as WasiCliEnvironment026 from 'wasi:cli/environment@0.2.6'; // import wasi:cli/environment@0.2.6
  export type * as WasiClocksMonotonicClock026 from 'wasi:clocks/monotonic-clock@0.2.6'; // import wasi:clocks/monotonic-clock@0.2.6
  export type * as WasiConfigStore020Rc1 from 'wasi:config/store@0.2.0-rc.1'; // import wasi:config/store@0.2.0-rc.1
  export type * as WasiHttpTypes026 from 'wasi:http/types@0.2.6'; // import wasi:http/types@0.2.6
  export type * as WasiIoError026 from 'wasi:io/error@0.2.6'; // import wasi:io/error@0.2.6
  export type * as WasiIoPoll026 from 'wasi:io/poll@0.2.6'; // import wasi:io/poll@0.2.6
  export type * as WasiIoStreams026 from 'wasi:io/streams@0.2.6'; // import wasi:io/streams@0.2.6
  export * as incomingHandler from 'wasi:http/incoming-handler@0.2.6'; // export wasi:http/incoming-handler@0.2.6
}
