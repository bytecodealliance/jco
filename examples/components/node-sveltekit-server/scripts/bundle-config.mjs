export default {
    plugins: [
        {
            name: 'sveltekit-adapter-node-component-compatibility',
            transform(code, id) {
                const normalizedId = id.replaceAll('\\', '/');

                if (normalizedId.endsWith('/build/adapter-node.js')) {
                    return code
                        .replace("import { dirname } from 'node:path';", "import { resolve } from 'node:path';")
                        .replace('dirname(fileURLToPath(import.meta.url))', "resolve(process.cwd(), 'build')");
                }

                if (normalizedId.includes('/build/server/')) {
                    let transformed = code
                        // jco-std's AsyncLocalStorage intentionally rejects async
                        // callbacks. SvelteKit's WebContainer path serializes
                        // requests and carries the same context without it.
                        .replaceAll('!!globalThis.process?.versions?.webcontainer', 'true')
                        .replaceAll(
                            /import\((['"])node:async_hooks\1\)/g,
                            "Promise.reject(new Error('AsyncLocalStorage is unavailable in this component'))",
                        )
                        // jco-std throws for getBuiltinModule. Let SvelteKit's
                        // optional Node diagnostics use their non-Node fallback.
                        .replaceAll('globalThis.process?.getBuiltinModule', 'undefined')
                        // Vite retains an unused Node metadata read. Resolving
                        // import.meta after snapshotting traps in StarlingMonkey.
                        .replaceAll('import.meta.dirname;', '')
                        // StarlingMonkey lacks this Unicode property escape in
                        // dynamic regexes. Keep the equivalent range and u flag
                        // so valid surrogate pairs remain intact when escaping HTML.
                        .replaceAll(String.raw`\\p{Surrogate}`, String.raw`[\\uD800-\\uDFFF]`);

                    // StarlingMonkey does not currently implement
                    // String.prototype.normalize. SvelteKit's static asset server
                    // only applies it to generated ASCII paths in this example.
                    transformed = transformed.replace('name.normalize()', 'name');

                    return transformed === code ? null : transformed;
                }

                return null;
            },
        },
    ],
};
