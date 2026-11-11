//! Runtime that renders every intrinsic into the generated module (the default).

use super::runtime::{IntrinsicBinding, IntrinsicRuntime, Provides};
use super::{Intrinsic, RenderIntrinsicsArgs};
use crate::source::Source;

// TODO(breaking): remove this runtime and the inline `render` functions of every
// intrinsic at the next major release, once the `embedded-cm-runtime` feature's
// bundled runtime is the only source of intrinsics.
#[derive(Debug, Default, Copy, Clone)]
pub(crate) struct InlineRuntime;

impl<F: Into<Intrinsic>> Provides<F> for InlineRuntime {
    fn binding(&self, intrinsic: F) -> IntrinsicBinding {
        IntrinsicBinding::Inline {
            local_name: intrinsic.into().name(),
        }
    }

    fn render(&self, intrinsic: F, output: &mut Source, args: &RenderIntrinsicsArgs<'_>) {
        intrinsic.into().render(output, args);
    }
}

impl IntrinsicRuntime for InlineRuntime {}
