import { expect, test } from "vitest";
import { harness } from "../helpers/test.js";
test("todo executes bodies while excluding their failures from the summary", async () => {
  const h = harness();
  let touched = false;
  await h.test.todo("todo", (): void => {
    touched = true;
    throw new Error("later");
  });
  await h.drain();
  expect(touched).toBe(true);
  expect(h.results()[0].todo).toBe(true);
  expect(h.events.at(-1)).toMatchObject({ type: "test:summary", data: { success: true } });
});
