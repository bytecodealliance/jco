import type { TraceSession as Session } from "./trace-events/types.js";

export class TraceSession implements Session {
  static start(categories: string[]): TraceSession;

  stop(): void;
}

export function getEnabledCategories(): string | undefined;

export function release(session: TraceSession): void;
