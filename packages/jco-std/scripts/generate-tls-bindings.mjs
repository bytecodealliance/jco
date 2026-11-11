// Generate bindings for the documented local TLS contract with the workspace backend.
import { env } from "node:process";
import { generateGuestTypes, writeFiles } from "../../jco-transpile/dist/index.js";
const files = await generateGuestTypes("wit/tls-0.2.0-draft", {
  outDir: env.OUTPUT_DIR_PATH ?? "src/wasi/0.2.12/generated/types/tls",
});
const decoder = new TextDecoder();
const encoder = new TextEncoder();
for (const [path, contents] of Object.entries(files)) {
  files[path] = encoder.encode(
    decoder
      .decode(contents)
      .replace(/[ \t]+$/gm, "")
      .trimEnd() + "\n",
  );
}
await writeFiles(files);
