import { describe, expect, test } from "vitest";

import {
  Broadcast,
  Share,
  SyncShare,
  broadcast,
  broadcastProtocol,
  from,
  fromSync,
  share,
  shareProtocol,
  shareSync,
  shareSyncProtocol,
  text,
  textSync,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/iter/index.js";

describe("stream/iter multicast", () => {
  test("broadcasts pushed batches to concurrent consumers", async () => {
    const result = broadcast();
    const first = text(result.broadcast.push());
    const second = text(result.broadcast.push());
    expect(result.broadcast.consumerCount).toBe(2);
    await result.writer.write("hello");
    await result.writer.end();
    await expect(Promise.all([first, second])).resolves.toEqual(["hello", "hello"]);
  });

  test("shares pull sources between concurrent async and sync consumers", async () => {
    const asyncShared = share(from(["a", "b"]));
    await expect(
      Promise.all([text(asyncShared.pull()), text(asyncShared.pull())]),
    ).resolves.toEqual(["ab", "ab"]);

    const syncShared = shareSync(fromSync(["a", "b"]));
    const first = syncShared.pull()[Symbol.iterator]();
    const second = syncShared.pull()[Symbol.iterator]();
    expect(new TextDecoder().decode(first.next().value?.[0])).toBe("a");
    expect(new TextDecoder().decode(second.next().value?.[0])).toBe("a");
    expect(textSync({ [Symbol.iterator]: () => first })).toBe("b");
    expect(textSync({ [Symbol.iterator]: () => second })).toBe("b");
  });

  test("delegates static construction through protocol symbols", () => {
    const broadcastResult = broadcast();
    expect(Broadcast.from({ [broadcastProtocol]: () => broadcastResult } as never)).toBe(
      broadcastResult,
    );

    const asyncShared = share(from("x"));
    expect(Share.from({ [shareProtocol]: () => asyncShared } as never)).toBe(asyncShared);

    const syncShared = shareSync(fromSync("x"));
    expect(SyncShare.fromSync({ [shareSyncProtocol]: () => syncShared } as never)).toBe(syncShared);
  });
});
