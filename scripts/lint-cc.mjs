import { env } from "node:process";
import { appendFile } from "node:fs/promises";

import load from "@commitlint/load";
import lint from "@commitlint/lint";
import read from "@commitlint/read";

import { default as config } from "../commitlint.config.mjs";

/**
 * Entrypoint that performs conventional commit checks on this repository
 */
async function main() {
  // Load config for the relevant project
  const opts = await load(config);

  // Figure out the start/end of the commits to check
  const start = env.COMMITLINT_START_REF;
  const end = env.COMMITLINT_END_REF;
  if (!start || !end) {
    throw new Error(`Missing/invalid start/end (${start}/${end})`);
  }

  // Get the commit messages
  const commits = await read({ to: end, from: start });

  // Lint commit messages
  let invalidCommits = [];
  for (const msg of commits) {
    console.error(`checking commit msg\n---\n${msg}\n---\n`);
    const title = msg.split("\n")[0];
    const { valid, errors, warnings } = await lint(
      title,
      opts.rules,
      opts.parserPreset ? { parserOpts: opts.parserPreset.parserOpts } : {},
    );
    if (!valid) {
      invalidCommits.push({
        title,
        errors,
        warnings,
      });
    }
  }

  await logJobOutput({
    invalidCommits,
  });
}

/** Print job output */
async function logJobOutput(output) {
  // If we're in CI, then use GITHUB_STEP_SUMMARY & GITHUB_OUTPUT
  // to produce useful output
  if (env.CI) {
    if (!env.GITHUB_STEP_SUMMARY) {
      throw new Error("Missing/invalid GITHUB_STEP_SUMMARY ENV variable in CI");
    }
    if (!env.GITHUB_OUTPUT) {
      throw new Error("Missing/invalid GITHUB_OUTPUT ENV variable in CI");
    }

    // Print all errors, if present
    const failed = output.invalidCommits.length > 0;
    if (failed) {
      output.invalidCommits.forEach((c) => {
        c.errors.forEach((e) => {
          console.log(`::error::[${e.name}]: ${e.message}`);
        });
      });
    }

    await appendFile(env.GITHUB_STEP_SUMMARY, genCIStepSummary(output));
    await appendFile(env.GITHUB_OUTPUT, `success=${!failed}\n`);
    await appendFile(env.GITHUB_OUTPUT, `fail=${failed}\n`);
    await appendFile(
      env.GITHUB_OUTPUT,
      `invalid-commit-count=${output.invalidCommits.length}\n`,
    );

    const errorRowsMd = [];
    output.invalidCommits.forEach((c) => {
      c.errors.forEach((e) => {
        errorRowsMd.push("|" + [e.name, e.message, c.title].join("|") + "|");
      });
    });
    await appendFile(
      env.GITHUB_OUTPUT,
      `error-rows-md-table<<EOF\n${errorRowsMd.join("\n")}\nEOF\n`,
    );

    const warningRowsMd = [];
    output.invalidCommits.forEach((c) => {
      c.warnings.forEach((w) => {
        warningRowsMd.push("|" + [w.name, w.message, c.title].join("|") + "|");
      });
    });
    await appendFile(
      env.GITHUB_OUTPUT,
      `warning-rows-md-table<<EOF\n${warningRowsMd.join("\n")}\nEOF\n`,
    );

    return;
  }

  // If we're not in CI, print output to STDERR
  console.error(`error? [${output.hasError}]`);

  // Print all warnings
  output.invalidCommits.forEach((c) => {
    c.warnings.forEach((w) => {
      console.error(`warning: [${w.name}]: ${w.message}`);
    });
  });

  // Print all errors
  output.invalidCommits.forEach((c) => {
    c.errors.forEach((e) => {
      console.error(`error: [${e.name}]: ${e.message}`);
    });
  });

  // Pretty print information to STDOUT
  console.log(JSON.stringify(output, 2, null));
  return;
}

/** Generate summary for CI (GitHub) step */
function genCIStepSummary(output) {
  let summary = "### Conventional Commits: ";

  summary += output.hasError ? "❌" : "✅";
  summary += "\n";

  if (output.invalidCommits.length > 0) {
    summary += "## Invalid Commits";
    output.invalidCommits.forEach((c) => {
      c.errors.forEach((e) => {
        summary += `error: [${e.name}]: ${e.message}\n`;
      });
    });

    summary += "## Warnings";
    output.invalidCommits.forEach((c) => {
      c.warnings.forEach((w) => {
        summary += `warning: [${w.name}]: ${w.message}\n`;
      });
    });
  }

  return summary;
}

await main();
