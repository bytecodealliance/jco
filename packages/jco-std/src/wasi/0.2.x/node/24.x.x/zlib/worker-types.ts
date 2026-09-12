import type { MessagePort } from "node:worker_threads";
import type { Algorithm, HostOptions, Output, ZlibError } from "./types.js";

export type Command =
  | {
      op: "write";
      data: Uint8Array;
    }
  | { op: "finish" | "reset" }
  | {
      op: "flush";
      kind: number;
    }
  | {
      op: "params";
      level: number;
      strategy: number;
    };

export interface WorkerData {
  port: MessagePort;
  signal: Int32Array;
  algorithm: Algorithm;
  options: HostOptions;
}

export type Reply =
  | {
      ok: true;
      output: Output;
    }
  | {
      ok: false;
      error: ZlibError;
    };
