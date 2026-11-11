import * as First from './one/interfaces/exports/first.js';
import * as Second from './one/interfaces/exports/second.js';
import * as OtherWorld from './two/interfaces/exports/first.js';
import * as Included from './included/interfaces/exports/first.js';
import type * as Implemented from './one/interfaces/first.js';

First.take(new First.Thing());
// @ts-expect-error inline resources copied by include belong to the including world
First.take(new Included.Thing());

// @ts-expect-error an equally shaped resource of another inline interface has its own identity
First.take(new Second.Thing());
// @ts-expect-error the same label and resource name in another world has its own identity
First.take(new OtherWorld.Thing());

// The host still supplies structural implementations for imported resources.
class HostThing {}
const hostThing: Implemented.Thing = new HostThing();
// @ts-expect-error a host implementation is not an exported resource
First.take(hostThing);
