#![deny(clippy::all)]

use napi_derive::napi;

#[cfg(target_os = "linux")]
use std::{num::NonZeroU64, os::fd::BorrowedFd};

const INVALID_ARGUMENT_ERRNO: i32 = 22;

/// Invoke the host's `posix_fadvise` implementation.
///
/// This is an internal binding. The JavaScript wrapper validates arguments and
/// turns the returned errno into a Node-style exception.
#[napi(js_name = "fadviseRaw")]
pub fn fadvise_raw(fd: i32, offset: String, length: String, advice: String) -> i32 {
    let Ok(offset) = offset.parse::<u64>() else {
        return INVALID_ARGUMENT_ERRNO;
    };
    let Ok(length) = length.parse::<u64>() else {
        return INVALID_ARGUMENT_ERRNO;
    };

    #[cfg(target_os = "linux")]
    {
        let advice = match advice.as_str() {
            "normal" => rustix::fs::Advice::Normal,
            "sequential" => rustix::fs::Advice::Sequential,
            "random" => rustix::fs::Advice::Random,
            "will-need" => rustix::fs::Advice::WillNeed,
            "dont-need" => rustix::fs::Advice::DontNeed,
            "no-reuse" => rustix::fs::Advice::NoReuse,
            _ => return INVALID_ARGUMENT_ERRNO,
        };

        // SAFETY: The descriptor remains owned by Node.js. BorrowedFd neither
        // closes it nor extends its lifetime beyond this synchronous syscall.
        let fd = unsafe { BorrowedFd::borrow_raw(fd) };
        match rustix::fs::fadvise(fd, offset, NonZeroU64::new(length), advice) {
            Ok(()) => 0,
            Err(error) => error.raw_os_error(),
        }
    }

    // POSIX file advice is permitted to be ignored. Retain the WASI-compatible
    // no-op behavior on targets where this binding does not support fadvise.
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (fd, offset, length, advice);
        0
    }
}
