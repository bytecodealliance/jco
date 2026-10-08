/** Node 24 URL module assembled over portable WHATWG cores and lazy WASI paths. */
import { createPath, type PathProviders } from "./path.js";
import { URL, URLPattern, URLSearchParams as CoreSearchParams } from "./url/whatwg.js";
import { adaptSearchParams } from "./url/search-params.js";
import { domainToASCII, domainToUnicode } from "./url/domain.js";
import { createPathToFileURL, fileURLToPath, fileURLToPathBuffer } from "./url/file.js";
import { format } from "./url/format.js";
import { Url, parse, resolve, resolveObject } from "./url/legacy.js";
import { urlToHttpOptions } from "./url/http-options.js";

export type * from "./url/types.js";
export interface UrlModule {
  Url: typeof Url;
  parse: typeof parse;
  resolve: typeof resolve;
  resolveObject: typeof resolveObject;
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

export function createUrl(
  providers: PathProviders,
  legacy?: Pick<UrlModule, "Url" | "parse" | "resolve" | "resolveObject">,
): UrlModule {
  return {
    Url: legacy?.Url ?? Url,
    parse: legacy?.parse ?? parse,
    resolve: legacy?.resolve ?? resolve,
    resolveObject: legacy?.resolveObject ?? resolveObject,
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
