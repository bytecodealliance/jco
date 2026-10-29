declare module 'example:log-pipeline/types' {
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
