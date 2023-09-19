/**
 * Extended native promise with pollable capability.
 * <p>Executor function can be provided and executed in constructor
 * or later with {@link PollablePromise#execute execute()}.</p>
 * <p>It can be fulfilled with {@link PollablePromise#resolve resolve()} or
 * rejected with {@link PollablePromise#reject reject()} outside of executor.</p>
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
  // here will be stored either resolve value or reject reason
  /** @type {*} */
  #result;

  /**
   * Creates new extended promise.
   * Executor function that will be executed when requested.
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
    this.#state = PollablePromiseStateEnum.Ready;

    this.#executor = executor;
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
   * either {@link PollablePromiseStateEnum.Fulfilled FULFILLED} or
   * {@link PollablePromiseStateEnum.Rejected REJECTED}
   *
   * @readonly
   * @type {boolean}
   */
  get settled() {
    return this.#state === PollablePromiseStateEnum.Fulfilled ||
      this.#state === PollablePromiseStateEnum.Rejected;
  }

  /**
   * Value promise was fulfilled with.
   *
   * @readonly
   * @type {*}
   */
  get value() {
    if (this.#state === PollablePromiseStateEnum.Fulfilled) {
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
    if (this.#state === PollablePromiseStateEnum.Rejected) {
      return this.#result;
    }
    return undefined;
  }

  /**
   * Executes provided function to decide promise outcome and changes
   * this promise {@link PollablePromise#state state} to {@link PollablePromiseStateEnum.Pending PENDING}.
   * Provided function is executed only if this promise {@link PollablePromise#state state}
   * is {@link PollablePromiseStateEnum.Ready READY}.
   *
   * @returns {Promise} reference to this promise for chaining
   */
  execute() {
    if (this.#state === PollablePromiseStateEnum.Ready) {
      this.#state = PollablePromiseStateEnum.Pending;
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
   * {@link PollablePromiseStateEnum.Ready READY} or
   * {@link PollablePromiseStateEnum.Pending PENDING}.
   * If resolve value is instance of Promise - locks-in on that promise outcome
   * This promise {@link PollablePromise#state state} is set
   * {@link PollablePromiseStateEnum.Locked LOCKED}.
   *
   * @param {*} [value] - value to fulfill this promise
   */
  resolve(value) {
    if (
      this.#state === PollablePromiseStateEnum.Ready ||
      this.#state === PollablePromiseStateEnum.Pending
    ) {
      if (value && typeof value.then === "function") {
        // if resolving to thenable - lock in on provided thenable
        this.#state = PollablePromiseStateEnum.Locked;
        try {
          value.then(
            (value) => {
              if (!this.settled) {
                this.#result = value;
                this.#state = PollablePromiseStateEnum.Fulfilled;
                this.#resolve(value);
              }
            },
            (err) => {
              if (!this.settled) {
                this.#result = err;
                this.#state = PollablePromiseStateEnum.Rejected;
                this.#reject(err);
              }
            },
          );
        } catch (err) {
          // error thrown in then function is treated as rejection
          this.#result = err;
          this.#state = PollablePromiseStateEnum.Rejected;
          this.#reject(err);
        }
      } else {
        // value is other than thenable - resolve promise with it
        this.#result = value;
        this.#state = PollablePromiseStateEnum.Fulfilled;
        this.#resolve(value);
      }
    }
  }

  /**
   * Rejects this promise only if it's {@link PollablePromise#state state} is either
   * {@link PollablePromiseStateEnum.Ready READY} or
   * {@link PollablePromiseStateEnum.Pending PENDING} or
   * {@link PollablePromiseStateEnum.Locked LOCKED}.
   *
   * @param {*} [err] - error to reject this promise
   */
  reject(err) {
    if (!this.settled) {
      this.#result = err;
      this.#state = PollablePromiseStateEnum.Rejected;
      this.#reject(err);
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
  Ready: "READY",

  /**
   * Pending state: executor function has already been executed but
   * neither {@link PollablePromise#resolve resolve()} nor {@link PollablePromise#reject reject()}
   * has been called yet.
   * @memberof PollablePromiseStateEnum
   */
  Pending: "PENDING",

  /**
   * Locked-in state: {@link PollablePromise#resolve resolve()} has been called with thenable
   * and waiting for that thenable to resolve.
   *
   * @memberof PollablePromiseStateEnum
   */
  Locked: "LOCKED",

  /**
   * Fulfilled state: promise has been resolved.
   * @memberof PollablePromiseStateEnum
   */
  Fulfilled: "FULFILLED",

  /**
   * Rejected state: promise has been rejected.
   * @memberof PollablePromiseStateEnum
   */
  Rejected: "REJECTED",
});
