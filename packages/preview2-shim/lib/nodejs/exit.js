export function exit(status) {
  process.exit(status.tag === 'err' ? 1 : 0);
}
