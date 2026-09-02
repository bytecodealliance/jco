import { Buffer } from "node:buffer";
import stringDecoder, { StringDecoder } from "node:string_decoder";

export function run() {
    const utf8 = new StringDecoder("utf8");
    const decoded = utf8.write(Buffer.from([0x41, 0xf0, 0x9f])) + utf8.end(Buffer.from([0x8c, 0x8d]));

    const base64url = new stringDecoder.StringDecoder("base64url");
    const encoded = base64url.write(Buffer.from([0xfb])) + base64url.end(Buffer.from([0xff]));

    return JSON.stringify({ decoded, encoded, moduleIdentity: stringDecoder.StringDecoder === StringDecoder });
}
