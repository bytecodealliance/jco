export type Pollable = number;
export namespace Poll {
  export function pollOneoff(input: Pollable[]): Uint8Array;
}
