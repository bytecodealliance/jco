import { stdout, argv } from "node:process";

import semver from "semver";

async function main() {
  let version = argv[2];
  if (version?.startsWith("v")) {
    version = version.slice(1);
  }
  if (!version || !semver.valid(version)) {
    throw new Error("Missing/invalid semver value");
  }

  let p = semver.prerelease(version);
  if (!p) {
    stdout.write("");
    return;
  }
  stdout.write(`${p[0]}`);
}

await main();
