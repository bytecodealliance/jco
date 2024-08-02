import { $init, generate as _generate, generateTypes as _generateTypes } from '../obj/js-component-bindgen-component.js';

export async function generate () {
  await $init;
  return _generate.apply(this, arguments);
}

export async function generateTypes () {
  await $init;
  return _generateTypes.apply(this, arguments);
}

// for backwards compat
export { generate as transpile }
