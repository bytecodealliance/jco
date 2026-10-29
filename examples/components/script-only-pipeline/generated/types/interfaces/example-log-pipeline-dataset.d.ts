/// <reference path="./example-log-pipeline-types.d.ts" />
declare module 'example:log-pipeline/dataset' {
  /**
   * Replace the shared dataset with raw logs, clearing annotations and reports.
   */
  export function reset(logs: Array<AccessLog>): void;
  /**
   * Read the current logs and reports without resetting them.
   */
  export function snapshot(): DatasetSnapshot;
  export type AccessLog = import('example:log-pipeline/types').AccessLog;
  export interface DatasetSnapshot {
    logs: Array<AccessLog>,
    /**
     * Processor-defined reports encoded as a JSON object.
     */
    reportsJson: string,
  }
}
