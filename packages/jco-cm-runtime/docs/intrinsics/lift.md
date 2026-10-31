# Lift contract

Lift helpers consume the caller's live parameter/storage cursor. Composite metadata
contains the selected field callbacks; callbacks may return a replacement cursor.
UTF8/UTF16 codecs and variant scratch are selected once per store. Future and
stream lifts temporarily receive lazy capabilities for the remaining inline tables,
endpoints and stream class; these bridges are removed as those families migrate.
Borrowed-resource lifting and indirect error-context lifting retain their explicit
unsupported-operation errors.

[All intrinsic contracts](README.md) · [Runtime API](../runtime.md)

The general string lift retains the base runtime's compact Latin-1/UTF-16
encoding. It uses the selected UTF-16 decoder for tagged payloads, preserves
Latin-1 code points, and advances the same direct operands or memory cursor as
other flat string representations.

Invalid future/stream endpoint states retain the selected `RuntimeError` type,
including writable endpoints, non-idle endpoints and a zero stream handle.
