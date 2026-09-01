export type FsHostQuery = (requestJson: string) => string;

export interface FsHost {
  query: FsHostQuery;
}

export interface FsRequest {
  operation: string;
  args: unknown[];
}

export interface FsWireError {
  name: string;
  message: string;
  code?: string;
  errno?: number | string;
  syscall?: string;
  path?: string;
  dest?: string;
}

export interface FsSuccessResponse {
  ok: true;
  value: unknown;
}

export interface FsErrorResponse {
  ok: false;
  error: FsWireError;
}

export type FsResponse = FsSuccessResponse | FsErrorResponse;

export type FsWireTag = "bigint" | "bytes" | "date" | "undefined" | "url";

export interface FsTaggedValue {
  __jcoNodeFs: FsWireTag;
  value?: unknown;
}

export interface FsWireStats {
  __jcoNodeFs: "stats";
  values: Record<string, unknown>;
  fileType:
    | "block"
    | "character"
    | "directory"
    | "fifo"
    | "file"
    | "socket"
    | "symlink"
    | "unknown";
}

export interface FsWireDirent {
  __jcoNodeFs: "dirent";
  name: unknown;
  parentPath: string;
  fileType: FsWireStats["fileType"];
}
