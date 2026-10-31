# Error-context contract

`intrinsics/error-context` satisfies `ErrorContextModule`. Its three initializers
return a per-store global-table class, the actual table-registration record, and
the actual nested local-table Map. The class receives only the selected
representation-table constructor. Its mutable static `data` starts at `null`;
`get()` creates storage on first use and observes later replacement of that
static slot. No component state or task capability is needed for global
reservation and reference-count adjustment, which receive only the live getter.

Local-table lookup receives its Map and selected constructor. Handle creation
and debug-message lookup receive the global getter and actual component lookup.
Debug and drop also receive the selected trap constructor for invalid handles.
New/drop receive the local-table context; transfer additionally receives
the actual registration record's component-index view. String readers/writers,
component/table locations and handles remain per-call operands. Generated table
initialization mutates the same owners consumed by these operations.

New, debug and drop trampolines keep their bound null receiver. A direct transfer
callback binds its context with an undefined receiver using `void 0`, which
cannot be shadowed by a component binding; inline output retains the
original function reference. Transfers retain source entries for later generated
cleanup while updating local/global reference counts. Default operations call
their own static dependencies, so overriding a sibling export does not intercept
their internal calls. Custom providers must publish this new subpath.

The public contract is structural and self-contained. Importing this module
creates no class, tables, maps or optional platform capabilities. State and class
initializers are selected only when their dependency graph needs them.

[All intrinsic contracts](README.md) · [Runtime API](../runtime.md)
