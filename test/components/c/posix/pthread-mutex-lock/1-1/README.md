# posix pthread_mutex_lock 1-1

C reproduction of the Open POSIX Test Suite's `pthread_mutex_lock` conformance
test case 1-1:
https://github.com/bytecodealliance/wasi-sdk/blob/main/src/wasi-libc/test/open-posix-test-suite/conformance/interfaces/pthread_mutex_lock/1-1.c

The original standalone `main()` program has been adapted into a single `run`
export so it fits the `wit-bindgen c` + wasi-sdk reactor format used by the
other fixtures in `test/components/c`.

It is compiled against wasi-sdk's experimental cooperative-threading sysroot
(`share/wasi-sysroot/experimental-coop-threads`), which implements
`pthread_*` using the component model's cooperative multithreading intrinsics
(the 🧵 gate — see
https://github.com/WebAssembly/wasi-sdk/blob/main/CoopThreading.md).

jco does not yet implement these threading intrinsics (`thread.spawn` and
friends), so this fixture exists to drive that work: the JS driver test in
`packages/jco/test/extended` is expected to fail/be skipped until support
lands.

Requires wasi-sdk 34 or newer.
