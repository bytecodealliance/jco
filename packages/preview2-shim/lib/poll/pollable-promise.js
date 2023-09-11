// Based on:
// 
/**
 * Extended native promise with timeout capability.
 * <p>Executor function can be provided and executed in constructor
 * or later with {@link PollablePromise#execute execute()}.</p>
 * <p>It can be fulfilled with {@link PollablePromise#resolve resolve()} or
 * rejected with {@link PollablePromise#reject reject()} outside of executor.</p>
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
  /** @type {PollablePromiseStateEnum} */
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
    this.#state = PollablePromiseStateEnum.READY;

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
   * Timeout of promise.
   *
   * @readonly
   * @type {number}
   */
    get timeout() {
      return this.#timeout;
    }

  /**
   * State of promise.
   *
   * @readonly
   * @type {PollablePromiseStateEnum}
   */
  get state() {
    return this.#state;
  }

  /**
   * Returns true if promise is settled:
   * either {@link PollablePromiseStateEnum.FULFILLED FULFILLED} or
   * {@link PollablePromiseStateEnum.REJECTED REJECTED}
   *
   * @readonly
   * @type {boolean}
   */
  get settled() {
    return this.#state === PollablePromiseStateEnum.FULFILLED ||
      this.#state === PollablePromiseStateEnum.REJECTED;
  }

  /**
   * Value promise was fulfilled with.
   *
   * @readonly
   * @type {*}
   */
  get value() {
    if (this.#state === PollablePromiseStateEnum.FULFILLED) {
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
    if (this.#state === PollablePromiseStateEnum.REJECTED) {
      return this.#result;
    }
    return undefined;
  }

  /**
   * Executes provided function to decide promise outcome and changes
   * this promise {@link PollablePromise#state state} to {@link PollablePromiseStateEnum.PENDING PENDING}.
   * Provided function is executed only if this promise {@link PollablePromise#state state}
   * is {@link PollablePromiseStateEnum.READY READY}.
   *
   * @returns {Promise} reference to this promise for chaining
   */
  execute() {
    if (this.#state === PollablePromiseStateEnum.READY) {
      this.#state = PollablePromiseStateEnum.PENDING;
      try {
        this.#executor(this.resolve.bind(this), this.reject.bind(this));
      } catch (err) {
        this.reject(err);
      }
    }
    return this;
  }

  /**
   * Resolves this promise only if it's {@link PollablePromise#state state} is
   * {@link PollablePromiseStateEnum.READY READY} or
   * {@link PollablePromiseStateEnum.PENDING PENDING}.
   * If resolve value is instance of Promise - locks-in on that promise outcome
   * This promise {@link PollablePromise#state state} is set
   * {@link PollablePromiseStateEnum.LOCKED LOCKED}.
   *
   * @param {*} [value] - value to fulfill this promise
   */
  resolve(value) {
    if (
      this.#state === PollablePromiseStateEnum.READY ||
      this.#state === PollablePromiseStateEnum.PENDING
    ) {
      if (value && typeof value.then === "function") {
        // if resolving to thenable - lock in on provided thenable
        this.#state = PollablePromiseStateEnum.LOCKED;
        try {
          value.then(
            (value) => {
              this.#clearTimeout();
              if (!this.settled) {
                this.#result = value;
                this.#state = PollablePromiseStateEnum.FULFILLED;
                this.#resolve(value);
              }
            },
            (err) => {
              this.#clearTimeout();
              if (!this.settled) {
                this.#result = err;
                this.#state = PollablePromiseStateEnum.REJECTED;
                this.#reject(err);
              }
            },
          );
        } catch (err) {
          // error thrown in then function is treated as rejection
          this.#clearTimeout();
          this.#result = err;
          this.#state = PollablePromiseStateEnum.REJECTED;
          this.#reject(err);
        }
      } else {
        // value is other than thenable - resolve promise with it
        this.#clearTimeout();
        this.#result = value;
        this.#state = PollablePromiseStateEnum.FULFILLED;
        this.#resolve(value);
      }
    }
  }

  /**
   * Rejects this promise only if it's {@link PollablePromise#state state} is either
   * {@link PollablePromiseStateEnum.READY READY} or
   * {@link PollablePromiseStateEnum.PENDING PENDING} or
   * {@link PollablePromiseStateEnum.LOCKED LOCKED}.
   *
   * @param {*} [err] - error to reject this promise
   */
  reject(err) {
    this.#clearTimeout();
    if (!this.settled) {
      this.#result = err;
      this.#state = PollablePromiseStateEnum.REJECTED;
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
    return "PollablePromise";
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
export const PollablePromiseStateEnum = Object.freeze({
  /**
   * Ready state: executor function has not been executed yet.
   * @memberof PollablePromiseStateEnum
   */
  READY: "READY",

  /**
   * Pending state: executor function has already been executed but
   * neither {@link PollablePromise#resolve resolve()} nor {@link PollablePromise#reject reject()}
   * has been called yet.
   * @memberof PollablePromiseStateEnum
   */
  PENDING: "PENDING",

  /**
   * Locked-in state: {@link PollablePromise#resolve resolve()} has been called with thenable
   * and waiting for that thenable to resolve.
   *
   * @memberof PollablePromiseStateEnum
   */
  LOCKED: "LOCKED",

  /**
   * Fulfilled state: promise has been resolved.
   * @memberof PollablePromiseStateEnum
   */
  FULFILLED: "FULFILLED",

  /**
   * Rejected state: promise has been rejected.
   * @memberof PollablePromiseStateEnum
   */
  REJECTED: "REJECTED",
});
