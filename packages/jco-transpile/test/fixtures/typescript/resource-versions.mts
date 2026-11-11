import type * as Things023 from './interfaces/exports/test-versioned-things-0-2-3.js';
import type * as Things026 from './interfaces/exports/test-versioned-things-0-2-6.js';
import type * as Things030 from './interfaces/exports/test-versioned-things-0-3-0.js';
import type * as Others from './interfaces/exports/test-versioned-others.js';

declare const things023: typeof Things023;
declare const things026: typeof Things026;
declare const things030: typeof Things030;
declare const others: typeof Others;

/** Code written against one version of an interface, as a library that supports several versions has. */
function sizeOf(thing: Things023.Thing): number {
    return thing.size();
}

// Versions on one semver compatible track declare the same resource.
sizeOf(new things023.Thing());
sizeOf(new things026.Thing());
things026.take(new things023.Thing());
const constructors: (typeof Things023.Thing)[] = [things023.Thing, things026.Thing];

// @ts-expect-error a resource of a semver incompatible version is another resource
sizeOf(new things030.Thing());

// @ts-expect-error a resource of another interface is another resource, whatever its functions
sizeOf(new others.Thing());

// @ts-expect-error an object of a matching shape is not an instance of the generated class
sizeOf({ size: () => 1, [Symbol.dispose]() {} });

export { constructors };
