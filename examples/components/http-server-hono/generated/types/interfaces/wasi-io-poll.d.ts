declare module 'wasi:io/poll@0.2.3' {
  export function poll(in_: Array<Pollable>): Uint32Array;
  
  export class Pollable {
    /**
     * This type does not have a public constructor.
     */
    private constructor();
    ready(): boolean;
    block(): void;
  }
}
