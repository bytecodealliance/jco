declare module 'wasi:io/poll@0.2.3' {
  export function poll(in_: Array<Pollable>): Uint32Array;
  
  export class Pollable implements Disposable {
    /**
     * Identifies the resource to the type checker. This member does not exist at runtime.
     */
    readonly $brand: 'wasi:io/poll@0.2#pollable';
    /**
     * This type does not have a public constructor.
     */
    private constructor();
    ready(): boolean;
    block(): void;
    [Symbol.dispose](): void;
  }
}
