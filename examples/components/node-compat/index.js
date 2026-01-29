import { URL } from "node:url";
import * as querystring from "node:querystring";

const testUrls = [
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
    console.log(`URL: ${urlParts.urlString}`);
    console.log(`  Protocol: ${urlParts.protocol}`);
    console.log(`  Host: ${urlParts.host}`);
    console.log(`  Hostname: ${urlParts.hostname}`);
    console.log(`  Port: ${urlParts.port || "(default)"}`);
    console.log(`  Pathname: ${urlParts.pathname}`);
    console.log(`  Hash: ${urlParts.hash || "(none)"}`);
    console.log(`  Queries:`);
    for (const [key, value] of Object.entries(urlParts.queries)) {
        console.log(`    ${key}: ${value}`);
    }
    console.log();
}

export function printUrlBufferInfo(urlString) {
    const buffer = Buffer.from(urlString, "utf8");
    console.log("  Buffer info:");
    console.log(`    Length: ${buffer.length} bytes`);
    console.log(`    Hex: ${buffer.toString("hex")}`);
    console.log(`    Base64: ${buffer.toString("base64")}`);
    console.log();
}

// Export the `wasi:cli/run` interface
export const run = {
    run() {
        testUrls.forEach((urlString) => {
            const parts = urlParts(urlString);
            printUrlParts(parts);
            printUrlBufferInfo(urlString);
        });
    },
};
