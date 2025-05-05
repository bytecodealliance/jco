import { describe, test, expect } from "vitest";

describe("Node.js Preview3 canon future", () => {
  test("Simple Future", async () => {
    const { future } = await import("@bytecodealliance/preview3-shim/future");
    const [tx, rx] = future();

    const message = "Hello world!";
    await tx.write(message);

    // first read yields the message
    const value = await rx.read();
    expect(value).toBe(message);

    // subsequent reads yield null
    const noValue = await rx.read();
    expect(noValue).toBeNull();
  });
});
