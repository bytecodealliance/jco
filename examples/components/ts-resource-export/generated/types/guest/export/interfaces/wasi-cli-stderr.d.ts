/// <reference path="./wasi-io-streams.d.ts" />
declare module 'wasi:cli/stderr@0.2.7' {
  export function getStderr(): OutputStream;
  export type OutputStream = import('wasi:io/streams@0.2.7').OutputStream;
}
