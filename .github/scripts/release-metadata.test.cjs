const assert = require("node:assert/strict");
const { test } = require("node:test");

const { collectReleaseMetadata } = require("./release-metadata.cjs");

function pullRequest(title, merged = true) {
  return {
    eventName: "pull_request",
    payload: { pull_request: { title, merged } },
  };
}

test("accepts a valid release pull request", () => {
  assert.deepEqual(
    collectReleaseMetadata(pullRequest("release: jco v1.2.3-beta.1+build.5")),
    { project: "jco", version: "1.2.3-beta.1+build.5" },
  );
});

test("ignores unrelated and unmerged pull requests", () => {
  assert.equal(collectReleaseMetadata(pullRequest("fix(jco): a bug")), null);
  assert.equal(
    collectReleaseMetadata(pullRequest("release: jco v1.2.3", false)),
    null,
  );
});

for (const title of [
  "release: jco v1.2.3;touch owned",
  "release: jco v1.2.3$(touch owned)",
  "release: jco v1.2.3`touch owned`",
  "release: unknown v1.2.3",
  "release: jco v01.2.3",
]) {
  test(`rejects unsafe release title: ${title}`, () => {
    assert.throws(() => collectReleaseMetadata(pullRequest(title)), /Invalid/);
  });
}

test("validates manually dispatched metadata", () => {
  assert.deepEqual(
    collectReleaseMetadata({
      eventName: "workflow_dispatch",
      payload: { inputs: { project: "preview2-shim", version: "0.25.0" } },
    }),
    { project: "preview2-shim", version: "0.25.0" },
  );
  assert.throws(
    () =>
      collectReleaseMetadata({
        eventName: "workflow_dispatch",
        payload: { inputs: { project: "jco;id", version: "1.2.3" } },
      }),
    /Invalid release project/,
  );
});
