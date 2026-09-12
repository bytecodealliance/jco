import { test } from "vitest";
import { runInNewContext } from "../../../../../../src/wasi/0.2.x/node/24.x.x/vm.js";
import { expectUnsupported, poison } from "../helpers/vm.js";

test("runInNewContext refuses without running source in the caller's realm", () => {
  expectUnsupported(() => runInNewContext("throw new Error('executed')"), "vm.runInNewContext");
  expectUnsupported(
    () => Reflect.apply(runInNewContext, undefined, [poison(), poison(), poison()]),
    "vm.runInNewContext",
  );
});
