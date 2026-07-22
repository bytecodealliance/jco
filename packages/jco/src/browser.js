import {
    $init,
    generate as _generate,
    generateTypes as _generateTypes,
} from "@bytecodealliance/jco-transpile/component";

export async function generate() {
    await $init;
    return _generate.apply(this, arguments);
}

export async function generateTypes() {
    await $init;
    return _generateTypes.apply(this, arguments);
}

// for backwards compat
export { generate as transpile };
