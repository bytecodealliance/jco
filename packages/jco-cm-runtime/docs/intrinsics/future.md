# Future contract

Future values preserve one awaitable layer at a time. Each store selects its own
value, base endpoint, readable endpoint, writable endpoint, internal coordinator
and host wrapper constructors. Private brands and inherited static state follow
those selected classes. The two endpoints of an internal future retain the same
pending buffer record; future tables and global representations retain the actual
selected table owners.

Future read/write, cancellation, drop and transfer use operation-specific state
views and the selected error constructor. Transfer requires no current task.
Callback partial applications prepend the named context and preserve their null
receiver; bare transfer callbacks bind with `void 0`. Default implementations
use their own static dependencies. Sibling export overrides intercept a default
only when an explicit capability provides that behavior.

Custom providers migrating from the temporary bridges must supply the selected
`FutureValue` constructor to task classes, actual table/lookup owners to future
lifting, and creation/injection owner views to future lowering. The former lazy
future predicate and getters into inline future code have been removed. Stream
providers likewise supply actual stream/table owners, selected constructors and
source/injection views; temporary getters and operation forwarding bridges are removed.

[All intrinsic contracts](README.md) · [Runtime API](../runtime.md)

Endpoint lookups and removals validate the selected constructor and table, including table zero. Each copy uses its own payload and string metadata; guest-to-guest copies transfer resource ownership in either rendezvous order.
