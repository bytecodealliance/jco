export function display (timezone, when) {
  console.log(`[timezone] DISPLAY ${timezone} ${when}`);
}

export function utcOffset (timezone, when) {
  console.log(`[timezone] UTC OFFSET ${timezone} ${when}`);
  return 0;
}

export function dropTimezone (timezone) {
  console.log(`[timezone] DROP ${timezone}`);
}
