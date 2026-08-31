/**
 * `node:domain`, which Jco deliberately does not implement.
 *
 * The module is Stability 0 -- deprecated in its entirety, not in parts -- and its whole purpose is
 * routing errors across asynchronous boundaries, which a component cannot do anyway (see
 * `async-hooks.ts`). Implementing it would mean shipping something both obsolete and unfaithful.
 *
 * It still resolves rather than failing as an unknown import, so the failure names the reason and a
 * way forward instead of reading `Could not resolve 'node:domain'`. Importing is fine; every *use*
 * throws.
 */

/** Error code carried by APIs Node itself has deprecated, which Jco declines to implement. */
export const DEPRECATED_CODE = "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API";

/**
 * Refuse a use of the module.
 *
 * @param api - the entry point being used, as a user would write it
 */
function deprecated(api: string): Error & { code: string } {
  const error = new Error(
    `${api} is not supported: node:domain is deprecated in Node.js and not implemented by Jco. ` +
      "Use AsyncLocalStorage from node:async_hooks to carry context, and handle errors where they " +
      "occur; note Jco's AsyncLocalStorage is scoped synchronously.",
  ) as Error & { code: string };
  error.code = DEPRECATED_CODE;
  return error;
}

/**
 * Node's `Domain` class.
 *
 * Constructing one throws: there is no instance whose methods could behave correctly, so failing at
 * construction points at the line that needs changing rather than at a later method call.
 */
export class Domain {
  constructor() {
    throw deprecated("new Domain()");
  }
}

export function create(): never {
  throw deprecated("domain.create()");
}

export function createDomain(): never {
  throw deprecated("domain.createDomain()");
}

/**
 * The module object, matching what `require("node:domain")` yields.
 *
 * `active` and `_stack` are getters so reading them throws: there is no honest value to return,
 * and `null` would suggest the module works and is merely inactive. They exist only here, not as
 * named exports -- an ES module binding cannot throw on read, so `import { active }` would have to
 * hand back a real value. That import fails at build time instead, which is still a loud failure in
 * the right place.
 */
const domainModule = {
  Domain,
  create,
  createDomain,
  get active(): never {
    throw deprecated("domain.active");
  },
  get _stack(): never {
    throw deprecated("domain._stack");
  },
};

export default domainModule;
