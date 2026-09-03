if (globalThis.TextEncoder === undefined) {
    globalThis.TextEncoder = class TextEncoder {
        encode(value = "") {
            const bytes = [];
            for (const character of String(value)) {
                const point = character.codePointAt(0);
                if (point < 0x80) {
                    bytes.push(point);
                } else if (point < 0x800) {
                    bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
                } else if (point < 0x10000) {
                    bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
                } else {
                    bytes.push(
                        0xf0 | (point >> 18),
                        0x80 | ((point >> 12) & 0x3f),
                        0x80 | ((point >> 6) & 0x3f),
                        0x80 | (point & 0x3f),
                    );
                }
            }
            return Uint8Array.from(bytes);
        }
    };
}

if (globalThis.TextDecoder === undefined) {
    globalThis.TextDecoder = class TextDecoder {
        constructor(label = "utf-8") {
            this.label = label.toLowerCase();
        }

        decode(input = new Uint8Array()) {
            const bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
            if (this.label === "latin1" || this.label === "iso-8859-1") {
                return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
            }
            let output = "";
            for (let index = 0; index < bytes.length; ) {
                const first = bytes[index++];
                let point = first;
                if ((first & 0xe0) === 0xc0) {
                    point = ((first & 0x1f) << 6) | (bytes[index++] & 0x3f);
                } else if ((first & 0xf0) === 0xe0) {
                    point = ((first & 0x0f) << 12) | ((bytes[index++] & 0x3f) << 6) | (bytes[index++] & 0x3f);
                } else if ((first & 0xf8) === 0xf0) {
                    point =
                        ((first & 0x07) << 18) |
                        ((bytes[index++] & 0x3f) << 12) |
                        ((bytes[index++] & 0x3f) << 6) |
                        (bytes[index++] & 0x3f);
                }
                output += String.fromCodePoint(point);
            }
            return output;
        }
    };
}

if (globalThis.URL === undefined) {
    globalThis.URL = class URL {
        constructor(value) {
            const match = /^(https?):\/\/((?:\[[^\]]+\])|[^/:]+)(?::(\d+))?(\/.*)?$/.exec(String(value));
            if (!match) {
                throw new TypeError(`Invalid URL: ${String(value)}`);
            }
            this.protocol = `${match[1]}:`;
            this.hostname = match[2];
            this.port = match[3] ?? "";
            this.pathname = match[4] ?? "/";
        }

        get host() {
            return `${this.hostname}${this.port ? `:${this.port}` : ""}`;
        }

        get origin() {
            return `${this.protocol}//${this.host}`;
        }

        get href() {
            return `${this.origin}${this.pathname}`;
        }
    };
}
