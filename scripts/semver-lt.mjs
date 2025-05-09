import { stdout, argv } from "node:process";

import semver from "semver";

async function main() {
  let [lhs, rhs] = argv.slice(2, 4);
  if (!lhs || !semver.valid(lhs)) {
    throw new Error("Missing/invalid LHS semver value");
  }
  if (!rhs || !semver.valid(rhs)) {
    throw new Error("Missing/invalid RHS semver value");
  }

  stdout.write(`${semver.lt(lhs, rhs)}`);
}

await main();
