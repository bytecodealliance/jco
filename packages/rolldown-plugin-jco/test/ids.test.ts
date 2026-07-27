import { describe, expect, test } from "vitest";

import {
    canonicalComponentId,
    componentName,
    createGeneratedId,
    createProxyId,
    parseProxyId,
    splitComponentId,
} from "../src/ids.js";

describe("component IDs", () => {
    test("normalizes query parameters and round-trips virtual proxy IDs", () => {
        const canonical = canonicalComponentId("/tmp/component.wasm", "?z=2&component=&a=1");
        expect(canonical).toBe("/tmp/component.wasm?a=1&component=&z=2");
        expect(parseProxyId(createProxyId(canonical))).toBe(canonical);
    });

    test("keeps same-basename components collision free", () => {
        const first = "/one/adder.wasm";
        const second = "/two/adder.wasm";
        expect(componentName(first, first)).not.toBe(componentName(second, second));
        expect(createGeneratedId(first)).not.toBe(createGeneratedId(second));
    });

    test("splits queries without treating question marks as paths", () => {
        expect(splitComponentId("/tmp/component.wasm?component")).toEqual({
            path: "/tmp/component.wasm",
            query: "?component",
        });
    });
});
