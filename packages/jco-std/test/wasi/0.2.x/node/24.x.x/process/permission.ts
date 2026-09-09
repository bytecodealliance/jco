import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process } from "../helpers/process.js";
test("permission absence matches the host without fabricating a grant", () => {
  expect(process.permission === undefined).toBe(nativeProcess.permission === undefined);
});
