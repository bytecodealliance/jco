import * as First from 'first';
import * as Second from 'second';

First.take(new First.Thing());
// @ts-expect-error imported resources of distinct inline interfaces have distinct identities
First.take(new Second.Thing());
