export type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error';
export namespace WasiLogging {
  export function log(level: Level, context: string, message: string): void;
}
