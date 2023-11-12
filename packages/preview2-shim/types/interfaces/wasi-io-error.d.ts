export namespace WasiIoError {
  /**
   * Returns a string that is suitable to assist humans in debugging
   * this error.
   * 
   * WARNING: The returned string should not be consumed mechanically!
   * It may change across platforms, hosts, or other implementation
   * details. Parsing this string is a major platform-compatibility
   * hazard.
   */
  export { Error };
}

export class Error {
  toDebugString(): string;
}
