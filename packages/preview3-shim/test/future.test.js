import { describe, test, expect } from "vitest";

describe("Node.js Preview3 canon future", () => {
  test("Simple Future", async () => {
    const { future } = await import("@bytecodealliance/preview3-shim/future");
    const { tx, rx } = future();

    const message = "Hello world!";
    await tx.write(message);

    // first read yields the message
    const value = await rx.read();
    expect(value).toBe(message);

    // subsequent reads yield null
    const noValue = await rx.read();
    expect(noValue).toBeNull();
  });

  test("close resolves to null", async () => {
    const { future } = await import("@bytecodealliance/preview3-shim/future");
    const { tx, rx } = future();

    await tx.close();

    const value = await rx.read();
    expect(value).toBeNull();
  });

  test("abort rejects the reader", async () => {
    const { future } = await import("@bytecodealliance/preview3-shim/future");
    const { tx, rx } = future();

    const err = new Error("aborted");
    await tx.abort(err);

    await expect(rx.read()).rejects.toThrow("aborted");
  });

  test("writer cannot write twice", async () => {
    const { future } = await import("@bytecodealliance/preview3-shim/future");
    const { tx, rx } = future();

    await tx.write("first");
    await expect(tx.write("second")).rejects.toThrow();

    // reader still gets the first value
    const value = await rx.read();
    expect(value).toBe("first");
  });

  test("intoPromise returns the underlying promise", async () => {
    const { future } = await import("@bytecodealliance/preview3-shim/future");
    const { tx, rx } = future();

    await tx.write(42);

    const promise = rx.intoPromise();
    expect(promise).toBeInstanceOf(Promise);
    expect(await promise).toBe(42);
  });
});
