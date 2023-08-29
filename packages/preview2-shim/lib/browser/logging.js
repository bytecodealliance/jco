const levels = ["trace", "debug", "info", "warn", "error", "critical"];

let logLevel = levels.indexOf("warn");

export const logging = {
  log(level, context, msg) {
    if (logLevel > levels.indexOf(level)) return;
    console[level](`(${context}) ${msg}\n`);
  }
};

export function setLevel(level) {
  logLevel = levels.indexOf(level);
}
