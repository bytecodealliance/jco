export namespace WasiPollPoll {
  /**
   * Dispose of the specified `pollable`, after which it may no longer
   * be used.
   */
  export function dropPollable(this: Pollable): void;
  /**
   * Poll for completion on a set of pollables.
   * 
   * The "oneoff" in the name refers to the fact that this function must do a
   * linear scan through the entire list of subscriptions, which may be
   * inefficient if the number is large and the same subscriptions are used
   * many times. In the future, this is expected to be obsoleted by the
   * component model async proposal, which will include a scalable waiting
   * facility.
   * 
   * The result list<bool> is the same length as the argument
   * list<pollable>, and indicates the readiness of each corresponding
   * element in that / list, with true indicating ready.
   */
  export function pollOneoff(in: Uint32Array): boolean[];
}
/**
 * A "pollable" handle.
 * 
 * This is conceptually represents a `stream<_, _>`, or in other words,
 * a stream that one can wait on, repeatedly, but which does not itself
 * produce any data. It's temporary scaffolding until component-model's
 * async features are ready.
 * 
 * And at present, it is a `u32` instead of being an actual handle, until
 * the wit-bindgen implementation of handles and resources is ready.
 * 
 * `pollable` lifetimes are not automatically managed. Users must ensure
 * that they do not outlive the resource they reference.
 * 
 * This [represents a resource](https://github.com/WebAssembly/WASI/blob/main/docs/WitInWasi.md#Resources).
 */
export type Pollable = number;
