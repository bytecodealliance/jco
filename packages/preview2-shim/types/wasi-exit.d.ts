export namespace WasiExit {
  export function exit(status: { tag: 'err' | 'ok' }): void;
}
