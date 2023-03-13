export type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error';
export namespace Logging {
  export function log(level: Level, context: string, message: string): void;
}
