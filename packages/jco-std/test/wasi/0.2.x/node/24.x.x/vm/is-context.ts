import { expect, test } from "vitest";
import native from "node:vm";
import { isContext } from "../../../../../../src/wasi/0.2.x/node/24.x.x/vm.js";
import { capture, isNode24, poison } from "../helpers/vm.js";

test.skipIf(!isNode24)(
  "isContext rejects non-objects and does not confuse objects with native contexts",
  () => {
    for (const value of [{}, [], globalThis, new Date(), poison()]) {
      expect(isContext(value)).toBe(false);
    }

    for (const value of [undefined, null, 1, "", Symbol(), () => {}]) {
      const actual = capture(() => isContext(value));
      const expected = capture(() => Reflect.apply(native.isContext, undefined, [value]));
      expect({ name: actual.name, code: actual.code }).toEqual({
        name: expected.name,
        code: expected.code,
      });
    }
  },
);
