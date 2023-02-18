export function exit(status) {
  console.log(`[exit] Exit: ${JSON.stringify(status)}`);
  process.exit(1);
}
