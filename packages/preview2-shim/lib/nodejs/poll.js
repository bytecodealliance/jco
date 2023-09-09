/** @type { PollablePromise[] } */
let polls = [];
let pollCnt = 1;

let timer = null, timerInterval = 10, watching = new Set();
function intervalCheck () {
  console.warn("TEST_6");
  for (const entry of watching) {
    if (entry.settled) {
      console.warn("TEST_9");
      entry.resolvePromise();
      entry.promise = entry.resolvePromise = null;
      watching.delete(entry);
    }
  }
  if (watching.size === 0) {
    console.warn("TEST_16");
    clearInterval(timer);
    timer = null;
  }
}

export function _createPollable (executor) {
  console.warn("TEST_23");
  // const entry = { settled: false, promise: null, resolvePromise: null, resolvedValue: undefined };
  // polls[pollCnt] = entry;
  // entry.promise = promise().then((value) => {
  //   console.warn("TEST_27");
  //   entry.resolvedValue = value;
  //   return Promise.resolve(value);
  // }).finally(() => {
  //   console.warn("TEST_32");
  //   entry.settled = true
  // });
  polls[pollCnt] = new PollablePromise(executor);
  console.warn("TEST_35");
  return pollCnt++;
}

export function _pollablePromise (pollable, maxInterval) {
  console.warn("TEST_28");
  const entry = polls[pollable];
  if (entry.settled) return Promise.resolve();
  watching.add(entry);
  entry.timeout = maxInterval;
  console.warn("TEST_43");
  return entry;
}

export const poll = {
  dropPollable (pollable) {
    const entry = polls[pollable];
    watching.delete(entry);
    delete polls[pollable];
  },
  pollOneoff (from) {
    console.warn("pollOneoff: ", from);
    const result = [];
    Promise.all(from.map(id => {
      const pollable = _pollablePromise(id, 1000);
      pollable.execute();
    }));
    for (const id of from) {
      const pollable = polls[id];
      let counter = 0;
      while (!pollable.settled && counter < 5) {//pollable.state === TimeoutPromiseStateEnum.PENDING) {
        console.warn(pollable.value);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
        counter++;
      }
      console.warn(pollable.value);
      result.push(pollable.settled);
    }
    return result;
  },
  // async pollOneoffAsync (from) {
  //   console.warn("pollOneoffAsync: ", from);
  //   const result = [];
  //   try {
  //     for (const id of from) {
  //       const { settled } = polls[id];
  //       if (!settled) {
  //         const promise = polls[id].promise;
  //         let value = await promise; // _pollablePromise(id, 5)
  //         console.warn(value);
  //       }
  //       result.push(settled);
  //     }
  //   } catch (err) {
  //     console.error(err);
  //   }

  //   return result;
  // }
};

/**
 * Extended native promise with timeout capability.
 * <p>Executor function can be provided and executed in constructor
 * or later with {@link TimeoutPromise#execute execute()}.</p>
 * <p>It can be fulfilled with {@link TimeoutPromise#resolve resolve()} or
 * rejected with {@link TimeoutPromise#reject reject()} outside of executor.</p>
 * <p>You can specify timeout and promise will be rejected after specified
 * period of time if it has not been resolved or rejected.
 * Note that provided timeout is not exact and real execution time
 * depends on list of events in event loop.</p>
 *
 * @extends Promise
 */
// @ts-ignore
export class PollablePromise extends Promise {
  /** @type {Function} */
  #executor;
  /** @type {Function} */
  #resolve;
  /** @type {Function} */
  #reject;
  /** @type {TimeoutPromiseStateEnum} */
  #state;
  /** @type {number} */
  #timeout;
  // here will be stored either resolve value or reject reason
  /** @type {*} */
  #result;
  // handler for timeout
  #timeoutHandler;

  /**
   * Creates new extended promise.
   * Executor function that will be executed when requested.
   * If timeout is set then starts timer which will reject this promise
   * when time runs out.
   *
   * @param {Function} executor - function executed by constructor
   */
  // @ts-ignore
  constructor(executor) {
    if (
      executor !== undefined &&
      executor !== null &&
      typeof executor !== "function"
    ) {
      throw new TypeError("executor is not a function");
    }

    let res;
    let rej;
    super((...functions) => {
      [res, rej] = functions;
    });
    this.#resolve = res;
    this.#reject = rej;
    this.#state = TimeoutPromiseStateEnum.READY;

    this.#timeout = 0;

    this.#executor = executor;
  }

