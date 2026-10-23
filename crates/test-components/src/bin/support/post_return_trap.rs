/*!
Test traps during canonical post-return cleanup.

1. Main call: the exported function returns its argument successfully.
   Trapping inside that function would exercise jco's handling around the
   main Wasm call, rather than the post-return path tested here.

2. Cleanup: the generated bindings invoke the post-return hook with the
   returned value. This scalar result needs no actual cleanup; we supply
   the hook specifically to test a failure after the export succeeds.

3. Test controls: zero lets cleanup finish normally. Any nonzero value
   deliberately executes Wasm `unreachable` inside the cleanup hook.
   These values have no special meaning to jco.

4. Current call: a cleanup trap must reach the caller as an exception or
   Promise rejection. An internally recorded result must not become a
   successful completion after cleanup has failed.

5. Subsequent calls: the cleanup trap must prevent further component
   entry. The independent `ok` export returns 42 before the trap and
   must be prevented from executing afterward.
*/

pub struct Component;

impl crate::bindings::Guest for Component {
    // An independent export used to check whether the component still accepts calls.
    fn ok() -> u32 {
        42
    }
}

// 1. Return the argument successfully; the core export itself never traps.
#[unsafe(export_name = "return-with-cleanup")]
extern "C" fn return_with_cleanup(value: u32) -> u32 {
    value
}

// 2. Run canonical post-return cleanup after the core export has returned.
// Zero completes normally; any nonzero value traps.
// The test-component build also checks native binaries, so gate this Wasm hook.
#[cfg(target_arch = "wasm32")]
#[unsafe(export_name = "cabi_post_return-with-cleanup")]
extern "C" fn post_return(value: u32) {
    if value != 0 {
        core::arch::wasm32::unreachable();
    }
}
