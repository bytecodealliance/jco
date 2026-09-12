import * as host from "jco:node/zlib@0.1.0";
import { createZlib } from "./zlib/core.js";

export type * from "./zlib/types.js";

const zlib = createZlib(host);

export default zlib;

export const {
  constants,
  codes,
  crc32,

  Deflate,
  createDeflate,
  deflate,
  deflateSync,

  Inflate,
  createInflate,
  inflate,
  inflateSync,

  Gzip,
  createGzip,
  gzip,
  gzipSync,

  Gunzip,
  createGunzip,
  gunzip,
  gunzipSync,

  DeflateRaw,
  createDeflateRaw,
  deflateRaw,
  deflateRawSync,

  InflateRaw,
  createInflateRaw,
  inflateRaw,
  inflateRawSync,

  Unzip,
  createUnzip,
  unzip,
  unzipSync,

  BrotliCompress,
  createBrotliCompress,
  brotliCompress,
  brotliCompressSync,

  BrotliDecompress,
  createBrotliDecompress,
  brotliDecompress,
  brotliDecompressSync,

  ZstdCompress,
  createZstdCompress,
  zstdCompress,
  zstdCompressSync,

  ZstdDecompress,
  createZstdDecompress,
  zstdDecompress,
  zstdDecompressSync,
} = zlib;

export type Gzip = import("./zlib/types.js").ZlibWithParams;

export type Gunzip = import("./zlib/types.js").ZlibWithParams;

export type Deflate = import("./zlib/types.js").ZlibWithParams;

export type Inflate = import("./zlib/types.js").ZlibWithParams;

export type DeflateRaw = import("./zlib/types.js").ZlibWithParams;

export type InflateRaw = import("./zlib/types.js").ZlibWithParams;

export type Unzip = import("./zlib/types.js").ZlibWithParams;

export type BrotliCompress = import("./zlib/types.js").Zlib;

export type BrotliDecompress = import("./zlib/types.js").Zlib;

export type ZstdCompress = import("./zlib/types.js").Zlib;

export type ZstdDecompress = import("./zlib/types.js").Zlib;
