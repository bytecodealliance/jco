type WASIImportObject = {
  "wasi:cli/environment": typeof import("./interfaces/wasi-cli-environment.d.ts");
  "wasi:cli/exit":  typeof import("./interfaces/wasi-cli-exit.d.ts");
  "wasi:cli/stderr":  typeof import("./interfaces/wasi-cli-stderr.d.ts");
  "wasi:cli/stdin":  typeof import("./interfaces/wasi-cli-stdin.d.ts");
  "wasi:cli/stdout":  typeof import("./interfaces/wasi-cli-stdout.d.ts");
  "wasi:cli/terminal-input":  typeof import("./interfaces/wasi-cli-terminal-input.d.ts");
  "wasi:cli/terminal-output":  typeof import("./interfaces/wasi-cli-terminal-output.d.ts");
  "wasi:cli/terminal-stderr":  typeof import("./interfaces/wasi-cli-terminal-stderr.d.ts");
  "wasi:cli/terminal-stdin":  typeof import("./interfaces/wasi-cli-terminal-stdin.d.ts");
  "wasi:cli/terminal-stdout":  typeof import("./interfaces/wasi-cli-terminal-stdout.d.ts");

  "wasi:sockets/instance-network": typeof import("./interfaces/wasi-sockets-instance-network.d.ts");
  "wasi:sockets/ip-name-lookup": typeof import("./interfaces/wasi-sockets-ip-name-lookup.d.ts");
  "wasi:sockets/network": typeof import("./interfaces/wasi-sockets-network.d.ts");
  "wasi:sockets/tcp": typeof import("./interfaces/wasi-sockets-tcp.d.ts");
  "wasi:sockets/tcp-create-socket": typeof import("./interfaces/wasi-sockets-tcp-create-socket.d.ts");
  "wasi:sockets/udp": typeof import("./interfaces/wasi-sockets-udp.d.ts");
  "wasi:sockets/udp-create-socket": typeof import("./interfaces/wasi-sockets-udp-create-socket.d.ts");

  "wasi:filesystem/preopens": typeof import("./interfaces/wasi-filesystem-preopens.d.ts");
  "wasi:filesystem/types": typeof import("./interfaces/wasi-filesystem-types.d.ts");

  "wasi:io/error": typeof import("./interfaces/wasi-io-error.d.ts");
  "wasi:io/poll": typeof import("./interfaces/wasi-io-poll.d.ts");
  "wasi:io/streams": typeof import("./interfaces/wasi-io-streams.d.ts");

  "wasi:random/random": typeof import("./interfaces/wasi-random-random.d.ts");
  "wasi:random/insecure": typeof import("./interfaces/wasi-random-insecure.d.ts");
  "wasi:random/insecure-seed": typeof import("./interfaces/wasi-random-insecure-seed.d.ts");

  "wasi:clocks/monotonic-clock": typeof import("./interfaces/wasi-clocks-monotonic-clock.d.ts");
  "wasi:clocks/wall-clock": typeof import("./interfaces/wasi-clocks-wall-clock.d.ts");
}

export class WasiP2Shim {
  constructor(shims?: Partial<WASIImportObject>);
  importObject(): WASIImportObject;
}

export function imports(): WASIImportObject;
