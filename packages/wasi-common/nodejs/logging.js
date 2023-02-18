export function log(level, context, msg) {
  process.stdout.write(`${level}: (${context}) ${msg}\n`);
}
