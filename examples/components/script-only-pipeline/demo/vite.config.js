import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const jcoRequire = createRequire(import.meta.resolve('@bytecodealliance/jco/component'));
const bindgenDirectory = dirname(jcoRequire.resolve('@bytecodealliance/jco-transpile/component'));

export default defineConfig({
    root,
    // Jco's browser entry loads its own Wasm with import.meta.url. Leave those
    // URLs intact instead of relocating the module into Vite's dependency cache.
    optimizeDeps: { exclude: ['@bytecodealliance/jco', '@bytecodealliance/jco-transpile'] },
    server: {
        // Also serve bindgen's Wasm assets when Jco is linked from another checkout.
        fs: { allow: [searchForWorkspaceRoot(root), bindgenDirectory] },
    },
});
