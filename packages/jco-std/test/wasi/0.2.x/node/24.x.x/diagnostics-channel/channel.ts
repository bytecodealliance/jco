import { describe, expect, test } from "vitest";

import nodeDc from "node:diagnostics_channel";

import * as ours from "../../../../../../src/wasi/0.2.x/node/24.x.x/diagnostics-channel.js";

type Dc = typeof nodeDc;

/**
 * Behavior is compared against Node's own module, so these pin the contract rather than my reading
 * of it. Each case gets a distinct channel name to stay independent of the others.
 */
describe("Channel behavior matches Node", () => {
  const cases: [string, (dc: Dc, name: string) => unknown][] = [
    ["channel identity is stable", (dc, n) => dc.channel(n) === dc.channel(n)],
    ["hasSubscribers is false before anything subscribes", (dc, n) => dc.hasSubscribers(n)],
    [
      "hasSubscribers is true once subscribed",
      (dc, n) => {
        dc.subscribe(n, () => {});
        return dc.hasSubscribers(n);
      },
    ],
    [
      "publish delivers message and channel name",
      (dc, n) => {
        const seen: unknown[] = [];
        dc.subscribe(n, (message, name) => seen.push([message, name]));
        dc.channel(n).publish({ x: 1 });
        return seen;
      },
    ],
    [
      "unsubscribe stops delivery and reports true",
      (dc, n) => {
        const handler = () => undefined;
        dc.subscribe(n, handler);
        const removed = dc.unsubscribe(n, handler);
        return [removed, dc.hasSubscribers(n)];
      },
    ],
    ["unsubscribing an unknown handler reports false", (dc, n) => dc.unsubscribe(n, () => {})],
    [
      "publish with no subscribers is a no-op",
      (dc, n) => {
        dc.channel(n).publish({ x: 1 });
        return dc.hasSubscribers(n);
      },
    ],
    [
      "every subscriber receives the message",
      (dc, n) => {
        const seen: string[] = [];
        dc.subscribe(n, () => seen.push("a"));
        dc.subscribe(n, () => seen.push("b"));
        dc.channel(n).publish(1);
        return seen;
      },
    ],
    [
      "a subscriber unsubscribing mid-publish still receives that message",
      (dc, n) => {
        const seen: string[] = [];
        const first = () => {
          seen.push("first");
          dc.unsubscribe(n, second);
        };
        const second = () => seen.push("second");
        dc.subscribe(n, first);
        dc.subscribe(n, second);
        dc.channel(n).publish(1);
        return seen;
      },
    ],
    [
      "bindStore exposes transformed data while subscribers run",
      (dc, n) => {
        const seen: unknown[] = [];
        let inStore: unknown;
        const store = {
          run: (value: unknown, fn: () => unknown) => {
            inStore = value;
            return fn();
          },
        };
        const ch = dc.channel(n);
        ch.bindStore(store as never, (data: unknown) => ({ from: data }));
        dc.subscribe(n, () => seen.push(inStore));
        ch.publish({ v: 1 });
        return seen;
      },
    ],
    [
      "runStores exposes data to the callback",
      (dc, n) => {
        let inStore: unknown;
        const store = {
          run: (value: unknown, fn: () => unknown) => {
            inStore = value;
            return fn();
          },
        };
        const ch = dc.channel(n);
        ch.bindStore(store as never, (data: unknown) => data);
        const returned = ch.runStores({ v: 2 }, () => "done");
        return [returned, inStore];
      },
    ],
    [
      "unbindStore stops the store being applied",
      (dc, n) => {
        let entered = false;
        const store = {
          run: (_v: unknown, fn: () => unknown) => {
            entered = true;
            return fn();
          },
        };
        const ch = dc.channel(n);
        ch.bindStore(store as never);
        ch.unbindStore(store as never);
        ch.runStores({ v: 1 }, () => undefined);
        return entered;
      },
    ],
  ];

  test.each(cases)("%s", (name, run) => {
    const slug = name.replace(/[^a-z]+/gi, "-");
    // Separate registries, so the same name is safe and keeps the comparison exact.
    expect(JSON.stringify(run(ours as unknown as Dc, slug))).toBe(
      JSON.stringify(run(nodeDc, slug)),
    );
  });
});
