/** Node 24 URL module assembled over portable WHATWG cores and lazy WASI paths. */
import { createPath, type PathProviders } from "./path.js";
import { URL, URLPattern, URLSearchParams as CoreSearchParams } from "./url/whatwg.js";
import { adaptSearchParams } from "./url/search-params.js";
import { domainToASCII, domainToUnicode } from "./url/domain.js";
import { createPathToFileURL, fileURLToPath, fileURLToPathBuffer } from "./url/file.js";
import { format } from "./url/format.js";
import { Url as PortableUrl, parse, resolve, resolveObject } from "./url/legacy.js";
import type { LegacyUrl, UrlObject } from "./url/types.js";
import { urlToHttpOptions } from "./url/http-options.js";

export type * from "./url/types.js";
export interface UrlModule {
  Url: typeof PortableUrl;
  parse: (
    url: string | LegacyUrl,
    parseQueryString?: boolean,
    slashesDenoteHost?: boolean,
  ) => LegacyUrl;
  resolve: (from: string, to: string) => string;
  resolveObject: (from: string | UrlObject, to: string | UrlObject) => LegacyUrl;
  format: typeof format;
  URL: typeof URL;
  URLPattern: typeof URLPattern;
  URLSearchParams: typeof globalThis.URLSearchParams;
  domainToASCII: typeof domainToASCII;
  domainToUnicode: typeof domainToUnicode;
  pathToFileURL: ReturnType<typeof createPathToFileURL>;
  fileURLToPath: typeof fileURLToPath;
  fileURLToPathBuffer: typeof fileURLToPathBuffer;
  urlToHttpOptions: typeof urlToHttpOptions;
}
const URLSearchParams = adaptSearchParams(CoreSearchParams);
Object.defineProperty(URLSearchParams.prototype, "constructor", {
  value: URLSearchParams,
  writable: true,
  configurable: true,
});

export function createUrl(providers: PathProviders, legacy?: Pick<UrlModule, "Url">): UrlModule {
  let Url = PortableUrl;
  let parseLegacy: UrlModule["parse"] = (input, parseQueryString, slashesDenoteHost) =>
    parse(input as string, parseQueryString, slashesDenoteHost);
  let resolveLegacy: UrlModule["resolve"] = resolve;
  let resolveObjectLegacy: UrlModule["resolveObject"] = resolveObject;
  if (legacy) {
    // Keep Node's constructor field order and callable shape while using the
    // supplied legacy parser and prototype methods.
    Url = function Url(this: InstanceType<typeof PortableUrl>) {
      Object.assign(this, new PortableUrl());
    } as typeof PortableUrl;
    Url.prototype = Object.create(
      Object.getPrototypeOf(legacy.Url.prototype),
      Object.getOwnPropertyDescriptors(legacy.Url.prototype),
    );
    Object.defineProperty(Url, "name", { value: "Url", configurable: true });
    Object.defineProperty(Url.prototype, "constructor", {
      value: Url,
      writable: true,
      configurable: true,
    });
    // Call the parser directly: unenv's module wrapper emits a console warning,
    // which would make a pure URL operation depend on a host console grant.
    parseLegacy = (input, parseQueryString, slashesDenoteHost) => {
      if (input instanceof Url) {
        return input;
      }
      return new Url().parse(input as string, parseQueryString, slashesDenoteHost);
    };
    Url.prototype.resolve = function (relative) {
      return this.resolveObject(parseLegacy(relative, false, true)).format();
    };
    Url.prototype.resolveObject = function (relative) {
      return Object.assign(new Url(), legacy.Url.prototype.resolveObject.call(this, relative));
    };
    resolveLegacy = (from, to) => parseLegacy(from, false, true).resolve(to);
    resolveObjectLegacy = (from, to) =>
      !from ? (to as LegacyUrl) : parseLegacy(from as string, false, true).resolveObject(to);
  }
  return {
    Url,
    parse: parseLegacy,
    resolve: resolveLegacy,
    resolveObject: resolveObjectLegacy,
    format,
    URL,
    URLPattern,
    URLSearchParams,
    domainToASCII,
    domainToUnicode,
    pathToFileURL: createPathToFileURL(createPath(providers)),
    fileURLToPath,
    fileURLToPathBuffer,
    urlToHttpOptions,
  };
}
