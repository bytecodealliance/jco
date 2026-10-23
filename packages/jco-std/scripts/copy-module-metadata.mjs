import { copyFile } from "node:fs/promises";

// Preserve the optional filesystem scope's ESM and side-effect contracts in the
// published package. TypeScript does not emit package.json files.
const metadata = "wasi/0.2.x/node/24.x.x/fs/optional/package.json";
await copyFile(
  new URL(`../src/${metadata}`, import.meta.url),
  new URL(`../dist/${metadata}`, import.meta.url),
);
