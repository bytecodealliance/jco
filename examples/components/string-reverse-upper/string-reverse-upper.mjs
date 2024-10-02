/**
 * This module is the JS implementation of the `revup` WIT world
 */

/**
 * The import here is *virtual*. It refers to the `import`ed `reverse` interface in component.wit.
 *
 * These types *do not resolve* when the first `string-reverse-upper` component is built,
 * but the types are relevant for the resulting *composed* component.
 */
import { reverseString } from 'example:string-reverse/reverse@0.1.0';

/**
 * Represents the implementation of the `reverse-and-uppercase` function in the `reversed-upper` interface
 *
 * This function makes use of `reverse-string` which is *imported* from another WebAssembly binary.
 */
function reverseAndUppercase(s) {
  return reverseString(s).toLocaleUpperCase();
}

/**
 * The Javascript export below represents the export of the `reversed-upper` interface,
 * which which contains `revup` as it's primary exported function.
 */
export const reversedUpper = {
  reverseAndUppercase,
};
