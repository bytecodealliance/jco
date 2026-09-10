import { expect, test } from "vitest";
import { MockTracker } from "../../../../../../src/wasi/0.2.x/node/24.x.x/test/mock.js";
import { oracle } from "../helpers/test.js";
test("property mock records accesses, one-shot undefined and restoration like Node", async () => {
  const tracker = new MockTracker();
  const object = { value: 1 as number | undefined };
  const proxy = tracker.property(object, "value", 2);
  const first = object.value;
  object.value = 3;
  proxy.mock.mockImplementationOnce(undefined);
  const next = proxy.value;
  const last = object.value;
  const accesses = proxy.mock.accesses.map(({ type, value }) => ({ type, value }));
  tracker.reset();
  const result = JSON.parse(
    JSON.stringify({ first, next, last, accesses, restored: object.value }),
  );
  expect(result).toEqual(
    await oracle(
      `import { mock } from 'node:test'; const object={value:1}; const proxy=mock.property(object,'value',2);const first=object.value;object.value=3;proxy.mock.mockImplementationOnce(undefined);const next=proxy.value;const last=object.value;const accesses=proxy.mock.accesses.map(({type,value})=>({type,value}));mock.reset();console.log('RESULT:'+JSON.stringify({first,next,last,accesses,restored:object.value}));`,
    ),
  );
});
