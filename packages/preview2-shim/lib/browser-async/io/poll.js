// wasi:io/poll@0.2.0 interface

// Pollable represents a single I/O event which may be ready, or not.
export class Pollable {
  #ready = false;
  #promise;

  /**
   * Sets the pollable to ready whether the promise is resolved or
   * rejected.
   *
   * @param {Promise|undefined|null} promise
   */
  constructor(promise) {
    const setReady = () => {
      this.#ready = true;
    };
    this.#promise = (promise || Promise.resolve()).then(setReady, setReady);
  }

  /**
   * Return the readiness of a pollable. This function never blocks.
   *
   * Returns `true` when the pollable is ready, and `false` otherwise.
   *
   * @returns {boolean}
   */
  ready() {
    return this.#ready;
  }

  /**
   * Returns immediately if the pollable is ready, and otherwise blocks
   * until ready.
   * 
   * This function is equivalent to calling `poll.poll` on a list
   * containing only this pollable.
   */
  async block() {
    await this.#promise;
  }
}

/**
 * Poll for completion on a set of pollables.
 * 
 * This function takes a list of pollables, which identify I/O
 * sources of interest, and waits until one or more of the events
 * is ready for I/O.
 * 
 * The result list<u32> contains one or more indices of handles
 * in the argument list that is ready for I/O.
 *
 * @param {Array<Pollable>} inList
 * @returns {Promise<Uint32Array>}
 */
export const poll = async (inList) => {
  if (inList.length === 1) {
    // handle this common case faster
    await inList[0].block();
    return new Uint32Array(1); // zero initialized of length 1
  }

  // wait until at least one is ready
  await Promise.race(inList.map((pollable) => pollable.block()));

  // allocate a Uint32Array list as if all are ready
  const ready = new Uint32Array(inList.length);
  let pos = 0;
  for (let i = 0; i < inList.length; i++) {
    if (inList[i].ready()) {
      ready[pos] = i;
      pos++;
    }
  }

  return ready.subarray(0, pos);
};
