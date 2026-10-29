declare module 'example:log-pipeline/processor' {
  export function describe(): Description;
  /**
   * Mutate the shared dataset and return a short summary, or an error.
   */
  export function process(options: string): string;
  export interface Description {
    name: string,
    description: string,
    defaultOptions: string,
  }
}
