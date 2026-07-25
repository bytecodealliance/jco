import {
    $init,
    generate as _generate,
    generateTypes as _generateTypes,
} from "@bytecodealliance/jco-transpile/component";

export async function generate(...args: Parameters<typeof _generate>) {
    await $init;
    return _generate(...args);
}

export async function generateTypes(...args: Parameters<typeof _generateTypes>) {
    await $init;
    return _generateTypes(...args);
}

// for backwards compat
export { generate as transpile };
