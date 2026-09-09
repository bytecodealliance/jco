import nativeProcess from "node:process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import { process, errorOf } from "../helpers/process.js";
test("loadEnvFile accepts text, URL and byte paths with native file errors", () => {
  const dir = mkdtempSync(join(tmpdir(), "jco-process-env-")),
    file = join(dir, "config.env");
  const key = "JCO_PROCESS_LOAD_ENV",
    old = nativeProcess.env[key];
  try {
    writeFileSync(file, `${key}=loaded\n`);
    for (const path of [file, pathToFileURL(file), new TextEncoder().encode(file)]) {
      delete nativeProcess.env[key];
      process.loadEnvFile(path);
      expect(process.env[key]).toBe("loaded");
    }
    expect(errorOf(() => process.loadEnvFile(join(dir, "missing")))).toEqual(
      errorOf(() => nativeProcess.loadEnvFile(join(dir, "missing"))),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
    if (old === undefined) {
      delete nativeProcess.env[key];
    } else {
      nativeProcess.env[key] = old;
    }
  }
});
