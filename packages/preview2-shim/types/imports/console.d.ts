export namespace Console {
  export function log(level: Level, context: string, message: string): void;
}
/**
 * # Variants
 * 
 * ## `"trace"`
 * 
 * ## `"debug"`
 * 
 * ## `"info"`
 * 
 * ## `"warn"`
 * 
 * ## `"error"`
 */
export type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error';