  /**
   * Set promise timeout.
   * @type {number} 
   * @param {number} value number of milliseconds to wait before rejecting promise.
   *    0 - wait indefinitely for promise resolution
   */
  set timeout(value) {
    if (
      typeof value !== "number" ||
      value < 0
    ) {
      throw new TypeError("timeout must be non-negative number");
    }
    if (value > 0) {
      this.#timeoutHandler = setTimeout(
        () => {
          this.#timeoutHandler = undefined;
          if (!this.settled) {
            this.reject(new Error("Promise timeout expired"));
          }
        },
        value,
      );
    }
    this.#timeout = value;
  }

  /**
   * State of promise.
   *
   * @readonly
   * @type {TimeoutPromiseStateEnum}
   */
  get state() {
    return this.#state;
  }

  /**
   * Returns true if promise is settled:
   * either {@link TimeoutPromiseStateEnum.FULFILLED FULFILLED} or
   * {@link TimeoutPromiseStateEnum.REJECTED REJECTED}
   *
   * @readonly
   * @type {boolean}
   */
  get settled() {
    return this.#state === TimeoutPromiseStateEnum.FULFILLED ||
      this.#state === TimeoutPromiseStateEnum.REJECTED;
  }

  /**
   * Value promise was fulfilled with.
   *
   * @readonly
   * @type {*}
   */
  get value() {
    if (this.#state === TimeoutPromiseStateEnum.FULFILLED) {
      return this.#result;
    }
    return undefined;
  }

  /**
   * Error promise was rejected with.
   *
   * @readonly
   * @type {*}
   */
  get error() {
    if (this.#state === TimeoutPromiseStateEnum.REJECTED) {
      return this.#result;
    }
    return undefined;
  }

  /**
   * Executes provided function to decide promise outcome and changes
   * this promise {@link TimeoutPromise#state state} to {@link TimeoutPromiseStateEnum.PENDING PENDING}.
   * Provided function is executed only if this promise {@link TimeoutPromise#state state}
   * is {@link TimeoutPromiseStateEnum.READY READY}.
   *
   * @returns {Promise} reference to this promise for chaining
   */
  execute() {
    if (this.#state === TimeoutPromiseStateEnum.READY) {
      this.#state = TimeoutPromiseStateEnum.PENDING;
      try {
        this.#executor(this.resolve.bind(this), this.reject.bind(this));
      } catch (err) {
        this.reject(err);
      }
    }
    return this;
  }

  /**
   * Resolves this promise only if it's {@link TimeoutPromise#state state} is
   * {@link TimeoutPromiseStateEnum.READY READY} or
   * {@link TimeoutPromiseStateEnum.PENDING PENDING}.
   * If resolve value is instance of Promise - locks-in on that promise outcome
   * This promise {@link TimeoutPromise#state state} is set
   * {@link TimeoutPromiseStateEnum.LOCKED LOCKED}.
   *
   * @param {*} [value] - value to fulfill this promise
   */
  resolve(value) {
    if (
      this.#state === TimeoutPromiseStateEnum.READY ||
      this.#state === TimeoutPromiseStateEnum.PENDING
    ) {
      if (value && typeof value.then === "function") {
        // if resolving to thenable - lock in on provided thenable
        this.#state = TimeoutPromiseStateEnum.LOCKED;
        try {
          value.then(
            (value) => {
              this.#clearTimeout();
              if (!this.settled) {
                this.#result = value;
                this.#state = TimeoutPromiseStateEnum.FULFILLED;
                this.#resolve(value);
              }
            },
            (err) => {
              this.#clearTimeout();
              if (!this.settled) {
                this.#result = err;
                this.#state = TimeoutPromiseStateEnum.REJECTED;
                this.#reject(err);
              }
            },
          );
        } catch (err) {
          // error thrown in then function is treated as rejection
          this.#clearTimeout();
          this.#result = err;
          this.#state = TimeoutPromiseStateEnum.REJECTED;
          this.#reject(err);
        }
      } else {
        // value is other than thenable - resolve promise with it
        this.#clearTimeout();
        this.#result = value;
        this.#state = TimeoutPromiseStateEnum.FULFILLED;
        this.#resolve(value);
      }
    }
  }

  /**
   * Rejects this promise only if it's {@link TimeoutPromise#state state} is either
   * {@link TimeoutPromiseStateEnum.READY READY} or
   * {@link TimeoutPromiseStateEnum.PENDING PENDING} or
   * {@link TimeoutPromiseStateEnum.LOCKED LOCKED}.
   *
   * @param {*} [err] - error to reject this promise
   */
  reject(err) {
    this.#clearTimeout();
    if (!this.settled) {
      this.#result = err;
      this.#state = TimeoutPromiseStateEnum.REJECTED;
      this.#reject(err);
    }
  }

  // clears timeout if it is running
  #clearTimeout() {
    if (this.#timeoutHandler) {
      clearTimeout(this.#timeoutHandler);
      this.#timeoutHandler = undefined;
    }
  }

  /**
   * String for creatating default string description for an object.
   *
   * @type {string}
   * @readonly
   */
  get [Symbol.toStringTag]() {
    return "TimeoutPromise";
  }

  /**
   * Returns class should be used to create
   * derived objects for then/catch/finally.
   *
   * @type {Function}
   * @readonly
   */
  static get [Symbol.species]() {
    return Promise;
  }
}

/**
 * List of possible extended promise states.
 *
 * @namespace
 * @readonly
 * @enum {string}
 */
export const TimeoutPromiseStateEnum = Object.freeze({
  /**
   * Ready state: executor function has not been executed yet.
   * @memberof TimeoutPromiseStateEnum
   */
  READY: "READY",

  /**
   * Pending state: executor function has already been executed but
   * neither {@link TimeoutPromise#resolve resolve()} nor {@link TimeoutPromise#reject reject()}
   * has been called yet.
   * @memberof TimeoutPromiseStateEnum
   */
  PENDING: "PENDING",

  /**
   * Locked-in state: {@link TimeoutPromise#resolve resolve()} has been called with thenable
   * and waiting for that thenable to resolve.
   *
   * @memberof TimeoutPromiseStateEnum
   */
  LOCKED: "LOCKED",

  /**
   * Fulfilled state: promise has been resolved.
   * @memberof TimeoutPromiseStateEnum
   */
  FULFILLED: "FULFILLED",

  /**
   * Rejected state: promise has been rejected.
   * @memberof TimeoutPromiseStateEnum
   */
  REJECTED: "REJECTED",
});
