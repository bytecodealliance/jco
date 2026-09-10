import { expect } from "vitest";
import { util, native, test, capture } from "../helpers/util.js";

test("MIMEType preserves parsing, setters, quoting and prototype identities", () => {
  for (const input of [
    'Text/HTML; Charset="utf-8"; foo="a;b";foo=no',
    " application/json ",
    'text/plain;a="a\\b"',
    "text/plain; a=; b=ok",
    "bad",
    "/plain",
    "text/",
    "text/pl ain",
  ]) {
    const report = (Ctor: typeof util.MIMEType | typeof native.MIMEType) =>
      capture(() => {
        const mime = new Ctor(input);
        return [
          mime.type,
          mime.subtype,
          mime.essence,
          [...mime.params],
          String(mime),
          Reflect.apply(Reflect.get(mime, "toJSON"), mime, []),
        ];
      });

    expect(report(util.MIMEType)).toEqual(report(native.MIMEType));
  }
  const mime = new util.MIMEType("text/plain");
  mime.type = "APPLICATION";
  mime.subtype = "JSON";
  expect(mime.essence).toBe("application/json");
  expect(Object.getOwnPropertyNames(util.MIMEType.prototype)).toEqual(
    Object.getOwnPropertyNames(native.MIMEType.prototype),
  );
  expect(util.MIMEType.prototype.toJSON).toBe(util.MIMEType.prototype.toString);
});
