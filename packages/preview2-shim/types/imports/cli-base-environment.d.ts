export namespace CliBaseEnvironment {
  export function /**
   * Get the POSIX-style environment variables.
   * 
   * Each environment variable is provided as a pair of string variable names
   * and string value.
   * 
   * Morally, these are a value import, but until value imports are available
   * in the component model, this import function should return the same
   * values each time it is called.
   */
  getEnvironment(): [string, string][];
  export function /**
   * Get the POSIX-style arguments to the program.
   */
  getArguments(): string[];
}
