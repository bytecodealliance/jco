import { join } from "node:path";

import { suite, test, assert } from "vitest";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";

import { setupAsyncTest } from "../helpers.js";
import { LOCAL_TEST_COMPONENTS_DIR } from "../common.js";

suite("List-before-fixed-field lift (WASI P3)", () => {
    // Regression for https://github.com/bytecodealliance/jco/issues/1585:
    // lifting a record/tuple whose first field is a `list` followed by a
    // fixed-width field. The list lift repurposes the storage-length budget
    // while reading out-of-line data; the following field must still see the
    // correct remaining budget. Before the fix these calls threw while lifting
    // the `count: u32` field.
    test("record & tuple with a list before a fixed-width field lift correctly", async () => {
        const name = "lift-list-before-fixed";
        const { instance, cleanup } = await setupAsyncTest({
            component: {
                name,
                path: join(LOCAL_TEST_COMPONENTS_DIR, `${name}.wasm`),
                imports: new WASIShim().getImportObject(),
            },
        });

        assert.deepStrictEqual(await instance.getBlob(), {
            data: new Uint8Array([1, 2, 3, 4, 5]),
            count: 42,
            label: "hello",
        });

        // Empty leading list: the element buffer is zero-length, so the
        // following fixed-width field's budget must be restored from the
        // record's remaining storage rather than from the (empty) element list.
        assert.deepStrictEqual(await instance.getEmptyBlob(), {
            data: new Uint8Array([]),
            count: 7,
            label: "empty",
        });

        // Tuple variant of the same shape.
        assert.deepStrictEqual(await instance.getListThenU32(), [new Uint8Array([9, 8, 7]), 1234]);

        await cleanup();
    });
});
