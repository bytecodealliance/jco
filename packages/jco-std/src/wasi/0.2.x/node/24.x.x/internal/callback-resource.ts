/** Serialize entry into one component's callback exports, including resource drops. */
export function createCallbackQueue() {
  let pending = Promise.resolve();
  return function enqueue<T>(call: () => T | Promise<T>): Promise<T> {
    const result = pending.then(call);
    pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

/** Redeem a guest registration once and retain its exported resource until close. */
export class CallbackResource<T extends Disposable> {
  #resource: T | undefined;

  constructor(
    readonly take: () => T | undefined | Promise<T | undefined>,
    readonly missingCode: string,
  ) {}

  // The provider must call get and the retired destructor through its component's callback queue.
  async get(): Promise<T> {
    this.#resource ??= await this.take();
    if (!this.#resource) {
      throw Object.assign(new Error("Callback registration is not active"), {
        code: this.missingCode,
      });
    }
    return this.#resource;
  }

  retire(): () => Promise<void> {
    const resource = this.#resource;
    this.#resource = undefined;
    return async () => {
      await resource?.[Symbol.dispose]();
    };
  }
}

/** Let an imported close return to the guest before entering an exported destructor. */
export function retireCallbacks(
  enqueue: ReturnType<typeof createCallbackQueue>,
  ...resources: CallbackResource<Disposable>[]
): void {
  const drops = resources.map((resource) => resource.retire());
  setTimeout(() => {
    void enqueue(async () => {
      for (const drop of drops) {
        await drop();
      }
    });
  }, 0);
}
