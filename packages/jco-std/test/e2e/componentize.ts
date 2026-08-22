import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";

import { componentize as componentizeCurrent } from "@bytecodealliance/componentize-js";
import { componentize as componentizeLegacy } from "@bytecodealliance/componentize-js-0-19-3";
import { rolldown } from "rolldown";
import { assert, suite, test } from "vitest";

const JCO_STD_DIR = fileURLToPath(new URL("../../", import.meta.url));

const CASES = [
  { version: "0.2.3", world: "http-v0m2p3", componentize: componentizeLegacy },
  { version: "0.2.6", world: "http-v0m2p6", componentize: componentizeLegacy },
  { version: "0.2.12", world: "http-v0m2p12", componentize: componentizeCurrent, alias: "0.2.x" },
];

suite("WASI HTTP adapter componentization", () => {
  for (const { version, world, componentize, alias = version } of CASES) {
    test(`builds the ${alias} adapter against a ${version} world`, async () => {
      const entry = `@bytecodealliance/jco-std/wasi/${alias}/http/adapters/hono/server`;
      const source = `
        import { Hono } from "hono";
        import { fire } from "${entry}";
        const app = new Hono();
        app.get("/", (c) => c.text("Hello World!!!!"));
        fire(app);
        export { incomingHandler } from "${entry}";
      `;

      const bundle = await rolldown({
        input: `virtual:${version}`,
        external: [/^wasi:.*/],
        plugins: [
          {
            name: "compatibility-matrix-entry",
            resolveId(id) {
              if (id === `virtual:${version}`) {
                return id;
              }
            },
            load(id) {
              if (id === `virtual:${version}`) {
                return source;
              }
            },
          },
        ],
        resolve: {
          alias: {
            [entry]: join(JCO_STD_DIR, `dist/wasi/${version}/http/adapters/hono/server.js`),
          },
        },
      });
      const { output } = await bundle.generate({ format: "esm" });
      const jsSource = output[0].code;

      assert.include(jsSource, `wasi:http/types@${version}`);
      const { component } = await componentize(jsSource, {
        sourceName: "component.js",
        witPath: join(JCO_STD_DIR, `wit/http-v0m2p${version.split(".")[2]}`),
        worldName: world,
      });
      assert.isAbove(component.byteLength, 0);
    });
  }
});
