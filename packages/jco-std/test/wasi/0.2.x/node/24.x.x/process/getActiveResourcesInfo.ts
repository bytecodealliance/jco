import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process } from "../helpers/process.js";
test("active resources are native resource names", () => {
  expect(process.getActiveResourcesInfo()).toEqual(nativeProcess.getActiveResourcesInfo());
});
