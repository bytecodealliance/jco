import nativeProcess from "node:process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { process } from "../helpers/process.js";
test("diagnostic reports reflect the host and write actual files", () => {
  const dir = mkdtempSync(join(tmpdir(), "jco-process-report-")),
    filename = join(dir, "report.json");
  const old = process.report.excludeEnv;
  try {
    process.report.excludeEnv = true;
    expect(nativeProcess.report.excludeEnv).toBe(true);
    const error = new Error("guest diagnostic");
    const report = process.report.getReport(error);
    expect(report).toMatchObject({
      header: { processId: nativeProcess.pid },
      javascriptStack: { message: "Error: guest diagnostic" },
    });
    expect(process.report.writeReport(filename, error)).toBe(filename);
    expect(JSON.parse(readFileSync(filename, "utf8"))).toMatchObject({
      header: { processId: nativeProcess.pid },
    });
  } finally {
    process.report.excludeEnv = old;
    rmSync(dir, { recursive: true, force: true });
  }
});
