import nodeTty from "node:tty";
import { describe, expect, test } from "vitest";
import { createTty } from "../../../../../../src/wasi/0.2.x/node/24.x.x/tty/core.js";
import {
  Duplex,
  Readable,
  Stream,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/index.js";
import { fakeTerminal } from "../helpers/tty.js";

function sortedKeys(value: object): string[] {
  return Reflect.ownKeys(value).map(String).sort();
}

function descriptors(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Reflect.ownKeys(value).map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return [
        String(key),
        descriptor && {
          enumerable: descriptor.enumerable,
          writable: descriptor.writable,
          configurable: descriptor.configurable,
          kind: descriptor.get ? "accessor" : typeof descriptor.value,
        },
      ];
    }),
  );
}

describe("node:tty module", () => {
  test("matches Node's export keys and descriptors", () => {
    const tty = createTty(fakeTerminal().host);
    expect(sortedKeys(tty)).toEqual(sortedKeys(nodeTty));
    expect(descriptors(tty)).toEqual(descriptors(nodeTty));
  });

  test("matches Node's prototype members, names and lengths", () => {
    const tty = createTty(fakeTerminal().host);
    for (const name of ["ReadStream", "WriteStream"] as const) {
      expect(sortedKeys(tty[name].prototype)).toEqual(sortedKeys(nodeTty[name].prototype));
      expect(descriptors(tty[name].prototype)).toEqual(descriptors(nodeTty[name].prototype));
      expect(tty[name].name).toBe(name);
      expect(tty[name].length).toBe(nodeTty[name].length);
      expect(tty[name].prototype.constructor).toBe(tty[name]);
    }
    expect(tty.WriteStream.prototype.isTTY).toBe(true);
    expect(tty.isatty.length).toBe(nodeTty.isatty.length);
  });

  test("constructs with and without new as a Duplex stream", () => {
    const tty = createTty(fakeTerminal().host);
    const input = new tty.ReadStream(0);
    const output = Reflect.apply(tty.WriteStream, undefined, [1]);
    expect(input).toBeInstanceOf(tty.ReadStream);
    expect(Reflect.apply(tty.ReadStream, undefined, [0])).toBeInstanceOf(tty.ReadStream);
    expect(output).toBeInstanceOf(tty.WriteStream);
    for (const stream of [input, output]) {
      expect(stream).toBeInstanceOf(Duplex);
      expect(stream).toBeInstanceOf(Readable);
      expect(stream).toBeInstanceOf(Stream);
    }
    expect(input).not.toBeInstanceOf(tty.WriteStream);
    // The socket stand-in sits between the public class and Duplex, as net.Socket does in Node.
    expect(Object.getPrototypeOf(Object.getPrototypeOf(tty.WriteStream.prototype))).toBe(
      Duplex.prototype,
    );
    expect(Object.keys(input)).not.toContain("fd");
    expect(Object.keys(output)).not.toContain("fd");
  });

  test("touches the provider only when asked", () => {
    const terminal = fakeTerminal();
    const tty = createTty(terminal.host);
    expect(terminal.calls).toEqual([]);
    expect(tty.isatty(-1)).toBe(false);
    expect(tty.WriteStream.prototype.getColorDepth.call(undefined, { TERM: "dumb" })).toBe(1);
    expect(terminal.calls).toEqual([]);
    new tty.WriteStream(1);
    expect(terminal.calls).toEqual(["open(1, write)", "windowSize(1)"]);
  });
});
