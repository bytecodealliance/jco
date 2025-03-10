import { readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";

import { fileURLToPath, pathToFileURL } from "url";
import { HTTPServer } from "@bytecodealliance/preview2-shim/http";

import { componentNew, preview1AdapterCommandPath } from "../src/api.js";

import { suite, test, assert } from "vitest";

import {
  exec,
  jcoPath,
  getTmpDir,
  getRandomPort,
  readComponentBytes,
} from "./helpers.js";
import { tsGenerationPromise } from "./typescript.js";

suite("Preview 2", () => {
  test("hello_stdout", async () => {
    const component = await readComponentBytes(
      fileURLToPath(
        new URL("./fixtures/modules/hello_stdout.wasm", import.meta.url)
      )
    );
    const generatedComponent = await componentNew(component, [
      [
        "wasi_snapshot_preview1",
        await readComponentBytes(preview1AdapterCommandPath()),
      ],
    ]);

    const outputPath = fileURLToPath(
      new URL("./fixtures/modules/hello_stdout.component.wasm", import.meta.url)
    );

    await writeFile(outputPath, generatedComponent);

    const { stdout, stderr } = await exec(jcoPath, "run", outputPath);
    assert.strictEqual(stdout, "writing to stdout: hello, world\n");
    assert.strictEqual(stderr, "writing to stderr: hello, world\n");
  });

  test("wasi-http-proxy", async () => {
    const tmpDir = await getTmpDir();
    const outFile = resolve(tmpDir, "out-component-file");
    const port = await getRandomPort();
    const server = createServer(async (req, res) => {
      if (req.url == "/api/examples") {
        res.writeHead(200, {
          "Content-Type": "text/plain",
          "X-Wasi": "mock-server",
          Date: null,
        });
        if (req.method === "GET") {
          res.write("hello world");
        } else {
          req.pipe(res);
          return;
        }
      } else {
        res.statusCode(500);
      }
      res.end();
    }).listen(port); // transpile component expects this port

    try {
      // Ignore errors from compilation (usually TS warnings)
      await tsGenerationPromise();
    } catch {}

    const runtimeName = "wasi-http-proxy";
    try {
      const { stderr } = await exec(
        jcoPath,
        "componentize",
        fileURLToPath(
          new URL(
            "./fixtures/componentize/wasi-http-proxy/source.js",
            import.meta.url
          )
        ),
        "-w",
        fileURLToPath(new URL("./fixtures/wit", import.meta.url)),
        "--world-name",
        "test:jco/command-extended",
        "-o",
        outFile
      );
      assert.strictEqual(stderr, "");
      const outDir = fileURLToPath(
        new URL(`./output/${runtimeName}`, import.meta.url)
      );
      {
        const { stderr } = await exec(
          jcoPath,
          "transpile",
          outFile,
          "--name",
          runtimeName,
          "-o",
          outDir
        );
        assert.strictEqual(stderr, "");
      }

      const outputModulePath = fileURLToPath(
        new URL(`./output/${runtimeName}.js`, import.meta.url)
      );
      await exec(outputModulePath, `--test-port=${port}`);
    } finally {
      server.close();
    }

    try {
      await rm(outFile);
    } catch {}
  });

  test.concurrent("incoming composed", async () => {
    const tmpDir = await getTmpDir();
    const outFile = resolve(tmpDir, "out-component-file");

    const outDir = fileURLToPath(new URL(`./output/composed`, import.meta.url));
    {
      const { stderr } = await exec(
        jcoPath,
        "transpile",
        fileURLToPath(
          new URL("./fixtures/components/composed.wasm", import.meta.url)
        ),
        "-o",
        outDir
      );
      assert.strictEqual(stderr, "");
    }

    const { incomingHandler } = await import(
      `${pathToFileURL(outDir)}/composed.js`
    );
    const server = new HTTPServer(incomingHandler);
    const port = await getRandomPort();
    server.listen(port);

    const res = await (await fetch(`http://localhost:${port}`)).text();
    assert.strictEqual(res, "Hello from Typescript!\n");

    server.stop();

    try {
      await rm(outFile);
    } catch {}
  });

  // https://github.com/bytecodealliance/jco/issues/550
  test.concurrent("pollable hang", async () => {
    await exec(
      jcoPath,
      "run",
      fileURLToPath(
        new URL(
          "./../test/fixtures/components/stdout-pollable-hang.component.wasm",
          import.meta.url
        )
      )
    );
  });
});
