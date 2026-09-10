import { dispose } from "../internal/wasi-sockets.js";
import type { TlsHost } from "./host-types.js";

function denied(): never {
  throw Object.assign(
    new Error("node:tls requires an explicitly configured jco:node/tls@0.1.0 host provider"),
    {
      code: "ERR_JCO_TLS_ADAPTER_REQUIRED",
    },
  );
}

export const isAvailable = (): boolean => false;
export const startTls: TlsHost["startTls"] = (_name, input, output) => {
  try {
    denied();
  } finally {
    dispose(output);
    dispose(input);
  }
};

export const query: TlsHost["query"] = denied;
export const setDefaultCa: TlsHost["setDefaultCa"] = denied;
export const createContext: TlsHost["createContext"] = denied;
export const releaseContext: TlsHost["releaseContext"] = () => {};
export const connect: TlsHost["connect"] = denied;
export const createServer: TlsHost["createServer"] = denied;
export const socketOperation: TlsHost["socketOperation"] = denied;
export const serverOperation: TlsHost["serverOperation"] = denied;
export const write: TlsHost["write"] = denied;
export const end: TlsHost["end"] = denied;
export const release: TlsHost["release"] = denied;

export default {
  isAvailable,
  startTls,
  query,
  setDefaultCa,
  createContext,
  releaseContext,
  connect,
  createServer,
  socketOperation,
  serverOperation,
  write,
  end,
  release,
} satisfies TlsHost;
