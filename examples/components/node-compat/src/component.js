/**
 * The imports below are the crux of this example.
 *
 * NodeJS imports (`node:*`) are not normally available in
 * JS WebAssembly components, as the NodeJS platform is *not*
 * the same as more universal JS runtimes like WinterTC (https://wintertc.org/)
 * (In the future, componentize-js and/or StarlingMonkey will ship
 * NodeJS compatibility/support natively)
 *
 * This component uses unenv (https://github.com/unjs/unenv) and a rolldown
 * to support NodeJS imports as if they were included.
 *
 * We benefit from implementations of imports like `URL` and `Buffer`
 * that are provided by Unenv and implemented in a way that is easy for
 * any JS platform to support (unenv also offers the option of providing your
 * own custom implementation).
 *
 * See `rolldown.config.mjs` for more details.
 *
 */
import { URL } from "node:url";
import { Buffer } from "node:buffer";
import * as querystring from "node:querystring";

const TEST_URLS = [
    "https://example.com/api/users?page=1&limit=10&sort=name",
    "https://shop.example.com:8080/products/electronics?category=laptops&price_max=2000#reviews",
    "http://localhost:3000/admin/dashboard?token=abc123&debug=true",
];

export function urlParts(urlString) {
    const url = new URL(urlString);
    return {
        urlString,
        protocol: url.protocol,
        host: url.host,
        hostname: url.hostname,
        port: url.port,
        pathname: url.pathname,
        hash: url.hash,
        queries: querystring.parse(url.search.substring(1)),
    };
}

export function printUrlParts(urlParts) {
    let s = `URL: ${urlParts.urlString}\n`;
    s += `  Protocol: ${urlParts.protocol}\n`;
    s += `  Host: ${urlParts.host}\n`;
    s += `  Hostname: ${urlParts.hostname}\n`;
    s += `  Port: ${urlParts.port || "(default)"}\n`;
    s += `  Pathname: ${urlParts.pathname}\n`;
    s += `  Hash: ${urlParts.hash || "(none)"}\n`;
    s += `  Queries:\n`;
    for (const [key, value] of Object.entries(urlParts.queries)) {
        s += `    ${key}: ${value}\n`;
    }
    s += `\n`;
    return s;
}

export function printUrlBufferInfo(urlString) {
    const buffer = Buffer.from(urlString, "utf8");
    let s = "  Buffer info:";
    s += `    Length: ${buffer.length} bytes\n`;
    s += `    Hex: ${buffer.toString("hex")}\n`;
    s += `    Base64: ${buffer.toString("base64")}\n`;
    s += `\n`;
    return s;
}

// Export the `wasi:cli/run` interface
export const run = {
    run() {
        TEST_URLS.forEach((urlString) => {
            const parts = urlParts(urlString);
            console.log(printUrlParts(parts));
            console.log(printUrlBufferInfo(urlString));
        });
    },
};
