import zlib, { gzipSync, gunzipSync, createGzip, crc32 } from "node:zlib";
import * as namespace from "node:zlib";
import { Buffer } from "node:buffer";
import { Transform } from "node:stream";

export function run(denied) {
    if (denied) {
        const errors = [];
        for (const operation of [() => gzipSync("hello"), () => createGzip(), () => crc32("hello")]) {
            try {
                operation();
            } catch (error) {
                errors.push({ name: error.name, code: error.code });
            }
        }

        return JSON.stringify({ errors, constant: zlib.constants.Z_FINISH });
    }

    const input = Buffer.from("component zlib 💚".repeat(20));
    const codecs = [
        ["gzipSync", "gunzipSync"],
        ["deflateSync", "inflateSync"],
        ["deflateRawSync", "inflateRawSync"],
        ["brotliCompressSync", "brotliDecompressSync"],
        ["zstdCompressSync", "zstdDecompressSync"],
    ];
    const roundTrips = codecs.map(([compress, decompress]) => zlib[decompress](zlib[compress](input)).equals(input));
    const stream = createGzip();
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.write("first");
    stream.flush();
    const incremental = chunks.length > 0;
    stream.end("second");
    stream.close();
    const info = gzipSync(input, { info: true });
    let corrupt;
    try {
        gunzipSync("invalid");
    } catch (error) {
        corrupt = { name: error.name, code: error.code };
    }

    return JSON.stringify({
        identity: zlib.gzipSync === gzipSync && namespace.default === zlib,
        roundTrips,
        incremental,
        streamText: gunzipSync(Buffer.concat(chunks)).toString(),
        streamType: stream instanceof Transform && stream instanceof zlib.Gzip,
        bytesWritten: stream.bytesWritten,
        checksum: crc32("123456789"),
        info: info.engine instanceof zlib.Gzip && info.engine.bytesWritten === input.length,
        corrupt,
    });
}

export async function runAsync() {
    const input = Buffer.from("callback input");
    return await new Promise((resolve, reject) => {
        zlib.gzip(input, (error, output) => (error ? reject(error) : resolve(gunzipSync(output).equals(input))));
    });
}
