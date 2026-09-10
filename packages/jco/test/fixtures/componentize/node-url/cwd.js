import { pathToFileURL, fileURLToPath } from "node:url";

export function fromCwd(path) {
    const url = pathToFileURL(path);
    return JSON.stringify({ href: url.href, path: fileURLToPath(url) });
}
