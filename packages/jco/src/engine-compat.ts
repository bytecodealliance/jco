import type { Plugin } from "rolldown";

/**
 * Source rewrites for regular-expression syntax the component engines do not implement.
 *
 * StarlingMonkey's SpiderMonkey is built without Unicode property escapes, so a regular
 * expression containing `\p{...}` is a *syntax* error: the module carrying one cannot be
 * parsed, and the failure arrives during pre-initialization with no useful stack. That is
 * not a rare corner -- Express 5's router reaches it through `path-to-regexp`, which uses
 * `\p{ID_Start}` and `\p{ID_Continue}` to decide which characters may appear in a route
 * parameter name.
 *
 * Each escape is replaced by the exact set of code points it matches, computed from the
 * building runtime's own Unicode tables, so the rewritten expression matches what Node
 * matches rather than an approximation of it. Where the property is unknown to the building
 * runtime, or the expression is one this cannot read confidently, the source is left alone
 * and the engine reports it as before.
 */

/** The highest code point a `u`-mode regular expression can match. */
const MAX_CODE_POINT = 0x10ffff;

/**
 * A property escape, as it appears in source.
 *
 * The name is constrained to what a Unicode property can be called, which is also what keeps
 * this away from `\p{2}` -- a quantifier applied to a literal `p` in a non-unicode
 * expression, and not a property escape at all.
 */
const PROPERTY_ESCAPE = /(?<!\\)\\([pP])\{([A-Za-z_][A-Za-z_0-9]*(?:=[A-Za-z_][A-Za-z_0-9]*)?)\}/g;

/** Inclusive code point ranges. */
type Range = [start: number, end: number];

const rangeCache = new Map<string, Range[] | undefined>();

/**
 * The code points a Unicode property matches, as inclusive ranges.
 *
 * @param property - the property as written inside `\p{...}`
 * @returns the ranges, or `undefined` when the building runtime does not know the property
 */
function propertyRanges(property: string): Range[] | undefined {
    const cached = rangeCache.get(property);
    if (cached !== undefined || rangeCache.has(property)) {
        return cached;
    }
    let matcher: RegExp;
    try {
        matcher = new RegExp(`^\\p{${property}}$`, "u");
    } catch {
        rangeCache.set(property, undefined);
        return undefined;
    }
    const ranges: Range[] = [];
    let start = -1;
    for (let codePoint = 0; codePoint <= MAX_CODE_POINT; codePoint += 1) {
        // Surrogates are never matched on their own in `u` mode, and skipping them keeps
        // them out of the ranges rather than splitting every range that spans them.
        const matches =
            codePoint >= 0xd800 && codePoint <= 0xdfff ? false : matcher.test(String.fromCodePoint(codePoint));
        if (matches && start === -1) {
            start = codePoint;
        } else if (!matches && start !== -1) {
            ranges.push([start, codePoint - 1]);
            start = -1;
        }
    }
    if (start !== -1) {
        ranges.push([start, MAX_CODE_POINT]);
    }
    rangeCache.set(property, ranges);
    return ranges;
}

/** The ranges a set does not cover. */
function complement(ranges: Range[]): Range[] {
    const inverted: Range[] = [];
    let next = 0;
    for (const [start, end] of ranges) {
        if (start > next) {
            inverted.push([next, start - 1]);
        }
        next = end + 1;
    }
    if (next <= MAX_CODE_POINT) {
        inverted.push([next, MAX_CODE_POINT]);
    }
    return inverted;
}

/** Render ranges as the body of a character class. */
function classBody(ranges: Range[]): string {
    return ranges
        .map(([start, end]) =>
            start === end ? `\\u{${start.toString(16)}}` : `\\u{${start.toString(16)}}-\\u{${end.toString(16)}}`,
        )
        .join("");
}

/**
 * Whether an escape sits inside a character class.
 *
 * Scanning back from the escape is enough: a regular expression literal cannot contain a
 * newline, so the line start bounds the search, and an unmatched `[` before the escape means
 * a class is open around it.
 */
function insideCharacterClass(code: string, index: number): boolean {
    let depth = 0;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const character = code[cursor];
        if (character === "\n") {
            return false;
        }
        if (isEscaped(code, cursor)) {
            continue;
        }
        if (character === "]") {
            depth += 1;
        } else if (character === "[") {
            if (depth === 0) {
                return true;
            }
            depth -= 1;
        } else if (character === "/" && depth === 0) {
            return false;
        }
    }
    return false;
}

/** Whether the character at `index` is preceded by an odd number of backslashes. */
function isEscaped(code: string, index: number): boolean {
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && code[cursor] === "\\"; cursor -= 1) {
        backslashes += 1;
    }
    return backslashes % 2 === 1;
}

/**
 * Whether the regular expression literal containing an escape is in Unicode mode.
 *
 * Without `u` or `v` a `\p` is a literal `p` and rewriting it would change what the
 * expression matches, so the flags decide whether the escape is rewritten at all. Scanning
 * forward to the literal's closing delimiter is bounded by the end of the line for the same
 * reason the backward scan is.
 */
function hasUnicodeFlag(code: string, index: number): boolean {
    let depth = 0;
    for (let cursor = index; cursor < code.length; cursor += 1) {
        const character = code[cursor];
        if (character === "\n") {
            return false;
        }
        if (isEscaped(code, cursor)) {
            continue;
        }
        if (character === "[") {
            depth += 1;
        } else if (character === "]") {
            depth = Math.max(0, depth - 1);
        } else if (character === "/" && depth === 0) {
            const flags = /^[a-z]*/.exec(code.slice(cursor + 1))?.[0] ?? "";
            return flags.includes("u") || flags.includes("v");
        }
    }
    return false;
}

/**
 * Rewrite the Unicode property escapes in one module.
 *
 * @param code - the module source
 * @returns the rewritten source, or `undefined` when nothing was rewritten
 */
export function rewriteUnicodePropertyEscapes(code: string): string | undefined {
    if (!code.includes("\\p{") && !code.includes("\\P{")) {
        return undefined;
    }
    let rewritten = false;
    const result = code.replace(PROPERTY_ESCAPE, (match, kind: string, property: string, offset: number) => {
        if (!hasUnicodeFlag(code, offset)) {
            return match;
        }
        const matched = propertyRanges(property);
        if (!matched) {
            return match;
        }
        const negated = kind === "P";
        const inClass = insideCharacterClass(code, offset);
        // Inside a class the escape has to become bare ranges, so a negated property becomes
        // the ranges it does not cover; outside, a class carries the negation itself.
        const ranges = negated && inClass ? complement(matched) : matched;
        rewritten = true;
        const body = classBody(ranges);
        return inClass ? body : `[${negated ? "^" : ""}${body}]`;
    });
    return rewritten ? result : undefined;
}

/**
 * A Rolldown plugin that rewrites regular-expression syntax the component engines reject.
 *
 * @returns the plugin to pass to `rolldown()`
 */
export function engineCompatPlugin(): Plugin {
    return {
        name: "jco-engine-compat",
        transform(code: string) {
            return rewriteUnicodePropertyEscapes(code) ?? null;
        },
    };
}
