export function run() {
    const cause = new TypeError("cause");
    const error = new Error("outer", { cause });
    const aggregate = new AggregateError([cause, error], "aggregate");
    const suppressed = new SuppressedError(error, cause, "suppressed");
    const target = { name: "Captured", message: "trace" };
    Error.captureStackTrace(target);

    return {
        message: error.message,
        causeMessage: error.cause.message,
        aggregateCount: aggregate.errors.length,
        suppressedMessage: suppressed.message,
        isError: Error.isError(error),
        capturedStack: typeof target.stack === "string" && target.stack.startsWith("Captured: trace"),
    };
}
