import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process } from "../helpers/process.js";
test("cwd reads the host working directory", () => {
  expect(process.cwd()).toBe(nativeProcess.cwd());
});
