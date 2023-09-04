export namespace WasiPollPoll {
  export { Pollable };
  /**
   * Poll for completion on a set of pollables.
   * 
   * This function takes a list of pollables, which identify I/O sources of
   * interest, and waits until one or more of the events is ready for I/O.
   * 
   * The result `list<bool>` is the same length as the argument
   * `list<pollable>`, and indicates the readiness of each corresponding
   * element in that list, with true indicating ready. A single call can
   * return multiple true elements.
   * 
   * A timeout can be implemented by adding a pollable from the
   * wasi-clocks API to the list.
   * 
   * This function does not return a `result`; polling in itself does not
   * do any I/O so it doesn't fail. If any of the I/O sources identified by
   * the pollables has an error, it is indicated by marking the source as
   * ready in the `list<bool>`.
   * 
   * The "oneoff" in the name refers to the fact that this function must do a
   * linear scan through the entire list of subscriptions, which may be
   * inefficient if the number is large and the same subscriptions are used
   * many times. In the future, this is expected to be obsoleted by the
   * component model async proposal, which will include a scalable waiting
   * facility.
   */
  export function pollOneoff(in_: Pollable[]): boolean[];
}

export class Pollable {
  constructor(init: Uint8Array)
  write(bytes: Uint8Array): void;
  read(n: number): Uint8Array | ArrayBuffer;
  static merge(lhs: Pollable, rhs: Pollable): Pollable;
}
