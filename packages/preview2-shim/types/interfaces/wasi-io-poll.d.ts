export namespace WasiIoPoll {
  export { Pollable };
  /**
   * Poll for completion on a set of pollables.
   * 
   * This function takes a list of pollables, which identify I/O sources of
   * interest, and waits until one or more of the events is ready for I/O.
   * 
   * The result `list<u32>` contains one or more indices of handles in the
   * argument list that is ready for I/O.
   * 
   * If the list contains more elements than can be indexed with a `u32`
   * value, this function traps.
   * 
   * A timeout can be implemented by adding a pollable from the
   * wasi-clocks API to the list.
   * 
   * This function does not return a `result`; polling in itself does not
   * do any I/O so it doesn't fail. If any of the I/O sources identified by
   * the pollables has an error, it is indicated by marking the source as
   * being reaedy for I/O.
   */
  export function poll(in_: Pollable[]): Uint32Array;
}

export class Pollable {
  /**
  * Return the readiness of a pollable. This function never blocks.
  * 
  * Returns `true` when the pollable is ready, and `false` otherwise.
  */
  ready(): boolean;
  /**
  * `block` returns immediately if the pollable is ready, and otherwise
  * blocks until ready.
  * 
  * This function is equivalent to calling `poll.poll` on a list
  * containing only this pollable.
  */
  block(): void;
}
