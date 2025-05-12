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

  let isPrerelease = semver.prerelease(version) !== null;
  stdout.write(`${isPrerelease}`);
}

await main();
