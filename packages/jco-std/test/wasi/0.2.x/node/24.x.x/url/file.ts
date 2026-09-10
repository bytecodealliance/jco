import assert from "node:assert/strict";
import { test } from "vitest";
import { Buffer } from "node:buffer";
import { createUrl } from "../../../../../../src/wasi/0.2.x/node/24.x.x/url.js";
import { nodeUrl, url, result } from "./helpers/conformance.js";

test("fileURLToPath and raw Buffer conversion: encodings, hosts and Windows", () => {
  for (const input of [
    "file:///",
    "file://localhost/a",
    "file://host/a",
    "file:///a%2fb",
    "file:///C:/%5c",
    "file:///C:/%2f",
    "file:///a/%FF",
    "file:///a/%",
    "file:///a/%FE%80",
    "file://xn--bcher-kva.de/share/a",
    "file:///C:/a%00b",
    "file:///a/%E0%A4",
    "file:///C:/x",
  ]) {
    for (const windows of [false, true]) {
      const options = { windows };
      assert.deepEqual(
        result(() => url.fileURLToPath(input, options)),
        result(() => nodeUrl.fileURLToPath(input, options)),
        input,
      );
      assert.deepEqual(
        result(() => [...url.fileURLToPathBuffer(input, options)]),
        result(() => [...nodeUrl.fileURLToPathBuffer(input, options)]),
        input,
      );
    }
  }
  assert.ok(Buffer.isBuffer(url.fileURLToPathBuffer("file:///a")));
  assert.equal(url.fileURLToPath(new nodeUrl.URL("file:///native")), "/native");
});

test("pathToFileURL preserves reserved characters and does not read providers for absolute paths", () => {
  const pure = createUrl({
    initialCwd() {
      throw new Error("cwd read");
    },
    getEnvironment() {
      throw new Error("env read");
    },
  });
  for (const path of [
    "/",
    "/a/../b/",
    "/two words",
    "/%23#?",
    "/back\\slash",
    "/control\u0000\u0001\n\t\r",
    '/quote"<>^`{}|',
    "/é/🌍",
    "/unpaired\ud800",
    "//server/path",
  ]) {
    assert.equal(pure.pathToFileURL(path).href, nodeUrl.pathToFileURL(path).href, path);
  }
  for (const path of [
    "C:\\",
    "C:\\a\\..\\b\\",
    "C:\\é #?%\\🌍",
    "\\\\server\\share\\a b",
    "\\\\?\\UNC\\server\\share\\a",
    "\\\\server",
    "\\\\\\bad\\path",
  ]) {
    assert.deepEqual(
      result(() => pure.pathToFileURL(path, { windows: true }).href),
      result(() => nodeUrl.pathToFileURL(path, { windows: true }).href),
      path,
    );
  }
  assert.throws(() => pure.pathToFileURL("relative"), /cwd read/);
  assert.equal(
    url.pathToFileURL("relative/../child").href,
    nodeUrl.pathToFileURL("relative/../child").href,
  );
  const withCwd = createUrl({
    initialCwd: () => "/sandbox",
    getEnvironment: () => [["=C:", "C:\\work"]],
  });
  assert.equal(withCwd.pathToFileURL("child").href, "file:///sandbox/child");
  assert.equal(withCwd.pathToFileURL("C:child", { windows: true }).href, "file:///C:/work/child");
});

test("file conversion invalid inputs preserve error codes and validation order", () => {
  for (const input of [undefined, null, 42, true, {}, [], new nodeUrl.URL("https://example.com")]) {
    for (const name of ["fileURLToPath", "fileURLToPathBuffer", "pathToFileURL"] as const) {
      assert.deepEqual(
        result(() => Reflect.apply(url[name], null, [input])),
        result(() => Reflect.apply(nodeUrl[name], null, [input])),
        name,
      );
    }
  }
});

// Cases derived from Node v24.20.0 test/parallel/test-url-pathtofileurl.js,
// commit 71b8b174857e25106d39b61a9e6f30d927da8b01 (Node MIT license).
test("UNC hostname terminators leave the resource path intact", () => {
  for (const host of [
    "host#name",
    "host?name",
    "host/name",
    "host\nname",
    "host\rname",
    "host\tname",
  ]) {
    const path = `\\\\${host}\\share\\file.txt`;
    assert.equal(
      url.pathToFileURL(path, { windows: true }).href,
      nodeUrl.pathToFileURL(path, { windows: true }).href,
    );
  }
  for (const host of ["bad host", "host@name", "host:name", "host[name", "host]name"]) {
    assert.throws(() => url.pathToFileURL(`\\\\${host}\\share\\file.txt`, { windows: true }), {
      code: "ERR_INVALID_URL",
    });
  }
});
