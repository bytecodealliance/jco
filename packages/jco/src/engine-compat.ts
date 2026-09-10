import type { Plugin } from "rolldown";
import { parseSync, Visitor } from "rolldown/utils";
import rewritePattern from "regexpu-core";

/**
 * Lower Unicode property escapes for the pinned StarlingMonkey runtime.
 * Only parsed regex literals are edited: strings, comments and template text must
 * remain untouched. regexpu-core supplies the Unicode tables and regex semantics,
 * including negation, astral characters and v-mode set operations.
 * Dynamic RegExp constructor strings remain the application's responsibility.
 */
export function rewriteUnicodePropertyEscapes(code: string, filename = "module.js"): string | undefined {
    if (!code.includes("\\p{") && !code.includes("\\P{")) {
        return undefined;
    }
    const parsed = parseSync(filename, code);
    if (parsed.errors.length) {
        // Let the bundler report invalid source with its normal location information.
        return undefined;
    }
    const edits: Array<{ start: number; end: number; replacement: string }> = [];
    new Visitor({
        Literal(node) {
            if (!("regex" in node)) {
                return;
            }
            const { pattern, flags } = node.regex;
            if (!/[uv]/.test(flags) || !/\\[pP]\{/.test(pattern)) {
                return;
            }
            let newFlags = flags;
            const replacement = rewritePattern(pattern, flags, {
                unicodePropertyEscapes: "transform",
                unicodeSetsFlag: "transform",
                onNewFlags(value) {
                    newFlags = value;
                },
            });
            edits.push({ start: node.start, end: node.end, replacement: `/${replacement}/${newFlags}` });
        },
    }).visit(parsed.program);
    if (!edits.length) {
        return undefined;
    }
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
        code = code.slice(0, edit.start) + edit.replacement + code.slice(edit.end);
    }
    return code;
}

export function engineCompatPlugin(): Plugin {
    return {
        name: "jco-engine-compat",
        transform(code, id) {
            return rewriteUnicodePropertyEscapes(code, id) ?? null;
        },
    };
}
