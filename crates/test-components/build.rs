//! Build script for the test components
//!
//! Binaries named `high_*` reuse the source of another test component, but are
//! linked so that their data, stack and heap all sit above 2GiB. Every pointer
//! such a component hands to the host is then negative when read as a signed
//! 32-bit integer, which is how core wasm values arrive in JS.

use std::path::Path;

use anyhow::{Context as _, Result};

/// First address used by components that are linked high in memory (2GiB)
const HIGH_MEMORY_BASE: u32 = 1 << 31;

fn main() -> Result<()> {
    let bin_dir = Path::new("src/bin");
    println!("cargo:rerun-if-changed={}", bin_dir.display());

    for entry in std::fs::read_dir(bin_dir).context("failed to read bin dir")? {
        let path = entry.context("failed to read bin dir entry")?.path();
        let Some(bin) = path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };
        if path.extension().is_none_or(|ext| ext != "rs") || !bin.starts_with("high_") {
            continue;
        }

        // Data is placed at the base address, and without `--stack-first`
        // the stack and heap follow it
        println!("cargo:rustc-link-arg-bin={bin}=--global-base={HIGH_MEMORY_BASE}");
        println!("cargo:rustc-link-arg-bin={bin}=--no-stack-first");
    }

    Ok(())
}
