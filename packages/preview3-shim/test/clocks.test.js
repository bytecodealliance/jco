import { describe, test, vi, expect, beforeEach, afterEach } from "vitest";

import { monotonicClock } from "@bytecodealliance/preview3-shim/clocks";

describe("monotonic clock tests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("waits for the correct timeout in waitFor", async () => {
    const waitForSpy = vi.fn(monotonicClock.waitFor);
    vi.spyOn(monotonicClock, "now")
      .mockReturnValueOnce(0n)
      .mockReturnValueOnce(0n)
      .mockReturnValue(250_000_000n);
    const promise = waitForSpy(250_000_000n); // 250ms

    vi.advanceTimersByTime(249);
    expect(waitForSpy).not.toHaveResolved();

    vi.advanceTimersByTime(1);
    await promise;
    expect(waitForSpy).toHaveResolved();
  });

  test("returns immediately if waitUntil target ≤ now", async () => {
    const waitUntilSpy = vi.fn(monotonicClock.waitUntil.bind(monotonicClock));
    vi.spyOn(monotonicClock, "now").mockReturnValue(500n);

    await waitUntilSpy(400n);
    expect(waitUntilSpy).toHaveResolved();
  });

  test("waitUntil works when destructured from monotonicClock", async () => {
    vi.spyOn(monotonicClock, "now").mockReturnValue(500n);
    const { waitUntil } = monotonicClock;
    await expect(waitUntil(400n)).resolves.toBeUndefined();
  });

  test("waits until target time in waitUntil", async () => {
    const waitUntilSpy = vi.fn(monotonicClock.waitUntil.bind(monotonicClock));
    vi.spyOn(monotonicClock, "now").mockReturnValueOnce(100n).mockReturnValue(350_000_000n);
    const promise = waitUntilSpy(350_000_000n); // 350 ms target

    vi.advanceTimersByTime(349);
    expect(waitUntilSpy).not.toHaveResolved();

    vi.advanceTimersByTime(1);
    await promise;
    expect(waitUntilSpy).toHaveResolved();
  });

  test("waitUntil rounds positive sub-millisecond waits up", async () => {
    const waitUntilSpy = vi.fn(monotonicClock.waitUntil.bind(monotonicClock));
    vi.spyOn(monotonicClock, "now").mockReturnValueOnce(1n).mockReturnValue(1_000_000n);
    const promise = waitUntilSpy(1_000_000n);

    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(waitUntilSpy).not.toHaveResolved();

    vi.advanceTimersByTime(1);
    await promise;
    expect(waitUntilSpy).toHaveResolved();
  });

  test("waitFor rounds positive sub-millisecond waits up", async () => {
    const waitForSpy = vi.fn(monotonicClock.waitFor);
    vi.spyOn(monotonicClock, "now")
      .mockReturnValueOnce(0n)
      .mockReturnValueOnce(0n)
      .mockReturnValue(1n);
    const promise = waitForSpy(1n);

    vi.advanceTimersByTime(0);
    await Promise.resolve();
    expect(waitForSpy).not.toHaveResolved();

    vi.advanceTimersByTime(1);
    await promise;
    expect(waitForSpy).toHaveResolved();
  });

  test("throws if duration exceeds MAX_SAFE_INTEGER in waitFor", async () => {
    const msOneOver = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    const hugeNs = msOneOver * 1_000_000n;

    await expect(monotonicClock.waitFor(hugeNs)).rejects.toThrow(TypeError);
  });

  test("waitUntil throws for target time exceeding MAX_SAFE_INTEGER", async () => {
    vi.spyOn(monotonicClock, "now").mockReturnValue(0n);

    // same trick: make ms > MAX_SAFE_INTEGER
    const msOneOver = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    const hugeNs = msOneOver * 1_000_000n;

    await expect(monotonicClock.waitUntil(hugeNs)).rejects.toThrow(TypeError);
  });
});
