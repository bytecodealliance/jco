import { expect, test } from "vitest";
import { harness, oracle } from "../helpers/test.js";

test("suites declare synchronously and run nested tests and hooks in Node order", async () => {
  const h = harness();
  const order: string[] = [];
  await h.test.suite("suite", (s): void => {
    order.push(`build:${s.name}`);
    h.test.before((): void => {
      order.push("before");
    });
    h.test.after((): void => {
      order.push("after");
    });
    h.test("one", (): void => {
      order.push("one");
    });
    h.test.suite("inner", (): void => {
      h.test("two", (): void => {
        order.push("two");
      });
    });
  });
  await h.drain();
  expect(order).toEqual(["build:suite", "before", "one", "two", "after"]);
  expect(order).toEqual(
    await oracle(
      `import {suite,test,before,after} from 'node:test'; const order=[]; suite('suite',s=>{order.push('build:'+s.name);before(()=>order.push('before'));after(()=>order.push('after'));test('one',()=>order.push('one'));suite('inner',()=>{test('two',()=>order.push('two'));});});process.on('beforeExit',()=>console.log('RESULT:'+JSON.stringify(order)));`,
    ),
  );
  expect(h.results().map((r) => [r.name, r.details.type])).toEqual([
    ["one", "test"],
    ["two", "test"],
    ["inner", "suite"],
    ["suite", "suite"],
  ]);
});
test("async suite declarations fail explicitly and cancel declared children", async () => {
  const h = harness();
  h.test.suite("async", async (): Promise<void> => {
    h.test("child", (): never => {
      throw new Error("should be cancelled");
    });
  });
  await h.drain();
  expect(h.results().at(-1)?.details.error?.cause).toMatchObject({
    code: "ERR_JCO_UNSUPPORTED_NODE_API",
  });
  expect(h.results()[0].details.error?.failureType).toBe("cancelledByParent");
});
