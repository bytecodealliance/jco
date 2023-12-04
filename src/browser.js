import { $init, generate, generateTypes as _generateTypes } from '../obj/js-component-bindgen-component.js';

export async function transpile () {
  await $init;
  return generate.apply(this, arguments);
}

export async function generateTypes () {
  await $init;
  return _generateTypes.apply(this, arguments);
}
