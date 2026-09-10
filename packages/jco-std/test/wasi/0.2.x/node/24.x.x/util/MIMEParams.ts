import { expect } from "vitest";
import { util, native, test, capture } from "../helpers/util.js";

test("MIMEParams preserves case folding, serialization and live iterators", () => {
  const report = (Ctor: typeof util.MIMEParams | typeof native.MIMEParams) => {
    const p = new Ctor();
    p.set("X", "a;b");
    p.set("EMPTY", "");
    const iter = p.entries();
    const first = iter.next().value;
    p.set("last", "v");
    p.delete("EMPTY");
    return [
      first,
      [...iter],
      p.get("x"),
      p.has("X"),
      p.get("missing"),
      [...p.keys()],
      [...p.values()],
      String(p),
      Reflect.apply(Reflect.get(p, "toJSON"), p, []),
    ];
  };

  expect(report(util.MIMEParams)).toEqual(report(native.MIMEParams));
  for (const [name, value] of [
    ["", "x"],
    ["a b", "x"],
    ["x", "\u0000"],
  ]) {
    expect(capture(() => new util.MIMEParams().set(name, value))).toEqual(
      capture(() => new native.MIMEParams().set(name, value)),
    );
  }
  expect(util.MIMEParams.prototype[Symbol.iterator]).toBe(util.MIMEParams.prototype.entries);
  expect(util.MIMEParams.prototype.toJSON).toBe(util.MIMEParams.prototype.toString);
});
