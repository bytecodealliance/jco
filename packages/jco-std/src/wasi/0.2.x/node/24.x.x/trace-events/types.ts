/** Options accepted by Node 24's trace_events implementation. */
export interface CreateTracingOptions {
  categories: string[];
}

/** Created disabled by createTracing; there is no public Tracing constructor. */
export interface Tracing {
  readonly categories: string;

  readonly enabled: boolean;

  enable(): void;

  disable(): void;
}

export interface TraceEvents {
  createTracing(options: CreateTracingOptions): Tracing;

  getEnabledCategories(): string | undefined;
}

/** One active host trace. Stopping it does not affect other trace owners. */
export interface TraceSession {
  stop(): void;
}

export interface TraceEventsHost {
  /** Consumes ownership of a session after stop succeeds. */
  release(session: TraceSession): void;

  TraceSession: {
    start(categories: string[]): TraceSession;
  };

  getEnabledCategories(): string | undefined;
}
