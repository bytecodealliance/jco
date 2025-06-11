import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  componentNew,
  componentEmbed,
  transpile,
  preview1AdapterCommandPath,
} from "@bytecodealliance/jco";
import { HTTPServer } from "@bytecodealliance/preview2-shim/http";

import { suite, test, assert, describe } from "vitest";

import {
  exec,
  jcoPath,
  readFixtureFlags,
  getTmpDir,
  getRandomPort,
  readComponentBytes,
} from "./helpers.js";
import { tsGenerationPromise } from "./typescript.js";
import { getDefaultComponentFixtures, ESLINT_PATH } from "./common.js";

suite(`Transpiler codegen`, async () => {
  // NOTE: the codegen tests *must* run first and generate outputs for other tests to use
  describe("codegen", async () => {
    const fixtures = await getDefaultComponentFixtures();
    for (const fixture of fixtures) {
      const testName = fixture.replace(/(\.component)?\.(wasm|wat)$/, "");
      test.concurrent(`${testName} transpile & lint`, async () => {
        const flags = await readFixtureFlags(
          fileURLToPath(new URL(`./runtime/${testName}.ts`, import.meta.url))
        );
        var { stderr } = await exec(
          jcoPath,
          "transpile",
          fileURLToPath(
            new URL(`./fixtures/components/${fixture}`, import.meta.url)
          ),
          "--name",
          testName,
          ...flags,
          "-o",
          fileURLToPath(new URL(`./output/${testName}`, import.meta.url))
        );
        assert.strictEqual(stderr, "");

        if (flags.includes("--js")) return;

        const eslintOutput = await exec(
          ESLINT_PATH,
          fileURLToPath(
            new URL(`./output/${testName}/${testName}.js`, import.meta.url)
          ),
          "-c",
          fileURLToPath(new URL(`./eslint.config.mjs`, import.meta.url))
        );
        assert.strictEqual(eslintOutput.stderr, "");
      });
    }
  });

  describe("preview2", async () => {
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
        new URL(
          "./fixtures/modules/hello_stdout.component.wasm",
          import.meta.url
        )
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

      // Ignore errors from compilation (usually TS warnings)
      await tsGenerationPromise();

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
        await exec(`test/output/${runtimeName}.js`, `--test-port=${port}`);
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

      const outDir = fileURLToPath(
        new URL(`./output/composed`, import.meta.url)
      );
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
});

suite(`Naming`, () => {
  test(`Resource deduping`, async () => {
    const component = await componentNew(
      await componentEmbed({
        witSource: await readFile(
          fileURLToPath(
            new URL(
              `./fixtures/wits/resource-naming/resource-naming.wit`,
              import.meta.url
            )
          ),
          "utf8"
        ),
        dummy: true,
        metadata: [
          ["language", [["javascript", ""]]],
          ["processed-by", [["dummy-gen", "test"]]],
        ],
      })
    );

    const { files } = await transpile(component, { name: "resource-naming" });

    const bindingsSource = new TextDecoder().decode(
      files["resource-naming.js"]
    );

    assert.isOk(bindingsSource.includes("class Thing$1{"));
    assert.isOk(bindingsSource.includes("Thing: Thing$1"));
  });
});
