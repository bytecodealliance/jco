import { test } from "vitest";
import { SyntheticModule } from "../../../../../../src/wasi/0.2.x/node/24.x.x/vm.js";
import { expectUnsupported, poison } from "../helpers/vm.js";

test("SyntheticModule does not iterate export names or invoke evaluation/link callbacks", () => {
  expectUnsupported(
    () =>
      Reflect.construct(SyntheticModule, [
        poison(),
        () => {
          throw new Error("callback ran");
        },
        poison(),
      ]),
    "vm.SyntheticModule",
  );
  const receiver = Object.create(SyntheticModule.prototype) as SyntheticModule;

  expectUnsupported(
    () => Reflect.apply(receiver.link, receiver, [poison()]),
    "vm.SyntheticModule.link",
  );
  expectUnsupported(
    () => Reflect.apply(receiver.setExport, receiver, [poison(), poison()]),
    "vm.SyntheticModule.setExport",
  );
});
