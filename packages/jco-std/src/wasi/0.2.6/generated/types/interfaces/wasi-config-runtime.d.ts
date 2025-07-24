declare module 'wasi:config/runtime@0.2.0-draft' {
  /**
   * Gets a single opaque config value set at the given key if it exists
   */
  export function get(key: string): string | undefined;
  /**
   * Gets a list of all set config data
   */
  export function getAll(): Array<[string, string]>;
  /**
   * An error type that encapsulates the different errors that can occur fetching config
   */
  export type ConfigError = ConfigErrorUpstream | ConfigErrorIo;
  /**
   * This indicates an error from an "upstream" config source.
   * As this could be almost _anything_ (such as Vault, Kubernetes ConfigMaps, KeyValue buckets, etc),
   * the error message is a string.
   */
  export interface ConfigErrorUpstream {
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
  export interface ConfigErrorIo {
    tag: 'io',
    val: string,
  }
}
