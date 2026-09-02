import { describe, expect, test } from "vitest";

import {
  CallbackRegistry,
  createInspectorCallbacks,
  createInspectorCore,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/inspector/index.js";
import * as denyHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/inspector-host.js";
import * as nodeHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/inspector-host-node.js";

// The entry modules (inspector.ts / inspector-promises.ts) import the WIT interface, which only
// resolves at componentize time, so the module *surface* a guest sees is covered by the guest
// fixture. Here we exercise the assembled core the entries are built from.
const core = createInspectorCore(nodeHost);

describe("node:inspector core surface", () => {
  test("exposes every module member", () => {
    expect(typeof core.open).toBe("function");
    expect(typeof core.close).toBe("function");
    expect(typeof core.url).toBe("function");
    expect(typeof core.waitForDebugger).toBe("function");
    expect(typeof core.console).toBe("object");
    expect(typeof core.Session).toBe("function");
    expect(typeof core.PromisesSession).toBe("function");
    expect(typeof core.Network).toBe("object");
    expect(typeof core.DOMStorage).toBe("object");
    expect(typeof core.NetworkResources).toBe("object");
  });

  test("the promises Session extends the callback Session", () => {
    expect(Object.getPrototypeOf(core.PromisesSession.prototype)).toBe(core.Session.prototype);
    expect(Object.getOwnPropertyNames(core.PromisesSession.prototype).sort()).toEqual([
      "constructor",
      "post",
    ]);
    expect(core.PromisesSession.prototype.post.length).toBe(3);
  });

  test("Session extends an EventEmitter", () => {
    expect(Object.getPrototypeOf(core.Session.prototype).constructor.name).toBe("EventEmitter");
    expect(Object.getOwnPropertyNames(core.Session.prototype).sort()).toEqual([
      "connect",
      "connectToMainThread",
      "constructor",
      "disconnect",
      "post",
    ]);
  });

  test("the deny host throws the adapter-required error from every entry point", () => {
    for (const call of [
      () => denyHost.open(undefined, undefined, false),
      () => denyHost.close(),
      () => denyHost.url(),
      () => denyHost.waitForDebugger(),
      () => denyHost.consoleCall(undefined, "log", "[]"),
      () => denyHost.sessionConnect(1, "local", 1),
      () => denyHost.sessionPost(1, "M", undefined, undefined),
      () => denyHost.sessionDisconnect(1),
      () => denyHost.emit("network", "requestWillBeSent", "{}"),
      () => denyHost.putNetworkResource("u", "d"),
    ]) {
      expect(call).toThrow(expect.objectContaining({ tag: "denied" }));
    }
  });
});

describe("inspector callback registry", () => {
  test("registers and takes a post callback once", () => {
    const registry = new CallbackRegistry();
    const seen: unknown[] = [];
    const id = registry.registerPost((error, result) => seen.push([error, result]));
    const callbacks = createInspectorCallbacks(registry);
    const resource = callbacks.takePostCallback(id);
    expect(resource).toBeDefined();
    // A second take is empty: the callback is one-shot.
    expect(callbacks.takePostCallback(id)).toBeUndefined();
    resource!.done(undefined, JSON.stringify({ ok: true }));
    expect(seen).toEqual([[null, { ok: true }]]);
  });

  test("reconstructs a coded error from a post callback payload", () => {
    const registry = new CallbackRegistry();
    let captured: (Error & { code?: string }) | null = null;
    const id = registry.registerPost((error) => {
      captured = error as Error & { code?: string };
    });
    const resource = createInspectorCallbacks(registry).takePostCallback(id)!;
    resource.done(JSON.stringify({ code: "ERR_INSPECTOR_COMMAND", message: "boom" }), undefined);
    expect(captured).toBeInstanceOf(Error);
    expect(captured!.code).toBe("ERR_INSPECTOR_COMMAND");
    expect(captured!.message).toBe("boom");
  });

  test("registers and takes a notification listener", () => {
    const registry = new CallbackRegistry();
    const seen: unknown[] = [];
    const id = registry.registerListener((method, paramsJson) => seen.push([method, paramsJson]));
    const callbacks = createInspectorCallbacks(registry);
    const listener = callbacks.takeNotificationListener(id);
    expect(listener).toBeDefined();
    listener!.notify("Runtime.consoleAPICalled", "{}");
    expect(seen).toEqual([["Runtime.consoleAPICalled", "{}"]]);
  });

  test("post and listener ids never collide", () => {
    const registry = new CallbackRegistry();
    const postId = registry.registerPost(() => {});
    const listenerId = registry.registerListener(() => {});
    expect(postId).not.toBe(listenerId);
    // Each take only matches its own kind.
    const callbacks = createInspectorCallbacks(registry);
    expect(callbacks.takeNotificationListener(postId)).toBeUndefined();
    expect(callbacks.takePostCallback(listenerId)).toBeUndefined();
  });

  test("a released registration cannot be taken", () => {
    const registry = new CallbackRegistry();
    const id = registry.registerPost(() => {});
    registry.releasePost(id);
    expect(createInspectorCallbacks(registry).takePostCallback(id)).toBeUndefined();
  });
});
