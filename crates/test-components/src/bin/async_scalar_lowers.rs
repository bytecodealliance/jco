//! Regression fixture for the async-import result lowering of 1-byte types
//! (`bool`, `u8`, `s8`) and elementwise-lowered `list<u8>` results.
//!
//! The host runtime must write results into guest memory with their exact
//! canonical-ABI sizes: a `bool` async-import result lands in a 1-byte
//! return area allocated by wit-bindgen, and each `u8` list element lands in
//! exactly 1 byte of an exactly-sized buffer. A lowering that writes wider
//! values (e.g. a 4-byte `DataView.setUint32` per byte) silently overflows
//! those allocations and corrupts the guest heap, detonating later in a
//! layout-dependent way (dlmalloc `unlink_chunk` traps).
//!
//! To make that overflow deterministic to detect (instead of layout-luck),
//! this fixture installs a global allocator that appends a rear canary to
//! every allocation and counts violations on dealloc; `run` asserts zero
//! violations after exercising the imports.
//!
//! See `crates/js-component-bindgen/src/intrinsics/lower.rs`
//! (`_lowerFlatBool` / `_lowerFlatU8` / `_lowerFlatS8`).

mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "async-scalar-lowers",
    });
    export!(Component);
}

use bindings::exports::jco::test_components::local_run_async;
use bindings::jco::test_components::async_scalar_lowers_host as host;

mod canary_alloc {
    use core::alloc::{GlobalAlloc, Layout};
    use core::sync::atomic::{AtomicUsize, Ordering};
    use std::alloc::System;

    /// Number of allocations whose rear canary was clobbered by the time
    /// they were freed (i.e. something wrote past the end of the
    /// allocation).
    pub static VIOLATIONS: AtomicUsize = AtomicUsize::new(0);

    const REAR_BYTE: u8 = 0xC5;
    const REAR_PAD: usize = 16;

    pub struct CanaryAlloc;

    unsafe impl GlobalAlloc for CanaryAlloc {
        unsafe fn alloc(&self, l: Layout) -> *mut u8 {
            let padded = Layout::from_size_align_unchecked(l.size() + REAR_PAD, l.align());
            let p = System.alloc(padded);
            if !p.is_null() {
                core::ptr::write_bytes(p.add(l.size()), REAR_BYTE, REAR_PAD);
            }
            p
        }

        unsafe fn dealloc(&self, p: *mut u8, l: Layout) {
            for i in 0..REAR_PAD {
                if p.add(l.size() + i).read() != REAR_BYTE {
                    VIOLATIONS.fetch_add(1, Ordering::SeqCst);
                    break;
                }
            }
            let padded = Layout::from_size_align_unchecked(l.size() + REAR_PAD, l.align());
            System.dealloc(p, padded);
        }
    }
}

#[global_allocator]
static CANARY_ALLOC: canary_alloc::CanaryAlloc = canary_alloc::CanaryAlloc;

struct Component;

impl local_run_async::Guest for Component {
    async fn run() {
        use core::sync::atomic::Ordering;

        // Repeat to give the overflow multiple chances to land on a freshly
        // canaried return-area allocation.
        for _ in 0..8 {
            assert_eq!(host::get_bool().await, true);
            assert_eq!(host::get_u8().await, 0xAB);
            assert_eq!(host::get_s8().await, -5);
            assert_eq!(host::get_list_u8().await, Ok((0..32).collect::<Vec<u8>>()));
        }

        let violations = canary_alloc::VIOLATIONS.load(Ordering::SeqCst);
        assert_eq!(
            violations, 0,
            "host lowering wrote past the end of {violations} guest allocation(s) \
             (1-byte results/list elements must be written with 1-byte stores)",
        );
    }
}

fn main() {}
