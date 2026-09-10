/** The subset of tr46@5.1.1 used by whatwg-url@14.2.0's host parser. */
export interface IDNA {
  toASCII(domain: string, options?: Record<string, unknown>): string | null;
}

/**
 * StarlingMonkey omits String.normalize but supplies an Ada-backed native URL.
 * Reuse that native host parser for UTS46/NFC instead of shipping an outdated
 * normalization table. QuickJS has normalize and uses the audited tr46 core.
 * This factory runs before Jco installs its public URL globals.
 */
export function createIDNA(fallback: IDNA): IDNA {
  if (typeof String.prototype.normalize === "function") {
    return fallback;
  }
  const NativeURL = globalThis.URL;
  if (typeof NativeURL !== "function") {
    throw new Error("node:url requires String.normalize or a native WHATWG URL host parser");
  }
  return {
    toASCII(domain: string): string | null {
      // The caller expects a domain, not a complete URL. Delimiters must never
      // become credentials, a port, path or query in the native parser.
      if (/[\u0000-\u0020\u007f%#/:<>?@[\\\]^|]/.test(domain)) {
        return null;
      }
      try {
        return new NativeURL(`http://${domain}`).hostname;
      } catch {
        return null;
      }
    },
  };
}
