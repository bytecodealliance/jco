/** Deny-by-default TLS capability; importing this module performs no IO. */
function denied(): never {
  throw Object.assign(
    new Error(
      "HTTPS over wasi:sockets requires an explicitly configured wasi:tls/types@0.2.0-draft host provider and IO version bridge",
    ),
    { code: "ERR_JCO_TLS_ADAPTER_REQUIRED" },
  );
}
export class ClientHandshake {
  constructor(_serverName: string, _input: unknown, _output: unknown) {
    denied();
  }
  static finish(_handshake: ClientHandshake): never {
    return denied();
  }
}
export class ClientConnection {
  closeOutput(): never {
    return denied();
  }
}
export class FutureClientStreams {
  get(): never {
    return denied();
  }
  subscribe(): never {
    return denied();
  }
}
/** Jco bridge operation, not part of the upstream wasi:tls interface. */
export function isAvailable(): boolean {
  return false;
}
export function adapt(_input: unknown, _output: unknown): never {
  return denied();
}
