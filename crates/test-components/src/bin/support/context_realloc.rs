//! A `cabi_realloc` that reads and overwrites both context slots, as an allocator
//! which sets up its own stack and thread-local storage does.
//!
//! The host calls a guest's realloc as though on a fresh thread: the slots read
//! zero on entry, and whatever the call leaves in them is discarded. A task that
//! is suspended while the host lowers a value for it must find its own slots
//! unchanged when it resumes: slot 0 holds the task state of the `wit-bindgen`
//! async runtime, and slot 1 holds [`TASK_CONTEXT`].

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "$root")]
unsafe extern "C" {
    #[link_name = "[context-get-0]"]
    fn context_get_0() -> u32;
    #[link_name = "[context-get-1]"]
    fn context_get_1() -> u32;
    #[link_name = "[context-set-0]"]
    fn context_set_0(value: u32);
    #[link_name = "[context-set-1]"]
    fn context_set_1(value: u32);
}

/// What a task keeps in context slot 1 while it runs.
const TASK_CONTEXT: u32 = 22;

/// Replaces the `cabi_realloc` that `wit-bindgen` otherwise provides.
#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
unsafe extern "C" fn cabi_realloc(
    old_ptr: *mut u8,
    old_len: usize,
    align: usize,
    new_len: usize,
) -> *mut u8 {
    unsafe {
        // A fresh thread has nothing in its context slots.
        if context_get_0() != 0 || context_get_1() != 0 {
            core::arch::wasm32::unreachable();
        }

        // These values must not reach the task that the host is allocating for.
        context_set_0(97);
        context_set_1(98);

        wit_bindgen::rt::cabi_realloc(old_ptr, old_len, align, new_len)
    }
}

/// Store [`TASK_CONTEXT`] in the running task's context slot 1.
///
/// The host has already called realloc to lower the task's argument, which
/// must not have left anything in the slot.
pub fn set_task_context() {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        assert_eq!(context_get_1(), 0);
        context_set_1(TASK_CONTEXT);
    }
}

/// Check that context slot 1 of the running task still holds [`TASK_CONTEXT`].
pub fn assert_task_context() {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        assert_eq!(context_get_1(), TASK_CONTEXT);
    }
}
