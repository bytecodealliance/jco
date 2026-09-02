/**
 * The host-side binding for `jco:node/http-callbacks`.
 *
 * `jco:node/http` borrows the `request-listener` resource from `jco:node/http-callbacks`,
 * which the guest exports: the guest hands the host a listener, and the host calls back into
 * it for each request. Because the type is *used* by an imported interface, a transpiled
 * component still needs an import binding for it -- somewhere to hang the handle when the
 * host passes one of those listeners back across the boundary.
 *
 * That binding is all this is. The listener's behavior lives in the guest, so there is
 * nothing here to implement: constructing one on the host side would mean the host inventing
 * a guest callback, which is why doing so is refused rather than quietly producing an object
 * that answers no calls.
 */

/** Error code carried by every unsupported-API failure Jco raises for Node builtins. */
const UNSUPPORTED_CODE = "ERR_JCO_UNSUPPORTED_NODE_API";

/**
 * The `request-listener` resource, as the host sees it.
 *
 * Instances are created by the component bindings from a handle the guest owns, never by
 * calling this constructor.
 */
export class RequestListener {
  constructor() {
    const error = new Error(
      "jco:node/http-callbacks request-listener is exported by the guest and cannot be constructed by the host",
    ) as Error & { code: string };
    error.code = UNSUPPORTED_CODE;
    throw error;
  }
}

export default { RequestListener };
