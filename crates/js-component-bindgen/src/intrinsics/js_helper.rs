//! Intrinsics that represent helpers that should be used from JS code

use crate::{intrinsics::Intrinsic, source::Source};

/// This enum contains intrinsics that function as JS helpers
///
/// For example, intrinsics in this enum may create global JS variables,
/// polyfills, or perform commonly used JS functionality.
#[derive(Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum JsHelperIntrinsic {
    /// A Helper function that is simply an empty function
    EmptyFunc,

    /// A helper function that creates a JS `DataView` from a given memory index
    DataView,
}

impl JsHelperIntrinsic {
    /// Retrieve dependencies for this intrinsic
    pub fn deps() -> &'static [&'static Intrinsic] {
        &[]
    }

    /// Retrieve global names for
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        ["emptyFunc", "dataView"]
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::EmptyFunc => "emptyFunc",
            Self::DataView => "dataView",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source) {
        match self {
            Self::EmptyFunc => output.push_str("
                const emptyFunc = () => {};
            "),
            Self::DataView => output.push_str("
                let dv = new DataView(new ArrayBuffer());
                const dataView = mem => dv.buffer === mem.buffer ? dv : dv = new DataView(mem.buffer);
            "),
        }
    }
}
