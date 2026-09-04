declare module 'wasi:config/store@0.2.0-rc.1' {
  /**
   * Gets a configuration value of type `string` associated with the `key`.
   * 
   * The value is returned as an `option<string>`. If the key is not found,
   * `Ok(none)` is returned. If an error occurs, an `Err(error)` is returned.
   */
  export function get(key: string): string | undefined;
  /**
   * Gets a list of configuration key-value pairs of type `string`.
   * 
   * If an error occurs, an `Err(error)` is returned.
   */
  export function getAll(): Array<[string, string]>;
  /**
   * An error type that encapsulates the different errors that can occur fetching configuration values.
   */
  export type Error = ErrorUpstream | ErrorIo;
  /**
   * This indicates an error from an "upstream" config source.
   * As this could be almost _anything_ (such as Vault, Kubernetes ConfigMaps, KeyValue buckets, etc),
   * the error message is a string.
   */
  export interface ErrorUpstream {
    tag: 'upstream',
    val: string,
  }
  /**
   * This indicates an error from an I/O operation.
   * As this could be almost _anything_ (such as a file read, network connection, etc),
   * the error message is a string.
   * Depending on how this ends up being consumed,
   * we may consider moving this to use the `wasi:io/error` type instead.
   * For simplicity right now in supporting multiple implementations, it is being left as a string.
   */
  export interface ErrorIo {
    tag: 'io',
    val: string,
  }
}
