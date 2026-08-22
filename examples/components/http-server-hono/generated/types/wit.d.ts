/// <reference path="./interfaces/wasi-clocks-monotonic-clock.d.ts" />
/// <reference path="./interfaces/wasi-http-incoming-handler.d.ts" />
/// <reference path="./interfaces/wasi-http-types.d.ts" />
/// <reference path="./interfaces/wasi-io-error.d.ts" />
/// <reference path="./interfaces/wasi-io-poll.d.ts" />
/// <reference path="./interfaces/wasi-io-streams.d.ts" />
declare module 'example:http-server-hono/component' {
  export type * as WasiClocksMonotonicClock0212 from 'wasi:clocks/monotonic-clock@0.2.12'; // import wasi:clocks/monotonic-clock@0.2.12
  export type * as WasiHttpTypes0212 from 'wasi:http/types@0.2.12'; // import wasi:http/types@0.2.12
  export type * as WasiIoError0212 from 'wasi:io/error@0.2.12'; // import wasi:io/error@0.2.12
  export type * as WasiIoPoll0212 from 'wasi:io/poll@0.2.12'; // import wasi:io/poll@0.2.12
  export type * as WasiIoStreams0212 from 'wasi:io/streams@0.2.12'; // import wasi:io/streams@0.2.12
  export * as incomingHandler from 'wasi:http/incoming-handler@0.2.12'; // export wasi:http/incoming-handler@0.2.12
}
