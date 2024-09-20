import { strictEqual } from "node:assert";
import { readFile, rm, writeFile, mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { normalize, resolve, sep } from "node:path";

import { fileURLToPath, pathToFileURL } from "url";
import { HTTPServer } from "@bytecodealliance/preview2-shim/http";

import { componentNew, preview1AdapterCommandPath } from "../src/api.js";
import { exec, jcoPath, getTmpDir } from "./helpers.js";

export async function preview2Test() {
  suite("Preview 2", () => {
    var tmpDir;
    var outFile;
    suiteSetup(async function () {
      tmpDir = await getTmpDir();
      outFile = resolve(tmpDir, "out-component-file");
    });
    suiteTeardown(async function () {
      try {
        await rm(tmpDir, { recursive: true });
      } catch {}
    });

    teardown(async function () {
      try {
        await rm(outFile);
      } catch {}
    });

    test("hello_stdout", async () => {
      const component = await readFile(
        `test/fixtures/modules/hello_stdout.wasm`
      );
      const generatedComponent = await componentNew(component, [
        [
          "wasi_snapshot_preview1",
          await readFile(preview1AdapterCommandPath()),
        ],
      ]);
      await writeFile(
        "test/output/hello_stdout.component.wasm",
        generatedComponent
      );

      const { stdout, stderr } = await exec(
        jcoPath,
        "run",
        "test/output/hello_stdout.component.wasm"
      );
      strictEqual(stdout, "writing to stdout: hello, world\n");
      strictEqual(stderr, "writing to stderr: hello, world\n");
    });

    test("wasi-http-proxy", async () => {
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
      }).listen(8080);

      const runtimeName = "wasi-http-proxy";
      try {
        const { stderr } = await exec(
          jcoPath,
          "componentize",
          "test/fixtures/componentize/wasi-http-proxy/source.js",
          "-w",
          "test/fixtures/wit",
          "--world-name",
          "test:jco/command-extended",
          "-o",
          outFile
        );
        strictEqual(stderr, "");
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
          strictEqual(stderr, "");
        }

        await exec(`test/output/${runtimeName}.js`);
      } finally {
        server.close();
      }
    });

    test("incoming composed", async () => {
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
        strictEqual(stderr, "");
      }

      const { incomingHandler } = await import(
        `${pathToFileURL(outDir)}/composed.js`
      );
      const server = new HTTPServer(incomingHandler);
      server.listen(8081);

      const res = await (await fetch("http://localhost:8081")).text();
      strictEqual(res, "Hello from Typescript!\n");

      server.stop();
    });
  });
}
