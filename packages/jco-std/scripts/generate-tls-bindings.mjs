// Resolve the unmodified upstream draft with its explicit `tls` feature enabled.
import { generateGuestTypes, writeFiles } from "@bytecodealliance/jco-transpile";
const files = await generateGuestTypes("wit/tls-0.2.0-draft", {
  features: ["tls"],
  outDir: "src/wasi/0.2.6/generated/types/tls",
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
