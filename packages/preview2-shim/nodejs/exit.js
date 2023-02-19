export function exit(status) {
  console.log(`[exit] Exit: ${JSON.stringify(status)}`);
  process.exit(status.tag === 'err' ? 1 : 0);
}
