declare module 'wasi:io/error@0.2.6' {
  
  export class Error implements Disposable {
    /**
     * Identifies the resource to the type checker. This member does not exist at runtime.
     */
    readonly $brand: 'wasi:io/error@0.2#error';
    /**
     * This type does not have a public constructor.
     */
    private constructor();
    toDebugString(): string;
    [Symbol.dispose](): void;
  }
}
