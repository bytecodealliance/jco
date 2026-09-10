import assert from "node:assert/strict";
import nodeUrl from "node:url";
import { createUrl } from "../../../../../../../src/wasi/0.2.x/node/24.x.x/url.js";

assert.equal(process.versions.node.split(".")[0], "24", "URL tests require the Node 24 oracle");
export { nodeUrl };
export const url = createUrl({ initialCwd: () => process.cwd(), getEnvironment: () => [] });
export function result(fn: () => unknown): unknown {
  try {
    return fn();
  } catch (error) {
    assert.ok(error instanceof Error);
    const fields = error as Error & { code?: string; input?: unknown; base?: unknown };
    // Node embeds the host OS in this one message; the guest is POSIX.
    return {
      name: error.name,
      code: fields.code,
      message: error.message.replace(`on ${process.platform}`, "on posix"),
      input:
        fields.input instanceof nodeUrl.URL || fields.input instanceof url.URL
          ? { href: fields.input.href, isURL: true }
          : fields.input,
      base: fields.base,
    };
  }
}
