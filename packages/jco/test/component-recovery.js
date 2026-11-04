import { expect, test, vi } from "vitest";

import { generate, generateTypes, transpile } from "../src/browser.js";

const binding = vi.hoisted(() => ({
    init: Promise.resolve(),
    generate: vi.fn(),
    generateTypes: vi.fn(),
}));

vi.mock("@bytecodealliance/jco-transpile/component", () => ({
    get $init() {
        return binding.init;
    },
    generate: (...args) => binding.generate(...args),
    generateTypes: (...args) => binding.generateTypes(...args),
}));

test("queued component API requests wait for recovery after a trap", async () => {
    const trap = new WebAssembly.RuntimeError("bindgen trapped");
    let finishRecovery;
    const recovery = new Promise((resolve) => {
        finishRecovery = resolve;
    });
    binding.generate
        .mockImplementationOnce(() => {
            binding.init = recovery;
            throw trap;
        })
        .mockReturnValue("generated");
    binding.generateTypes.mockReturnValue("types");

    try {
        const failed = generate(new Uint8Array(), { name: "failed" });
        const following = transpile(new Uint8Array(), { name: "following" });
        const types = generateTypes("following", {});

        await expect(failed).rejects.toBe(trap);
        expect(binding.generate).toHaveBeenCalledTimes(1);
        expect(binding.generateTypes).not.toHaveBeenCalled();

        finishRecovery();
        await expect(following).resolves.toBe("generated");
        await expect(types).resolves.toBe("types");
        expect(binding.generate).toHaveBeenCalledTimes(2);
    } finally {
        finishRecovery();
    }
});
