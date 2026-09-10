/** Self-contained public types for the Node 24 URL adapter. */
export interface FileUrlOptions {
  windows?: boolean;
}
export interface UrlFormatOptions {
  auth?: boolean;
  fragment?: boolean;
  search?: boolean;
  unicode?: boolean;
}
export type QueryValue = string | number | bigint | boolean | null | undefined;
export type UrlQuery = Record<
  string,
  QueryValue | readonly Exclude<QueryValue, null | undefined>[]
>;
export interface UrlObject {
  auth?: string | null;
  hash?: string | null;
  host?: string | null;
  hostname?: string | null;
  href?: string | null;
  pathname?: string | null;
  path?: string | null;
  protocol?: string | null;
  search?: string | null;
  slashes?: boolean | null;
  port?: string | number | null;
  query?: string | UrlQuery | null;
}
export interface LegacyUrl extends UrlObject {
  parse(url: string, parseQueryString?: boolean, slashesDenoteHost?: boolean): never;
  format(): string;
  resolve(relative: string): never;
  resolveObject(relative: string | UrlObject): LegacyUrl;
  parseHost(): void;
}
export interface LegacyUrlConstructor {
  new (): LegacyUrl;
  (this: LegacyUrl): void;
  prototype: LegacyUrl;
}
export interface UrlHttpOptions {
  protocol: string;
  hostname: string;
  hash: string;
  search: string;
  pathname: string;
  path: string;
  href: string;
  port?: number;
  auth?: string;
}
/** A Buffer is returned at runtime, sharing node:buffer's constructor. */
export interface UrlPathBuffer extends Uint8Array {
  toString(encoding?: string, start?: number, end?: number): string;
  equals(other: Uint8Array): boolean;
}
export interface UrlPatternInit {
  baseURL?: string;
  protocol?: string;
  username?: string;
  password?: string;
  hostname?: string;
  port?: string;
  pathname?: string;
  search?: string;
  hash?: string;
}
export type UrlPatternInput = string | UrlPatternInit;
export interface UrlPatternOptions {
  ignoreCase?: boolean;
}
export interface UrlPatternComponentResult {
  input: string;
  groups: Record<string, string | undefined>;
}
export interface UrlPatternResult {
  inputs: [UrlPatternInput, string?];
  protocol: UrlPatternComponentResult;
  username: UrlPatternComponentResult;
  password: UrlPatternComponentResult;
  hostname: UrlPatternComponentResult;
  port: UrlPatternComponentResult;
  pathname: UrlPatternComponentResult;
  search: UrlPatternComponentResult;
  hash: UrlPatternComponentResult;
}
export interface UrlPattern {
  readonly protocol: string;
  readonly username: string;
  readonly password: string;
  readonly hostname: string;
  readonly port: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly hasRegExpGroups: boolean;
  test(input?: UrlPatternInput, baseURL?: string): boolean;
  exec(input?: UrlPatternInput, baseURL?: string): UrlPatternResult | null;
}
export interface UrlPatternConstructor {
  new (input?: UrlPatternInput, options?: UrlPatternOptions): UrlPattern;
  new (input: UrlPatternInput, baseURL: string, options?: UrlPatternOptions): UrlPattern;
  readonly prototype: UrlPattern;
}
