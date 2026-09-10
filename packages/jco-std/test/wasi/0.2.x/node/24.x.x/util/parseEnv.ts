import { expect } from "vitest";
import { util, native, test, capture } from "../helpers/util.js";

test("parseEnv matches whitespace, quoting, duplicate keys and invalid lines", () => {
  for (const source of [
    "",
    "A=1\nA=2",
    "export FOO = \"a\\nb\"\nQ='a#b'\nT=`multi\nline`",
    "# comment\r\nA=hello # rest\ninvalid\nB=yes",
    "__proto__=safe\nconstructor=ok",
    " export X=\nY=  ",
    'A="unclosed\nB=v',
    "=value\nX=y",
  ]) {
    expect(util.parseEnv(source)).toEqual(native.parseEnv(source));
  }
  expect(capture(() => Reflect.apply(util.parseEnv, undefined, [null]))).toEqual(
    capture(() => Reflect.apply(native.parseEnv, undefined, [null])),
  );
});
