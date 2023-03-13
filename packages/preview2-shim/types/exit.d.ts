export namespace Exit {
  export function exit(status: { tag: 'err' | 'ok' }): void;
}
