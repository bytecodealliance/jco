import { describe, expect, test } from "vitest";

import nodeDc from "node:diagnostics_channel";

import * as ours from "../../../../../../src/wasi/0.2.x/node/24.x.x/diagnostics-channel.js";

type Dc = typeof nodeDc;

/** Record the event order a tracing channel emits, which is the contract that matters. */
function events(
  dc: Dc,
  name: string,
  body: (tc: ReturnType<Dc["tracingChannel"]>) => unknown,
): unknown {
  const seen: string[] = [];
  const tc = dc.tracingChannel(name);
  tc.subscribe({
    start: () => seen.push("start"),
    end: () => seen.push("end"),
    asyncStart: () => seen.push("asyncStart"),
    asyncEnd: () => seen.push("asyncEnd"),
    error: () => seen.push("error"),
  });
  const returned = body(tc);
  return returned instanceof Promise
    ? returned.then(
        () => seen,
        () => seen,
      )
    : seen;
}

describe("TracingChannel matches Node", () => {
  test("hasSubscribers reflects the sub-channels", () => {
    for (const dc of [ours as unknown as Dc, nodeDc]) {
      const tc = dc.tracingChannel("has-subs");
      expect(tc.hasSubscribers).toBe(false);
      tc.subscribe({ start: () => undefined });
      expect(tc.hasSubscribers).toBe(true);
    }
  });

  test("traceSync emits start then end", async () => {
    expect(await events(ours as unknown as Dc, "sync-ok", (tc) => tc.traceSync(() => 1))).toEqual(
      await events(nodeDc, "sync-ok", (tc) => tc.traceSync(() => 1)),
    );
  });

  test("a throwing traceSync emits start, error, end", async () => {
    const body = (tc: ReturnType<Dc["tracingChannel"]>) => {
      try {
        tc.traceSync(() => {
          throw new Error("boom");
        });
      } catch {
        // the order is what is under test
      }
    };
    expect(await events(ours as unknown as Dc, "sync-throw", body)).toEqual(
      await events(nodeDc, "sync-throw", body),
    );
  });

  test("tracePromise brackets the asynchronous portion", async () => {
    const body = (tc: ReturnType<Dc["tracingChannel"]>) => tc.tracePromise(async () => 1);
    expect(await events(ours as unknown as Dc, "promise-ok", body)).toEqual(
      await events(nodeDc, "promise-ok", body),
    );
  });

  test("a rejecting tracePromise reports the error", async () => {
    const body = (tc: ReturnType<Dc["tracingChannel"]>) =>
      tc.tracePromise(async () => {
        throw new Error("boom");
      });
    expect(await events(ours as unknown as Dc, "promise-throw", body)).toEqual(
      await events(nodeDc, "promise-throw", body),
    );
  });

  test("subscribe and unsubscribe are symmetric", () => {
    for (const dc of [ours as unknown as Dc, nodeDc]) {
      const tc = dc.tracingChannel("sub-unsub");
      const handlers = { start: () => undefined, end: () => undefined };
      tc.subscribe(handlers);
      expect(tc.unsubscribe(handlers)).toBe(true);
      expect(tc.hasSubscribers).toBe(false);
    }
  });

  test("the traced value is returned unchanged", () => {
    for (const dc of [ours as unknown as Dc, nodeDc]) {
      expect(dc.tracingChannel("returns").traceSync(() => 42)).toBe(42);
    }
  });
});
