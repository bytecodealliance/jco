declare module 'example:log-pipeline/dataset' {
  /**
   * Replace the shared dataset with a JSON array of access-log records.
   */
  export function reset(json: string): void;
  /**
   * Read the current logs and reports as JSON without resetting them.
   */
  export function snapshot(): string;
  export interface AccessLog {
    timestamp: string,
    ip: string,
    method: string,
    path: string,
    status: number,
    country?: string,
    riskScore?: number,
  }
}
