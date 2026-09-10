import { expect } from "vitest";
import { util, test } from "../helpers/util.js";

test("aborted resolves on abort and validates resource before early resolution", async () => {
  const controller = new AbortController();
  const resource = {};
  const promise = util.aborted(controller.signal, resource);
  controller.abort();
  await promise;
  await expect(util.aborted(controller.signal, null!)).rejects.toMatchObject({
    code: "ERR_INVALID_ARG_TYPE",
  });
  await expect(util.aborted(controller.signal, {})).resolves.toBeUndefined();
});
