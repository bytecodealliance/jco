/// <reference path="./example-log-pipeline-types.d.ts" />
declare module 'example:log-pipeline/processor' {
  export function describe(): Description;
  /**
   * Process a host-provided batch, updating the shared dataset and reports.
   */
  export function processBatch(logs: Array<AccessLog>, options: string): BatchResult;
  /**
   * Process one host-provided log; filters may remove it.
   */
  export function processSingle(log: AccessLog, options: string): SingleResult;
  export type AccessLog = import('example:log-pipeline/types').AccessLog;
  export interface Description {
    name: string,
    description: string,
    defaultOptions: string,
  }
  export interface BatchResult {
    logs: Array<AccessLog>,
    summary: string,
  }
  export interface SingleResult {
    /**
     * None means the processor filtered out this log.
     */
    log?: AccessLog,
    summary: string,
  }
}
