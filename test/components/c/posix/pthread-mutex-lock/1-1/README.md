# posix pthread_mutex_lock 1-1

Port of the Open POSIX Test Suite's `pthread_mutex_lock` conformance
test case 1-1:
https://github.com/bytecodealliance/wasi-sdk/blob/main/src/wasi-libc/test/open-posix-test-suite/conformance/interfaces/pthread_mutex_lock/1-1.c

The standalone test has been adapted into a single `run` export. It is compiled
against wasi-sdk's experimental cooperative-threading sysroot
(`share/wasi-sysroot/experimental-coop-threads`).

The extended test transpiles the reactor with jco and checks that `run` returns
`PTS_PASS` (zero).

Requires wasi-sdk 34 or newer.
