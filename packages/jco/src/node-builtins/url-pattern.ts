import { readFileSync } from "node:fs";
import rewritePattern from "regexpu-core";

const sources = new Map<string, string>();

/**
 * urlpattern-polyfill@10.1.0 uses two Unicode property escapes to lex group
 * names. StarlingMonkey's reduced ICU build cannot compile those expressions.
 * regexpu-core@6.4.0 expands only these expressions into equivalent ranges at
 * bundle time; the guest receives no regex transpiler or additional capability.
 */
export function urlPatternSource(path: string): string {
    const cached = sources.get(path);
    if (cached !== undefined) {
        return cached;
    }
    const source = readFileSync(path, "utf8").replace(
        /\/\[([^\]]*\\p\{ID_(?:Start|Continue)\}[^\]]*)\]\/u/g,
        (_match: string, characters: string) =>
            `/${rewritePattern(`[${characters}]`, "u", { unicodePropertyEscapes: "transform" })}/u`,
    );
    sources.set(path, source);
    return source;
}
