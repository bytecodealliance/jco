const PROJECTS = new Set([
  "jco",
  "bare-jco",
  "jco-node-fs",
  "jco-transpile",
  "jco-std",
  "js-component-bindgen",
  "preview2-shim",
  "preview3-shim",
  "rolldown-plugin-jco",
]);

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function validateMetadata(project, version) {
  if (!PROJECTS.has(project)) {
    throw new Error(`Invalid release project: ${project}`);
  }
  if (!SEMVER.test(version)) {
    throw new Error(`Invalid release version: ${version}`);
  }
  return { project, version };
}

function collectReleaseMetadata(context) {
  switch (context.eventName) {
    case "pull_request": {
      const pr = context.payload?.pull_request;
      if (!pr) {
        throw new Error("Invalid/missing pull request payload");
      }
      if (!pr.merged) {
        return null;
      }
      if (!pr.title?.startsWith("release:")) {
        return null;
      }

      const match = /^release:\s+([^\s]+)\s+v([^\s]+)$/.exec(pr.title);
      if (!match) {
        throw new Error(`Invalid release pull request title: ${pr.title}`);
      }
      return validateMetadata(match[1], match[2]);
    }
    case "workflow_dispatch":
      return validateMetadata(
        context.payload?.inputs?.project,
        context.payload?.inputs?.version,
      );
    default:
      return null;
  }
}

module.exports = { collectReleaseMetadata };
