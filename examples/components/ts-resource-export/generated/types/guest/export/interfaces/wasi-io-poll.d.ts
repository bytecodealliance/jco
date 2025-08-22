declare module 'wasi:io/poll@0.2.7' {
  export function poll(in_: Array<Pollable>): Uint32Array;
  
  export class Pollable implements Disposable {
    /**
     * This type does not have a public constructor.
     */
    private constructor();
    ready(): boolean;
    block(): void;
    [Symbol.dispose](): void;
  }
}
