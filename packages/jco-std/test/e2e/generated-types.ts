import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { assert, test } from "vitest";

const execFileAsync = promisify(execFile);
const packageDir = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const tscPath = join(dirname(require.resolve("typescript/package.json")), "bin/tsc");
const httpVersions = ["0.2.3", "0.2.6", "0.2.12"] as const;
const cases = [
  ...httpVersions.map((version) => ({
    name: `HTTP ${version}`,
    script: "generate-wasi-bindings.mjs",
    wit: `wit/http-v0m2p${version.split(".")[2]}`,
    output: `src/wasi/${version}/generated/types`,
    root: `http-v0m2p${version.split(".")[2]}.d.ts`,
  })),
  {
    name: "TLS",
    script: "generate-tls-bindings.mjs",
    wit: "wit/tls-0.2.0-draft",
    output: "src/wasi/0.2.12/generated/types/tls",
    root: "tls-0.2.d.ts",
  },
];

/** List the declarations owned by one generator, leaving the independent TLS tree out. */
async function declarationFiles(directory: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    if (prefix === "" && entry.name === "tls") {
      continue;
    }
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await declarationFiles(directory, path)));
    } else if (entry.name.endsWith(".d.ts")) {
      files.push(path);
    }
  }
  return files.sort();
}

/** Compile real consumers with declaration checking enabled, including ambient WIT modules. */
async function checkTypes(declarations: string[], source: string) {
  const dir = await mkdtemp(join(tmpdir(), "jco-std-types-"));
  try {
    const consumer = join(dir, "consumer.mts");
    await writeFile(consumer, source);
    await writeFile(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ESNext",
          module: "NodeNext",
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          types: [],
        },
        files: [...declarations, consumer],
      }),
    );
    await execFileAsync(process.execPath, [tscPath, "-p", dir], { cwd: packageDir });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

for (const { name, script, wit, output, root } of cases) {
  test(`checked-in ${name} declarations match workspace generation`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "jco-std-regenerate-"));
    try {
      await execFileAsync(process.execPath, [join(packageDir, "scripts", script)], {
        cwd: packageDir,
        env: { ...process.env, WIT_PATH: wit, OUTPUT_DIR_PATH: dir, BINDING_WORLD: "" },
      });
      const checkedIn = join(packageDir, output);
      const files = await declarationFiles(dir);
      assert.deepEqual(files, await declarationFiles(checkedIn));
      for (const file of files) {
        assert.equal(
          await readFile(join(dir, file), "utf8"),
          await readFile(join(checkedIn, file), "utf8"),
          file,
        );
      }
      await checkTypes([join(dir, root)], "export {};\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

test("WASI HTTP resources retain compatibility across 0.2 versions", async () => {
  const declarations = httpVersions.map((version) =>
    join(packageDir, `src/wasi/${version}/generated/types/interfaces/wasi-http-types.d.ts`),
  );
  await checkTypes(
    declarations,
    `import type * as Old from 'wasi:http/types@0.2.3';
     import type * as Middle from 'wasi:http/types@0.2.6';
     import type * as Current from 'wasi:http/types@0.2.12';
     declare const middle: Middle.IncomingRequest;
     declare const current: Current.IncomingRequest;
     const oldRequests: Old.IncomingRequest[] = [middle, current];
     declare const currentBody: typeof Current.IncomingBody;
     const oldBody: typeof Old.IncomingBody = currentBody;
     declare const currentResponse: typeof Current.OutgoingResponse;
     const oldResponse: typeof Old.OutgoingResponse = currentResponse;
     declare const fields: Current.Fields;
     const oldFields: Old.Fields = fields;
     declare const unbranded: Omit<Current.IncomingRequest, '$brand'>;
     // @ts-expect-error Structural mocks do not carry the generated resource identity.
     const branded: Current.IncomingRequest = unbranded;`,
  );
});
