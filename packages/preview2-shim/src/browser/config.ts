let _cwd = "/";

export function _setCwd(cwd: string): void {
  _cwd = cwd;
}

export function _getCwd(): string {
  return _cwd;
}
