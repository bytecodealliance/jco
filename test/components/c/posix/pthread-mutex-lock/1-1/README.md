# posix pthread_mutex_lock 1-1

Port of the Open POSIX Test Suite's `pthread_mutex_lock` conformance
test case 1-1:
https://github.com/bytecodealliance/wasi-sdk/blob/main/src/wasi-libc/test/open-posix-test-suite/conformance/interfaces/pthread_mutex_lock/1-1.c

The original standalone `main()` program has been adapted into a single `run`
export. It is compiled against wasi-sdk's experimental cooperative-threading sysroot
(`share/wasi-sysroot/experimental-coop-threads`).

jco does not yet implement the necessary threading intrinsics; the JS driver test in
`packages/jco/test/extended` is expected to fail/be skipped until support lands.

Requires wasi-sdk 34 or newer.
