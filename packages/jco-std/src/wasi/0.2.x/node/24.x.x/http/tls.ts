/**
 * Normalizes Node's TLS options into the material the WIT boundary carries.
 *
 * The accepted option shapes follow nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/_tls_common.js `configSecureContext`,
 * lib/_tls_wrap.js, and doc/api/tls.md (MIT license). Only the serializable subset crosses the
 * boundary: PEM/DER/PFX blobs, strings, booleans, and ALPN protocol names. Options that install
 * a callback, hand over an opaque host handle, or name an OpenSSL engine have no representation
 * in a typed WIT record and are refused by name instead of being silently dropped. Options the
 * record does not carry at all are ignored, exactly as `http.createServer` ignores keys it does
 * not know.
 *
 * Every material field stays a list. Node accepts arrays for `key`, `cert`, `pfx`, `ca`, and
 * `crl`, and OpenSSL reads only the first key from a concatenated PEM, so joining a `key`
 * bundle into one blob would silently drop every key after the first.
 */

import { invalidArgType, outOfRange, unsupported } from "./errors.js";
import type { HttpTlsMaterial, HttpTlsOptions, TlsMaterial } from "./types.js";

const CALLBACK = "a callback cannot be retained across the WIT boundary";
const ENGINE = "OpenSSL engines are not addressable from a component";

/** TLS options that cannot cross a typed WIT boundary, mapped to the reason they cannot. */
const UNREPRESENTABLE_TLS_OPTIONS: Readonly<Record<string, string>> = {
  ALPNCallback: CALLBACK,
  SNICallback: CALLBACK,
  checkServerIdentity: CALLBACK,
  pskCallback: CALLBACK,
  secureContext: "a prebuilt SecureContext is an opaque host handle",
  session: "a TLS session is bound to the implementation's own connections",
  ticketKeys: "TLS ticket keys are owned by the implementation",
  clientCertEngine: ENGINE,
  privateKeyEngine: ENGINE,
  privateKeyIdentifier: ENGINE,
};

const encoder = new TextEncoder();

function isMaterial(value: unknown): value is TlsMaterial {
  return typeof value === "string" || ArrayBuffer.isView(value) || value instanceof ArrayBuffer;
}

function bytes(name: string, value: unknown): Uint8Array {
  if (typeof value === "string") {
    return encoder.encode(value);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value.slice(0));
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    );
  }
  throw invalidArgType(name, "string, Buffer, TypedArray, DataView, or ArrayBuffer", value);
}

/**
 * Reads a material option that Node accepts either as one blob or as an array of blobs.
 *
 * Object entries (`{ pem, passphrase }` for keys, `{ buf, passphrase }` for PFX bundles) carry
 * a per-entry passphrase the WIT record has no field for, so they are refused rather than
 * losing the passphrase.
 */
function materialList(api: string, name: string, value: unknown): Uint8Array[] {
  if (Array.isArray(value)) {
    return (value as unknown[]).map((entry, index) => {
      if (typeof entry === "object" && entry !== null && !isMaterial(entry)) {
        throw unsupported(
          `${api} ${name}[${index}]`,
          "only string, Buffer, TypedArray, DataView, and ArrayBuffer entries can cross the WIT boundary",
        );
      }
      return bytes(`${name}[${index}]`, entry);
    });
  }
  return [bytes(name, value)];
}

function string(name: string, value: unknown): string {
  if (typeof value !== "string") {
    throw invalidArgType(name, "string", value);
  }
  return value;
}

function boolean(name: string, value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw invalidArgType(name, "boolean", value);
  }
  return value;
}

function uint32(name: string, value: unknown): number {
  if (typeof value !== "number") {
    throw invalidArgType(name, "number", value);
  }
  if (!Number.isInteger(value) || value < 0 || value > 0xff_ff_ff_ff) {
    throw outOfRange(name, ">= 0 && <= 4294967295", value);
  }
  return value;
}

function alpnProtocols(value: unknown): string[] {
  if (Array.isArray(value)) {
    return (value as unknown[]).map((entry, index) => string(`ALPNProtocols[${index}]`, entry));
  }
  if (!isMaterial(value)) {
    throw invalidArgType("ALPNProtocols", "Array, Buffer, TypedArray, or DataView", value);
  }
  // Node also accepts the wire encoding: length-prefixed protocol names.
  const wire = bytes("ALPNProtocols", value);
  const protocols: string[] = [];
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset < wire.byteLength) {
    const length = wire[offset];
    offset += 1;
    if (length === 0 || offset + length > wire.byteLength) {
      throw invalidArgType("ALPNProtocols", "a valid ALPN protocol list", value);
    }
    protocols.push(decoder.decode(wire.subarray(offset, offset + length)));
    offset += length;
  }
  return protocols;
}

/**
 * Extracts the TLS material from `https.createServer` or `https.request` options.
 *
 * `api` labels refusals, e.g. `https.request option`. Returns `undefined` when no carried option
 * is present at all so callers can tell "no TLS configuration" from an empty one.
 */
export function tlsMaterial(options: HttpTlsOptions, api: string): HttpTlsMaterial | undefined {
  const bag = options as Record<string, unknown>;
  for (const [name, reason] of Object.entries(UNREPRESENTABLE_TLS_OPTIONS)) {
    if (bag[name] !== undefined) {
      unsupported(`${api} ${name}`, reason);
    }
  }
  const material: HttpTlsMaterial = {};
  const read = <K extends keyof HttpTlsMaterial>(
    name: string,
    key: K,
    convert: (value: unknown) => HttpTlsMaterial[K],
  ): void => {
    if (bag[name] !== undefined) {
      material[key] = convert(bag[name]);
    }
  };
  read("key", "key", (value) => materialList(api, "key", value));
  read("cert", "cert", (value) => materialList(api, "cert", value));
  read("pfx", "pfx", (value) => materialList(api, "pfx", value));
  read("passphrase", "passphrase", (value) => string("passphrase", value));
  read("ca", "ca", (value) => materialList(api, "ca", value));
  read("crl", "crl", (value) => materialList(api, "crl", value));
  read("dhparam", "dhparam", (value) => bytes("dhparam", value));
  read("ciphers", "ciphers", (value) => string("ciphers", value));
  read("ecdhCurve", "ecdhCurve", (value) => string("ecdhCurve", value));
  read("sigalgs", "sigalgs", (value) => string("sigalgs", value));
  read("minVersion", "minVersion", (value) => string("minVersion", value));
  read("maxVersion", "maxVersion", (value) => string("maxVersion", value));
  read("secureProtocol", "secureProtocol", (value) => string("secureProtocol", value));
  read("secureOptions", "secureOptions", (value) => uint32("secureOptions", value));
  read("sessionIdContext", "sessionIdContext", (value) => string("sessionIdContext", value));
  read("honorCipherOrder", "honorCipherOrder", (value) => boolean("honorCipherOrder", value));
  read("ALPNProtocols", "alpnProtocols", alpnProtocols);
  read("servername", "servername", (value) => string("servername", value));
  read("rejectUnauthorized", "rejectUnauthorized", (value) => boolean("rejectUnauthorized", value));
  read("requestCert", "requestCert", (value) => boolean("requestCert", value));
  return Object.keys(material).length > 0 ? material : undefined;
}
