export default {
    plugins: [
        {
            name: 'sveltekit-adapter-node-component-compatibility',
            transform(code, id) {
                const normalizedId = id.replaceAll('\\', '/');

                if (normalizedId.endsWith('/build/env.js')) {
                    return code.replace(
                        'path.dirname(fileURLToPath(import.meta.url))',
                        "path.resolve(process.cwd(), 'build')",
                    );
                }

                if (normalizedId.includes('/build/server/')) {
                    let transformed = code
                        // jco-std's AsyncLocalStorage intentionally rejects async
                        // callbacks. SvelteKit's WebContainer path serializes
                        // requests and carries the same context without it.
                        .replaceAll('!!globalThis.process?.versions?.webcontainer', 'true')
                        .replaceAll(
                            "import('node:async_hooks')",
                            "Promise.reject(new Error('AsyncLocalStorage is unavailable in this component'))",
                        );

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
