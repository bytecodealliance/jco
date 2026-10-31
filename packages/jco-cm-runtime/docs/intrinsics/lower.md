# Lower contract

Lower helpers retain the caller's live memory/storage cursor, strict numeric policy,
and selected string encoder. Compact Latin-1/UTF-16 lowering preserves the tagged
length and reads memory again after allocation, including when memory grows. Composite callbacks receive that cursor explicitly.
Future lowering uses the named owners and static default creation/injection operations.
Stream lowering retains narrow lazy capabilities until its family migrates.
Character helpers accept Unicode scalar values, including NUL and astral characters.
Error-context lowering transfers host ownership to a fresh local handle and balances
references when replacing an exhausted local entry.

[All intrinsic contracts](README.md) · [Runtime API](../runtime.md)
