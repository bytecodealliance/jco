export type Pollable = number;
export namespace WasiPoll {
  export function pollOneoff(input: Pollable[]): Uint8Array;
}
