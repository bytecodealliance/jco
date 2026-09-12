import { test } from "vitest";
import { SourceTextModule } from "../../../../../../src/wasi/0.2.x/node/24.x.x/vm.js";
import { expectUnsupported, poison } from "../helpers/vm.js";

test("SourceTextModule keeps its API surface without compiling or linking fake modules", () => {
  expectUnsupported(
    () => Reflect.construct(SourceTextModule, [poison(), poison()]),
    "vm.SourceTextModule",
  );
  const receiver = Object.create(SourceTextModule.prototype) as SourceTextModule;

  for (const method of [
    "linkRequests",
    "instantiate",
    "hasAsyncGraph",
    "hasTopLevelAwait",
    "createCachedData",
  ] as const) {
    expectUnsupported(
      () => Reflect.apply(receiver[method], receiver, [poison()]),
      `vm.SourceTextModule.${method}`,
    );
  }

  for (const key of ["dependencySpecifiers", "moduleRequests", "status", "error"] as const) {
    expectUnsupported(() => receiver[key], `vm.SourceTextModule.${key}`);
  }
});
