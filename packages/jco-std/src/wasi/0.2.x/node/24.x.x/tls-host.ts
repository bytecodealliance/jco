/** Deny-by-default TLS capability; importing this module performs no IO. */
function denied(): never {
  throw Object.assign(
    new Error(
      "HTTPS over wasi:sockets requires an explicitly configured wasi:tls/types@0.2.0-draft host provider",
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
/** Availability query in Jco's local TLS contract. */
export function isAvailable(): boolean {
  return false;
}
